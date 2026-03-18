(() => {
  if (window.hasRunCaptureScript) return;
  window.hasRunCaptureScript = true;

  const BLOCKED_HOSTS = [
    'youtube.com',
    'www.youtube.com',
    'm.youtube.com',
    'chatgpt.com',
    'chat.openai.com',
    'chrome.google.com'
  ];

  const hostname = window.location.hostname;
  const pathname = window.location.pathname;

  for (const host of BLOCKED_HOSTS) {
    if (hostname === host || hostname.endsWith('.' + host)) return;
  }
  if (hostname === 'www.google.com' && pathname.startsWith('/search')) return;
  if (hostname === 'google.com' && pathname.startsWith('/search')) return;

  const NOISE_ATTR = 'data-scraper-noise';

  const NOISE_RE = /\b(video|player|wistia|vimeo|youtube|widget|chat-widget|chatbot|cookie|consent|gdpr|banner|toolbar|tooltip|modal|popup|overlay|sidebar|nav-|navigation|menu|breadcrumb|pagination|share|social|comment|ad-container|ad-slot|advert|tracking|analytics|signup|signin|login|progress-bar|seekbar|playback|controls|carousel|slider|drawer|toast|snackbar|promo|newsletter|subscribe|footer-nav|site-footer|site-header|top-bar|skip-link|back-to-top)\b/i;

  const NOISE_ROLES = new Set([
    'banner', 'navigation', 'complementary', 'contentinfo',
    'search', 'form', 'dialog', 'alertdialog', 'toolbar',
    'menu', 'menubar', 'tooltip', 'status', 'log', 'marquee', 'timer'
  ]);

  const NOISE_TAGS = new Set([
    'NAV', 'FOOTER', 'HEADER', 'ASIDE', 'FORM',
    'IFRAME', 'OBJECT', 'EMBED', 'DIALOG'
  ]);

  const UI_WORDS = new Set([
    'play', 'pause', 'mute', 'unmute', 'fullscreen', 'settings',
    'quality', 'speed', 'captions', 'cc', 'hd', 'share', 'embed',
    'replay', 'skip', 'next', 'previous', 'close', 'menu', 'more',
    'loading', 'buffering', 'volume', 'enroll', 'sign in', 'log in',
    'copy', 'copied', 'copied!', 'download', 'print', 'bookmark',
    'report', 'flag', 'subscribe', 'unsubscribe', 'follow', 'unfollow'
  ]);

  function tagNoiseContainers() {
    const candidates = document.body.querySelectorAll('*');
    for (let i = 0; i < candidates.length; i++) {
      const el = candidates[i];
      if (el.hasAttribute(NOISE_ATTR)) continue;

      if (NOISE_TAGS.has(el.tagName)) {
        el.setAttribute(NOISE_ATTR, 'true');
        continue;
      }

      const role = el.getAttribute('role');
      if (role && NOISE_ROLES.has(role)) {
        el.setAttribute(NOISE_ATTR, 'true');
        continue;
      }

      const className = typeof el.className === 'string' ? el.className : '';
      const id = el.id || '';
      if ((className || id) && NOISE_RE.test(className + ' ' + id)) {
        el.setAttribute(NOISE_ATTR, 'true');
        continue;
      }

      const ariaLabel = el.getAttribute('aria-label') || '';
      if (ariaLabel && NOISE_RE.test(ariaLabel)) {
        el.setAttribute(NOISE_ATTR, 'true');
        continue;
      }

      const style = el.style;
      if (style && style.position === 'fixed' || style && style.position === 'sticky') {
        const rect = el.getBoundingClientRect();
        const viewportArea = window.innerWidth * window.innerHeight;
        const elArea = rect.width * rect.height;
        if (elArea < viewportArea * 0.5) {
          el.setAttribute(NOISE_ATTR, 'true');
          continue;
        }
      }
    }
  }

  function cleanupNoiseAttrs() {
    const tagged = document.body.querySelectorAll('[' + NOISE_ATTR + ']');
    for (let i = 0; i < tagged.length; i++) {
      tagged[i].removeAttribute(NOISE_ATTR);
    }
  }

  async function smartScroll() {
    const originalY = window.scrollY;
    const viewportH = window.innerHeight;
    let prevHeight = document.body.scrollHeight;
    let staleCount = 0;
    let currentY = 0;

    while (currentY < document.body.scrollHeight && staleCount < 3) {
      window.scrollTo(0, currentY);
      await new Promise(r => setTimeout(r, 150));

      const newHeight = document.body.scrollHeight;
      if (newHeight > prevHeight) {
        staleCount = 0;
        prevHeight = newHeight;
      } else if (currentY + viewportH >= prevHeight) {
        staleCount++;
        await new Promise(r => setTimeout(r, 300));
        const rechecked = document.body.scrollHeight;
        if (rechecked > prevHeight) {
          staleCount = 0;
          prevHeight = rechecked;
        }
      }

      currentY += viewportH;
    }

    window.scrollTo(0, originalY);
    await new Promise(r => setTimeout(r, 250));
  }

  function isHidden(el) {
    if (el.offsetParent === null && el.tagName !== 'BODY' && el.tagName !== 'HTML') {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return true;
    }
    return false;
  }

  function isJunk(text) {
    if (!text || text.length < 3) return true;
    if (text === '#') return true;
    if (/^\d{1,2}:\d{2}(\s*\/\s*\d{1,2}:\d{2})?$/.test(text)) return true;
    if (UI_WORDS.has(text.toLowerCase())) return true;
    if (/^(copy|copied!?)$/i.test(text)) return true;
    return false;
  }

  function tableToMarkdown(table) {
    const rows = [];
    const trs = table.querySelectorAll('tr');
    if (trs.length === 0) return '';

    let colCount = 0;

    for (const tr of trs) {
      const cells = [];
      const tds = tr.querySelectorAll('th, td');
      for (const td of tds) {
        const colspan = parseInt(td.getAttribute('colspan')) || 1;
        const text = td.innerText.trim().replace(/\|/g, '\\|').replace(/\n/g, ' ');
        cells.push(text);
        for (let c = 1; c < colspan; c++) cells.push('');
      }
      if (cells.length > colCount) colCount = cells.length;
      rows.push(cells);
    }

    if (colCount === 0 || rows.length === 0) return '';

    for (const row of rows) {
      while (row.length < colCount) row.push('');
    }

    const colWidths = new Array(colCount).fill(3);
    for (const row of rows) {
      for (let c = 0; c < colCount; c++) {
        if (row[c].length > colWidths[c]) colWidths[c] = row[c].length;
      }
    }

    const pad = (str, width) => str + ' '.repeat(Math.max(0, width - str.length));
    const lines = [];

    const headerRow = rows[0];
    lines.push('| ' + headerRow.map((cell, i) => pad(cell, colWidths[i])).join(' | ') + ' |');
    lines.push('| ' + colWidths.map(w => '-'.repeat(w)).join(' | ') + ' |');

    for (let r = 1; r < rows.length; r++) {
      lines.push('| ' + rows[r].map((cell, i) => pad(cell, colWidths[i])).join(' | ') + ' |');
    }

    return lines.join('\n');
  }

  function extractContent(root) {
    const items = [];
    const seen = new Set();
    const seenCode = new Set();
    const noiseSelector = '[' + NOISE_ATTR + '="true"]';

    const elements = root.querySelectorAll(
      'h1, h2, h3, h4, h5, h6, p, pre, li, blockquote, figcaption, dt, dd, table, img'
    );

    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];

      if (el.closest(noiseSelector)) continue;
      if (isHidden(el)) continue;

      const tag = el.tagName;

      if (/^H[1-6]$/.test(tag)) {
        const raw = el.innerText.trim();
        const text = raw.replace(/\s*#\s*$/, '').trim();
        if (text && !isJunk(text) && !seen.has(text)) {
          seen.add(text);
          items.push({ type: 'heading', level: parseInt(tag[1]), text });
        }
        continue;
      }

      if (tag === 'PRE') {
        const text = el.innerText.trim();
        if (text && text.length > 2) {
          const norm = text.replace(/\s+/g, ' ');
          if (!seenCode.has(norm)) {
            seenCode.add(norm);
            items.push({ type: 'code', text });
          }
        }
        continue;
      }

      if (el.closest('pre')) continue;

      if (tag === 'IMG') {
        const src = el.src || el.getAttribute('data-src') || el.getAttribute('data-lazy-src') || '';
        if (!src || src.startsWith('data:image/svg') || src.length < 5) continue;
        if (el.naturalWidth < 50 || el.naturalHeight < 50) continue;
        if (el.closest(noiseSelector)) continue;
        const alt = (el.alt || '').trim();
        if (!seen.has(src)) {
          seen.add(src);
          items.push({ type: 'image', src, alt, width: el.naturalWidth, height: el.naturalHeight });
        }
        continue;
      }

      if (tag === 'TABLE') {
        const md = tableToMarkdown(el);
        if (md && !seen.has(md)) {
          seen.add(md);
          items.push({ type: 'table', text: md });
        }
        continue;
      }

      if (tag === 'P' || tag === 'DD' || tag === 'DT' || tag === 'FIGCAPTION') {
        const text = el.innerText.trim();
        if (text && text.length > 3 && !isJunk(text) && !seen.has(text)) {
          seen.add(text);
          items.push({ type: 'paragraph', text });
        }
        continue;
      }

      if (tag === 'LI') {
        const nested = el.querySelector('ul, ol');
        let text;
        if (nested) {
          const clone = el.cloneNode(true);
          for (const sub of clone.querySelectorAll('ul, ol')) sub.remove();
          text = clone.innerText.trim();
        } else {
          text = el.innerText.trim();
        }
        if (text && text.length > 3 && !isJunk(text) && !seen.has(text)) {
          seen.add(text);
          items.push({ type: 'list-item', text });
        }
        continue;
      }

      if (tag === 'BLOCKQUOTE') {
        const text = el.innerText.trim();
        if (text && text.length > 3 && !isJunk(text) && !seen.has(text)) {
          seen.add(text);
          items.push({ type: 'blockquote', text });
        }
        continue;
      }
    }

    return items;
  }

  async function capture() {
    await smartScroll();
    tagNoiseContainers();
    const content = extractContent(document.body);
    cleanupNoiseAttrs();

    chrome.runtime.sendMessage({
      action: 'PROCESS_CONTENT',
      content: content,
      pageTitle: document.title,
      pageUrl: window.location.href
    });
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'START_CAPTURE') {
      capture();
    }
    return true;
  });
})();
