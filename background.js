// background.js — Service Worker (stateless message router)

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'PROCESS_CONTENT') {
    generatePDFOffscreen(request.content, request.pageTitle, request.pageUrl);
  }

  if (request.action === 'DOWNLOAD_PDF') {
    chrome.downloads.download({
      url: request.pdfData,
      filename: request.filename || 'page.pdf',
      saveAs: true
    }, () => {
      chrome.runtime.sendMessage({ action: 'UPDATE_STATUS', message: 'PDF Download Complete!' });
      chrome.offscreen.closeDocument().catch(() => {});
    });
  }
});

async function generatePDFOffscreen(content, pageTitle, pageUrl) {
  const offscreenUrl = chrome.runtime.getURL('offscreen/offscreen.html');

  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [offscreenUrl]
  });

  if (existingContexts.length === 0) {
    await chrome.offscreen.createDocument({
      url: 'offscreen/offscreen.html',
      reasons: ['BLOBS'],
      justification: 'Generate PDF from scraped page content via jsPDF'
    });
  }

  chrome.runtime.sendMessage({ action: 'UPDATE_STATUS', message: 'Generating PDF...' });

  chrome.runtime.sendMessage({
    action: 'COMPILE_PDF',
    content,
    pageTitle,
    pageUrl
  });
}
