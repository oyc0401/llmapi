// chatgpt.com 콘솔에 붙여넣으면 가장 마지막(최신) "응답 복사" 버튼을 강제로 클릭해서,
// 그 버튼이 navigator.clipboard.write([ClipboardItem])로 넘기는 실제 데이터를 가로채 콘솔에 출력한다.

(() => {
  // data-testid는 "메시지 복사"(내 메시지)와 "응답 복사"(어시스턴트 응답) 버튼이 공유하므로
  // aria-label로 응답 복사 버튼만 정확히 골라낸다.
  const buttons = document.querySelectorAll(
    '[data-testid="copy-turn-action-button"][aria-label="응답 복사"]',
  );
  const lastButton = buttons[buttons.length - 1];
  if (!lastButton) {
    console.warn('복사 버튼을 찾지 못함');
    return;
  }

  const originalWrite = navigator.clipboard.write.bind(navigator.clipboard);
  navigator.clipboard.write = async (items) => {
    for (const item of items) {
      for (const type of item.types) {
        const blob = await item.getType(type);
        const text = await blob.text();
        console.log(`[복사 데이터 캡처] type=${type}`, text);
      }
    }
    return Promise.resolve();
  };

  lastButton.click();

  navigator.clipboard.write = originalWrite;
})();
