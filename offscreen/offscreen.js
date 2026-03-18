// offscreen.js — Generates a clean text-based PDF from scraped content

chrome.runtime.onMessage.addListener((request) => {
  if (request.action === 'COMPILE_PDF') {
    createPDF(request.content, request.pageTitle, request.pageUrl);
  }
});

async function fetchImageAsBase64(src) {
  try {
    const response = await fetch(src, { mode: 'cors' });
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) return null;
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve({ data: reader.result, type: blob.type });
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function getImageFormat(mimeType) {
  if (mimeType.includes('png')) return 'PNG';
  if (mimeType.includes('webp')) return 'WEBP';
  if (mimeType.includes('gif')) return 'GIF';
  return 'JPEG';
}

async function createPDF(content, pageTitle, pageUrl) {
  const { jspdf } = window;

  const doc = new jspdf.jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginLeft = 15;
  const marginRight = 15;
  const marginTop = 20;
  const marginBottom = 20;
  const maxWidth = pageWidth - marginLeft - marginRight;
  let y = marginTop;

  // Pre-fetch all images in parallel
  const imageItems = content.filter(item => item.type === 'image');
  const imageCache = new Map();
  if (imageItems.length > 0) {
    chrome.runtime.sendMessage({ action: 'UPDATE_STATUS', message: `Fetching ${imageItems.length} images...` });
    const results = await Promise.allSettled(
      imageItems.map(async (item) => {
        const result = await fetchImageAsBase64(item.src);
        if (result) imageCache.set(item.src, result);
      })
    );
  }

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  const titleLines = doc.splitTextToSize(pageTitle || 'Untitled Page', maxWidth);
  for (const line of titleLines) {
    if (y + 10 > pageHeight - marginBottom) {
      doc.addPage();
      y = marginTop;
    }
    doc.text(line, marginLeft, y);
    y += 8;
  }

  // URL subtitle
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  if (y + 6 > pageHeight - marginBottom) {
    doc.addPage();
    y = marginTop;
  }
  doc.text(pageUrl || '', marginLeft, y);
  y += 4;

  // Divider line
  doc.setDrawColor(200, 200, 200);
  doc.line(marginLeft, y, pageWidth - marginRight, y);
  y += 8;

  // Reset text color
  doc.setTextColor(0, 0, 0);

  // Render content items
  for (const item of content) {
    switch (item.type) {
      case 'heading': {
        y += 4;
        const sizes = { 1: 16, 2: 14, 3: 12, 4: 11, 5: 10, 6: 10 };
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(sizes[item.level] || 12);
        const headingLines = doc.splitTextToSize(item.text, maxWidth);
        for (const line of headingLines) {
          if (y + 8 > pageHeight - marginBottom) {
            doc.addPage();
            y = marginTop;
          }
          doc.text(line, marginLeft, y);
          y += 6;
        }
        y += 2;
        break;
      }

      case 'paragraph': {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        const lines = doc.splitTextToSize(item.text, maxWidth);
        for (const line of lines) {
          if (y + 6 > pageHeight - marginBottom) {
            doc.addPage();
            y = marginTop;
          }
          doc.text(line, marginLeft, y);
          y += 5;
        }
        y += 3;
        break;
      }

      case 'list-item': {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        const bulletIndent = marginLeft + 5;
        const bulletWidth = maxWidth - 5;
        const lines = doc.splitTextToSize(item.text, bulletWidth);

        if (y + 6 > pageHeight - marginBottom) {
          doc.addPage();
          y = marginTop;
        }
        // Bullet point
        doc.text('\u2022', marginLeft, y);
        for (let i = 0; i < lines.length; i++) {
          if (y + 6 > pageHeight - marginBottom) {
            doc.addPage();
            y = marginTop;
          }
          doc.text(lines[i], bulletIndent, y);
          y += 5;
        }
        y += 1;
        break;
      }

      case 'blockquote': {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(10);
        doc.setTextColor(80, 80, 80);
        const bqIndent = marginLeft + 5;
        const bqWidth = maxWidth - 10;

        // Draw left border
        const lines = doc.splitTextToSize(item.text, bqWidth);
        const blockHeight = lines.length * 5;
        if (y + blockHeight > pageHeight - marginBottom) {
          doc.addPage();
          y = marginTop;
        }
        doc.setDrawColor(180, 180, 180);
        doc.setLineWidth(0.5);
        doc.line(marginLeft + 2, y - 3, marginLeft + 2, y + blockHeight - 1);

        for (const line of lines) {
          if (y + 6 > pageHeight - marginBottom) {
            doc.addPage();
            y = marginTop;
          }
          doc.text(line, bqIndent, y);
          y += 5;
        }
        doc.setTextColor(0, 0, 0);
        y += 3;
        break;
      }

      case 'code': {
        doc.setFont('courier', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(30, 30, 30);

        const codeIndent = marginLeft + 3;
        const codeWidth = maxWidth - 6;
        const lines = doc.splitTextToSize(item.text, codeWidth);

        for (const line of lines) {
          if (y + 5 > pageHeight - marginBottom) {
            doc.addPage();
            y = marginTop;
          }
          doc.setFillColor(245, 245, 245);
          doc.rect(marginLeft, y - 3, maxWidth, 5, 'F');
          doc.text(line, codeIndent, y);
          y += 4.5;
        }
        doc.setTextColor(0, 0, 0);
        y += 3;
        break;
      }

      case 'image': {
        const imgData = imageCache.get(item.src);
        if (imgData) {
          const format = getImageFormat(imgData.type);
          // Scale image to fit within maxWidth, preserving aspect ratio
          const aspectRatio = item.height / item.width;
          let imgWidthMm = Math.min(maxWidth, item.width * 0.264583); // px to mm
          let imgHeightMm = imgWidthMm * aspectRatio;
          // Cap height to available page space
          const maxImgHeight = pageHeight - marginTop - marginBottom - 10;
          if (imgHeightMm > maxImgHeight) {
            imgHeightMm = maxImgHeight;
            imgWidthMm = imgHeightMm / aspectRatio;
          }
          // New page if image doesn't fit
          if (y + imgHeightMm + 2 > pageHeight - marginBottom) {
            doc.addPage();
            y = marginTop;
          }
          try {
            doc.addImage(imgData.data, format, marginLeft, y, imgWidthMm, imgHeightMm);
            y += imgHeightMm + 2;
          } catch (e) {
            // Skip images that jsPDF can't handle
          }
          // Add alt text caption if present
          if (item.alt) {
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(8);
            doc.setTextColor(100, 100, 100);
            if (y + 5 > pageHeight - marginBottom) {
              doc.addPage();
              y = marginTop;
            }
            const altLines = doc.splitTextToSize(item.alt, maxWidth);
            for (const line of altLines) {
              doc.text(line, marginLeft, y);
              y += 4;
            }
            doc.setTextColor(0, 0, 0);
          }
          y += 3;
        }
        break;
      }

      case 'table': {
        doc.setFont('courier', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(20, 20, 20);

        const tableLines = item.text.split('\n');
        for (let ti = 0; ti < tableLines.length; ti++) {
          if (y + 5 > pageHeight - marginBottom) {
            doc.addPage();
            y = marginTop;
          }
          const bgColor = ti === 0 ? [220, 230, 245] : (ti % 2 === 0 ? [248, 248, 248] : [255, 255, 255]);
          doc.setFillColor(bgColor[0], bgColor[1], bgColor[2]);
          doc.rect(marginLeft, y - 3, maxWidth, 5, 'F');
          const truncated = tableLines[ti].substring(0, 200);
          doc.text(truncated, marginLeft + 2, y);
          y += 4.5;
        }
        doc.setTextColor(0, 0, 0);
        y += 3;
        break;
      }
    }
  }

  // Generate PDF
  const pdfBase64 = doc.output('datauristring');
  const safeTitle = (pageTitle || 'page').replace(/[^a-zA-Z0-9_\- ]/g, '').substring(0, 50).trim();

  chrome.runtime.sendMessage({
    action: 'DOWNLOAD_PDF',
    pdfData: pdfBase64,
    filename: `${safeTitle}.pdf`
  });
}
