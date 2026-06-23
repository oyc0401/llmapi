// chatgpt.com 콘솔에 붙여넣으면 /backend-api/f/conversation 응답(SSE)을 가로채서
// 화면에 렌더링되기 전의 원본 마크다운 텍스트(B)를 그대로 캡처한다.
// (DOM에 보이는 텍스트(A)는 렌더링 후 마크다운 문법이 사라진 결과라 B와 다르다.)
//
// fetch를 패치하되, 응답 스트림은 tee()로 복제해서 한쪽은 페이지에 그대로 돌려주고
// (페이지 자체 렌더링이 깨지면 안 되므로) 다른 한쪽만 우리가 읽어서 파싱한다.

(() => {
  const TARGET_URL_PART = '/backend-api/f/conversation';
  const CONTENT_PATH = '/message/content/parts/0';

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
        console.log('답변완료(원본 마크다운):', text);
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
})();
