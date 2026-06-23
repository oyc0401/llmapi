// background service worker는 어떤 페이지의 CSP와도 무관한 별도 실행 컨텍스트라서
// chatgpt.com 같은 CSP 제한 페이지에서도 127.0.0.1로 WebSocket 연결이 가능하다.

const SERVER_ORIGIN = 'http://127.0.0.1:3010';
const WS_URL = 'ws://127.0.0.1:3010';
const RECONNECT_DELAY_MS = 3000;
const KEEPALIVE_INTERVAL_MS = 20000; // Chrome 116+: WS로 주기적 메시지가 오가면 service worker가 종료되지 않음

let ws = null;
let keepaliveTimer = null;

function connect() {
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    console.log('[gpt-bridge] connected');
    keepaliveTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
    }, KEEPALIVE_INTERVAL_MS);
  };

  ws.onclose = () => {
    console.log('[gpt-bridge] disconnected, retrying...');
    clearInterval(keepaliveTimer);
    setTimeout(connect, RECONNECT_DELAY_MS);
  };

  ws.onerror = (err) => console.error('[gpt-bridge] error', err);

  ws.onmessage = async (event) => {
    const { text } = JSON.parse(event.data);
    console.log('[gpt-bridge] received:', text);

    await new Promise((resolve) => setTimeout(resolve, 10000));

    const answer = Array.from(text).join('-');

    await fetch(`${SERVER_ORIGIN}/gpt/response`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: answer }),
    });
    console.log('[gpt-bridge] sent response:', answer);
  };
}

connect();
