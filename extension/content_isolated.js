// chatgpt.com 페이지의 ISOLATED world(기본 content script)에 주입된다.
// chrome.* API는 isolated world에서만 쓸 수 있어서, MAIN world(content_main.js)와
// background 사이를 DOM 커스텀 이벤트로 중계하는 역할만 한다.

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'ask') {
    window.dispatchEvent(new CustomEvent('gpt-bridge:ask', { detail: { text: message.text } }));
  }
});

window.addEventListener('gpt-bridge:answer', (e) => {
  chrome.runtime.sendMessage({ type: 'answer', text: e.detail.text });
});
