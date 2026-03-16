document.getElementById('capture-btn').addEventListener('click', async () => {
  const statusEl = document.getElementById('status');
  statusEl.style.display = 'block';
  statusEl.innerText = 'Preparing capture...';

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Inject the content script first
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content.js']
  });

  // Small delay to ensure the content script's message listener is registered
  await new Promise(r => setTimeout(r, 200));

  chrome.tabs.sendMessage(tab.id, { action: 'START_CAPTURE' });
});

chrome.runtime.onMessage.addListener((request) => {
  if (request.action === 'UPDATE_STATUS') {
    document.getElementById('status').innerText = request.message;
  }
});
