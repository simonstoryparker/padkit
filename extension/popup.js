chrome.tabs.query({ active: true, currentWindow: true }, async ([tab]) => {
  try {
    const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => document.documentElement.getAttribute('data-padkit-owner') });
    document.getElementById('status').textContent = result.result ? 'Handled by this app' : 'Padkit enabled for this site';
  } catch { document.getElementById('status').textContent = 'This site is not enabled. Add it with the CLI.'; }
});
