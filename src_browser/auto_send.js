// chatgpt.com 콘솔에 붙여넣으면 입력창에 텍스트를 채우고 엔터로 전송한다.
// 콘솔에 그대로 붙여넣어 실행하는 코드라 TypeScript 문법(타입 어노테이션) 없이 순수 JS로 작성한다.
// ChatGPT 웹 UI의 DOM 구조(특히 #prompt-textarea)는 OpenAI가 수시로 바꾸므로,
// 동작 안 하면 devtools로 직접 셀렉터를 확인해서 고쳐야 한다.

(async () => {
  const TEXT = '안녕하세요';

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

  const input = await waitFor('#prompt-textarea');
  input.focus();

  // '/'를 입력했다가 지워서 에디터의 입력 상태를 한 번 깨운다.
  document.execCommand('insertText', false, '/');
  document.execCommand('delete', false);

  await pasteText(input, TEXT);

  // paste 이벤트로 텍스트가 실제로 들어갈 시간을 잠깐 준다.
  await new Promise((resolve) => setTimeout(resolve, 200));

  dispatchKey(input, 'Enter');
})();
