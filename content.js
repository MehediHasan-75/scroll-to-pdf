// content.js — Scrapes page content and sends to service worker for PDF generation
(() => {
  if (window.hasRunCaptureScript) return;
  window.hasRunCaptureScript = true;

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'START_CAPTURE') {
      scrapePage();
    }
    return true;
  });

  function scrapePage() {
    autoScrollThenScrape();
  }

  async function autoScrollThenScrape() {
    const totalHeight = Math.max(
      document.body.scrollHeight, document.documentElement.scrollHeight
    );
    const viewportHeight = window.innerHeight;
    const originalScrollY = window.scrollY;

    // Scroll through the page to load lazy content
    let currentY = 0;
    while (currentY < totalHeight) {
      window.scrollTo(0, currentY);
      await new Promise(r => setTimeout(r, 200));
      currentY += viewportHeight;
    }

    window.scrollTo(0, originalScrollY);
    await new Promise(r => setTimeout(r, 300));

    const content = extractContent(document.body);

    chrome.runtime.sendMessage({
      action: 'PROCESS_CONTENT',
      content: content,
      pageTitle: document.title,
      pageUrl: window.location.href
    });
  }

  // Tags to skip entirely (reject subtree)
  const SKIP_TAGS = new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'IFRAME', 'NAV', 'FOOTER',
    'HEADER', 'ASIDE', 'FORM', 'INPUT', 'SELECT', 'TEXTAREA', 'BUTTON',
    'VIDEO', 'AUDIO', 'CANVAS', 'OBJECT', 'EMBED', 'MAP', 'AREA'
  ]);

  // Tags that contain inline content (skip when walking to avoid fragment duplication)
  const INLINE_TAGS = new Set([
    'SPAN', 'A', 'STRONG', 'EM', 'B', 'I', 'U', 'MARK', 'SMALL',
    'SUB', 'SUP', 'ABBR', 'CITE', 'Q', 'VAR', 'SAMP', 'KBD', 'TIME',
    'DATA', 'DEL', 'INS', 'S', 'WBR', 'BDO', 'BDI', 'RUBY', 'RT', 'RP'
  ]);

  const NOISE_PATTERNS = [
    /video/i, /player/i, /wistia/i, /vimeo/i, /youtube/i,
    /widget/i, /chat/i, /cookie/i, /consent/i, /banner/i,
    /toolbar/i, /tooltip/i, /modal/i, /popup/i, /overlay/i,
    /sidebar/i, /menu/i, /breadcrumb/i, /pagination/i,
    /share/i, /social/i, /comment/i, /ad-/i,
    /tracking/i, /analytics/i, /signup/i, /signin/i, /login/i,
    /progress-bar/i, /seekbar/i, /playback/i, /controls/i,
    /carousel/i, /slider/i
  ];

  function isNoiseElement(node) {
    const className = node.className || '';
    const id = node.id || '';
    const role = node.getAttribute ? (node.getAttribute('role') || '') : '';
    const combined = `${className} ${id} ${role}`;

    for (const pattern of NOISE_PATTERNS) {
      if (pattern.test(combined)) return true;
    }
    return false;
  }

  function isJunkText(text) {
    if (!text || text.length < 3) return true;
    // Exact match "COPY" (clipboard button)
    if (text === 'COPY' || text === 'Copy') return true;
    // Timestamps
    if (/^\d{1,2}:\d{2}(\s*\/\s*\d{1,2}:\d{2})?$/.test(text)) return true;
    // UI control words
    const uiWords = new Set(['play', 'pause', 'mute', 'unmute', 'fullscreen', 'settings',
      'quality', 'speed', 'captions', 'cc', 'hd', 'share', 'embed',
      'replay', 'skip', 'next', 'previous', 'close', 'menu', 'more',
      'loading', 'buffering', 'volume', 'enroll', 'sign in', 'log in',
      'copy', 'copied', 'copied!']);
    if (uiWords.has(text.toLowerCase())) return true;
    return false;
  }

  // Check if node is inside a PRE or CODE ancestor
  function isInsideCodeBlock(node) {
    let parent = node.parentElement;
    while (parent) {
      if (parent.tagName === 'PRE' || parent.tagName === 'CODE') return true;
      parent = parent.parentElement;
    }
    return false;
  }

  function extractContent(root) {
    const items = [];
    const seen = new Set();
    // Track code block text to deduplicate copy-button duplicates
    const seenCodeTexts = new Set();

    const elements = root.querySelectorAll('h1, h2, h3, h4, h5, h6, p, pre, li, blockquote, figcaption, dl, dt, dd, table');

    for (const el of elements) {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        continue;
      }

      // Skip if inside a noise container
      if (el.closest && isNoiseContainer(el)) continue;

      const tag = el.tagName;

      // Headings
      if (/^H[1-6]$/.test(tag)) {
        const text = el.innerText.trim();
        if (text && !isJunkText(text) && !seen.has(text)) {
          // Skip lone "#" anchor links that Node.js docs use
          if (text === '#') continue;
          // Clean trailing " #" from headings
          const cleanText = text.replace(/\s*#\s*$/, '').trim();
          if (cleanText && !seen.has(cleanText)) {
            seen.add(cleanText);
            items.push({ type: 'heading', level: parseInt(tag[1]), text: cleanText });
          }
        }
        continue;
      }

      // Code blocks (PRE)
      if (tag === 'PRE') {
        const text = el.innerText.trim();
        if (text && text.length > 2) {
          // Deduplicate: many sites have duplicate PRE for copy-to-clipboard
          // Normalize whitespace for comparison
          const normalized = text.replace(/\s+/g, ' ');
          if (!seenCodeTexts.has(normalized)) {
            seenCodeTexts.add(normalized);
            items.push({ type: 'code', text });
          }
        }
        continue;
      }

      // Skip elements that are inside a PRE (already captured above)
      if (isInsideCodeBlock(el)) continue;

      // Paragraphs
      if (tag === 'P') {
        const text = el.innerText.trim();
        if (text && text.length > 3 && !isJunkText(text) && !seen.has(text)) {
          seen.add(text);
          items.push({ type: 'paragraph', text });
        }
        continue;
      }

      // List items
      if (tag === 'LI') {
        const text = el.innerText.trim();
        if (text && text.length > 3 && !isJunkText(text) && !seen.has(text)) {
          seen.add(text);
          items.push({ type: 'list-item', text });
        }
        continue;
      }

      // Blockquotes
      if (tag === 'BLOCKQUOTE') {
        const text = el.innerText.trim();
        if (text && text.length > 3 && !isJunkText(text) && !seen.has(text)) {
          seen.add(text);
          items.push({ type: 'blockquote', text });
        }
        continue;
      }

      // Definition terms/descriptions
      if (tag === 'DT' || tag === 'DD') {
        const text = el.innerText.trim();
        if (text && text.length > 3 && !isJunkText(text) && !seen.has(text)) {
          seen.add(text);
          items.push({ type: 'paragraph', text });
        }
        continue;
      }

      // Figcaptions
      if (tag === 'FIGCAPTION') {
        const text = el.innerText.trim();
        if (text && text.length > 3 && !seen.has(text)) {
          seen.add(text);
          items.push({ type: 'paragraph', text });
        }
        continue;
      }

      // Tables - convert to text
      if (tag === 'TABLE') {
        const text = tableToText(el);
        if (text && !seen.has(text)) {
          seen.add(text);
          items.push({ type: 'code', text }); // render as monospace
        }
        continue;
      }
    }

    return items;
  }

  function isNoiseContainer(el) {
    let node = el;
    while (node && node !== document.body) {
      if (isNoiseElement(node)) return true;
      node = node.parentElement;
    }
    return false;
  }

  function tableToText(table) {
    const rows = [];
    for (const tr of table.querySelectorAll('tr')) {
      const cells = [];
      for (const td of tr.querySelectorAll('th, td')) {
        cells.push(td.innerText.trim());
      }
      rows.push(cells.join('  |  '));
    }
    return rows.join('\n');
  }
})();
