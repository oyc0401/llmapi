// background service worker는 어떤 페이지의 CSP와도 무관한 별도 실행 컨텍스트라서
// chatgpt.com 같은 CSP 제한 페이지에서도 127.0.0.1로 WebSocket 연결이 가능하다.
//
// 자동 시작하지 않고, 팝업의 "시작" 버튼을 눌렀을 때만 연결한다.
// 그때의 활성 탭 id를 targetTabId로 저장해둔다 (나중에 DOM 조작 메시지를 보낼 대상).

const SERVER_ORIGIN = 'http://127.0.0.1:3010';
const WS_URL = 'ws://127.0.0.1:3010';
const RECONNECT_DELAY_MS = 3000;
const KEEPALIVE_INTERVAL_MS = 20000; // Chrome 116+: WS로 주기적 메시지가 오가면 service worker가 종료되지 않음
const PONG_TIMEOUT_MS = 5000; // ping 보낸 뒤 이 시간 안에 pong이 안 오면 연결이 죽은 것으로 본다

let ws = null;
let keepaliveTimer = null;
let targetTabId = null;
let manualStop = false;
let pendingAnswerResolve = null;

// targetTabId의 content_main.js(MAIN world)에 질문을 보내고, 그쪽이 캡처한 답변(B)이
// content_isolated.js를 거쳐 'answer' 메시지로 돌아올 때까지 기다린다.
function askTab(text) {
  return new Promise((resolve) => {
    pendingAnswerResolve = resolve;
    chrome.tabs.sendMessage(targetTabId, { type: 'ask', text });
  });
}

function connect(onFirstResult) {
  manualStop = false;
  // ws.close()는 비동기라 늦게 도착하는 close 이벤트가 그 사이 새로 만들어진 연결을
  // 건드리지 않도록, socket 지역 변수로 "이게 여전히 현재 연결인지"를 구분한다.
  const socket = new WebSocket(WS_URL);
  ws = socket;

  // pong이 안 오는 좀비 연결을 감지하기 위한 상태. socket마다 별도로 가져야 해서
  // (재연결 시 새 socket의 closure에) 모듈 전역이 아니라 connect() 지역으로 둔다.
  let awaitingPong = false;
  let pongTimeoutTimer = null;

  function sendPing() {
    if (socket.readyState !== WebSocket.OPEN) return;
    awaitingPong = true;
    socket.send(JSON.stringify({ type: 'ping' }));
    pongTimeoutTimer = setTimeout(() => {
      if (awaitingPong) {
        console.warn('[gpt-bridge] pong 응답 없음 — 연결이 죽은 것으로 보고 재연결합니다');
        socket.close();
      }
    }, PONG_TIMEOUT_MS);
  }

  if (onFirstResult) {
    socket.addEventListener('open', () => onFirstResult(true), { once: true });
    socket.addEventListener('error', () => onFirstResult(false), { once: true });
  }

  socket.onopen = () => {
    console.log('[gpt-bridge] connected, target tab:', targetTabId);
    keepaliveTimer = setInterval(sendPing, KEEPALIVE_INTERVAL_MS);
  };

  socket.onclose = () => {
    if (ws !== socket) return; // 이미 교체된 stale 소켓의 늦은 close 이벤트는 무시
    console.log('[gpt-bridge] disconnected');
    clearInterval(keepaliveTimer);
    clearTimeout(pongTimeoutTimer);
    if (!manualStop) setTimeout(connect, RECONNECT_DELAY_MS);
  };

  socket.onerror = (err) => console.error('[gpt-bridge] error', err);

  socket.onmessage = async (event) => {
    const message = JSON.parse(event.data);

    if (message.type === 'pong') {
      awaitingPong = false;
      clearTimeout(pongTimeoutTimer);
      return;
    }

    const { text } = message;
    console.log('[gpt-bridge] received:', text);

    const answer = await askTab(text);
    console.log('[gpt-bridge] answer:', answer);

    await fetch(`${SERVER_ORIGIN}/gpt/response`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: answer }),
    });
    console.log('[gpt-bridge] sent response:', answer);
  };
}

function stop() {
  manualStop = true;
  targetTabId = null;
  clearInterval(keepaliveTimer);
  ws?.close();
  ws = null;
}

// 대상 탭이 진짜로 새로고침/페이지 이동되면 그 안의 content script(MAIN/ISOLATED world)
// 상태가 전부 사라지므로 targetTabId 바인딩도 더 이상 유효하지 않다고 보고 중지한다.
// chrome.tabs.onUpdated의 status:'loading'은 chatgpt.com이 새 채팅 첫 메시지를 보낼 때
// history.pushState로 /c/<id>로 바꾸는 SPA 라우팅에도 걸려서(실제 리로드가 아님) 매번
// 끊기는 문제가 있었다. webNavigation.onCommitted는 실제 문서 로드에만 발생하고
// history API 기반 이동에는 발생하지 않아서 이 구분에 정확히 맞는다.
chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId !== 0 || details.tabId !== targetTabId) return;
  console.log('[gpt-bridge] target tab reloaded/navigated, stopping');
  stop();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'start') {
    targetTabId = message.tabId;
    if (ws && ws.readyState === WebSocket.OPEN) {
      sendResponse({ ok: true, connected: true });
      return;
    }
    connect((connected) => sendResponse({ ok: true, connected }));
    return true; // 비동기로 sendResponse를 호출하겠다는 표시
  } else if (message.type === 'stop') {
    stop();
    sendResponse({ ok: true });
  } else if (message.type === 'status') {
    sendResponse({ connected: ws?.readyState === WebSocket.OPEN, tabId: targetTabId });
  } else if (message.type === 'answer') {
    pendingAnswerResolve?.(message.text);
    pendingAnswerResolve = null;
  }
});
