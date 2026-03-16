// offscreen.js — Generates a clean text-based PDF from scraped content

chrome.runtime.onMessage.addListener((request) => {
  if (request.action === 'COMPILE_PDF') {
    createPDF(request.content, request.pageTitle, request.pageUrl);
  }
});

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

        // Light gray background
        const codeIndent = marginLeft + 3;
        const codeWidth = maxWidth - 6;
        const lines = doc.splitTextToSize(item.text, codeWidth);

        for (const line of lines) {
          if (y + 5 > pageHeight - marginBottom) {
            doc.addPage();
            y = marginTop;
          }
          // Background rect for each line
          doc.setFillColor(245, 245, 245);
          doc.rect(marginLeft, y - 3, maxWidth, 5, 'F');
          doc.text(line, codeIndent, y);
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
