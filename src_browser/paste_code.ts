// 이 파일은 Nest 서버 코드가 아닙니다. 빌드/실행 대상에서 제외되어 있고,
// 내용을 그대로 복사해서 브라우저 개발자도구 콘솔에 붙여넣어 사용합니다.
//
// 웹소켓에서 데이터가 오면 10초 딜레이 후에 데이터 사이사이에 -를 붙여서
// 서버에게 응답합니다. ex) 안녕하 -> 안-녕-하

(() => {
  // https 페이지에서 WebSocket의 mixed-content 체크는 'localhost'를 예외로 보지 않고
  // 숫자 루프백 주소(127.0.0.1)만 예외로 인정하므로 localhost 대신 127.0.0.1을 사용한다.
  const SERVER_ORIGIN = 'http://127.0.0.1:3010';
  const ws = new WebSocket('ws://127.0.0.1:3010');

  ws.onopen = () => console.log('[gpt-bridge] connected');
  ws.onclose = () => console.log('[gpt-bridge] disconnected');
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
})();
