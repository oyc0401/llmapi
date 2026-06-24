// chatgpt.com 페이지의 MAIN world에 주입된다 (manifest.json content_scripts, world: "MAIN").
// isolated world(content_isolated.js)와는 DOM 커스텀 이벤트로 통신한다 (MAIN world는 chrome.* API를 못 씀).
//
// 1) /backend-api/f/conversation 응답(SSE)을 가로채 렌더링 전 원본 마크다운(B)을 캡처해서
//    'gpt-bridge:answer' 이벤트로 쏜다. (DOM에 보이는 텍스트(A)는 렌더링 후 마크다운 문법이
//    사라진 결과라 B와 다르다.)
// 2) 'gpt-bridge:ask' 이벤트를 받으면 입력창에 텍스트를 채우고 엔터로 전송한다.

(() => {
  const TARGET_URL_PART = '/backend-api/f/conversation';
  const CONTENT_PATH = '/message/content/parts/0';

  // session id는 URL의 대화 UUID 앞 8자리로 정한다 (예: /c/6a3b91bf-... -> 6a3b91bf).
  // 새 채팅 직후처럼 아직 대화가 생성되기 전(/)에는 UUID가 없어서 null을 반환한다.
  function getCurrentSessionId() {
    const match = location.pathname.match(/\/c\/([0-9a-f]{8})/i);
    return match ? match[1] : null;
  }

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (...args) => {
    const response = await originalFetch(...args);

    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url ?? '';
    if (!url.includes(TARGET_URL_PART) || !response.body) {
      return response;
    }

    const [forPage, forCapture] = response.body.tee();
    captureStream(forCapture);

    return new Response(forPage, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  };

  async function captureStream(stream) {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let text = '';
    let lastPath = null;
    let lastOp = null;

    const applyOp = (op) => {
      const path = op.p !== undefined ? op.p : lastPath;
      const kind = op.o !== undefined ? op.o : lastOp;
      lastPath = path;
      lastOp = kind;

      if (kind === 'patch' && Array.isArray(op.v)) {
        op.v.forEach(applyOp);
        return;
      }
      if (kind === 'append' && path === CONTENT_PATH && typeof op.v === 'string') {
        text += op.v;
      }
      // 빈 메시지(예: 사전 확인용 메시지)가 먼저 finished_successfully로 끝나는 경우가 있어서
      // 텍스트가 실제로 쌓인 경우만 완료로 취급한다.
      if (path === '/message/status' && op.v === 'finished_successfully' && text) {
        window.dispatchEvent(
          new CustomEvent('gpt-bridge:answer', { detail: { text, session: getCurrentSessionId() } }),
        );
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          applyOp(JSON.parse(payload));
        } catch {
          // JSON이 아닌 control 라인은 무시
        }
      }
    }
  }

  function waitFor(selector, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(selector);
      if (existing) {
        resolve(existing);
        return;
      }

      const observer = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) {
          observer.disconnect();
          resolve(el);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });

      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`'${selector}'를 ${timeoutMs}ms 동안 찾지 못함`));
      }, timeoutMs);
    });
  }

  function dispatchKey(el, key) {
    const opts = { key, bubbles: true, cancelable: true };
    el.dispatchEvent(new KeyboardEvent('keydown', opts));
    el.dispatchEvent(new KeyboardEvent('keypress', opts));
    el.dispatchEvent(new KeyboardEvent('keyup', opts));
  }

  async function pasteText(el, text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // 클립보드 쓰기 권한이 없어도 아래 paste 이벤트 자체는 동작하므로 무시한다.
    }

    const dataTransfer = new DataTransfer();
    dataTransfer.setData('text/plain', text);
    el.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: dataTransfer, bubbles: true, cancelable: true }),
    );
  }

  async function sendText(text) {
    const input = await waitFor('#prompt-textarea');
    input.focus();

    // '/'를 입력했다가 지워서 에디터의 입력 상태를 한 번 깨운다.
    document.execCommand('insertText', false, '/');
    document.execCommand('delete', false);

    await pasteText(input, text);

    // paste 이벤트로 텍스트가 실제로 들어갈 시간을 잠깐 준다.
    await new Promise((resolve) => setTimeout(resolve, 200));

    dispatchKey(input, 'Enter');
  }

  window.addEventListener('gpt-bridge:ask', (e) => {
    sendText(e.detail.text);
  });

  // 사이드바의 실제 "새 채팅" 링크를 직접 클릭한다. 새로 만든 <a> 태그를 클릭하면
  // React가 핸들러를 안 붙여놔서 진짜 페이지 이동이 일어나지만, 이미 DOM에 있는 이
  // 엘리먼트를 클릭하면 Next.js가 pushState로 처리해서 페이지 리로드가 없다.
  window.addEventListener('gpt-bridge:new-chat', () => {
    const button = document.querySelector('[data-testid="create-new-chat-button"]');
    if (!button) {
      console.warn('[gpt-bridge] 새 채팅 버튼을 찾지 못함');
      return;
    }
    button.click();
    window.dispatchEvent(new CustomEvent('gpt-bridge:new-chat-done'));
  });
})();
