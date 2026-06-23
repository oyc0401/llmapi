const statusEl = document.getElementById('status');
const toggleBtn = document.getElementById('toggle');

async function render() {
  const { connected, tabId } = await chrome.runtime.sendMessage({ type: 'status' });
  statusEl.textContent = connected ? `연결됨 (대상 탭 #${tabId})` : '연결 안 됨';
  toggleBtn.textContent = connected ? '중지' : '시작';
}

toggleBtn.addEventListener('click', async () => {
  const { connected } = await chrome.runtime.sendMessage({ type: 'status' });
  if (connected) {
    await chrome.runtime.sendMessage({ type: 'stop' });
  } else {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.runtime.sendMessage({ type: 'start', tabId: tab.id });
  }
  render();
});

render();
