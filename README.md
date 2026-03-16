# Scroll to PDF

A Chrome extension (Manifest V3) that auto-scrolls a webpage to trigger lazy-loaded content, scrapes the text, and generates a clean, formatted PDF.

## Features

- **Auto-scroll** — Programmatically scrolls through the entire page to trigger lazy-loaded content before capture
- **Smart content extraction** — Extracts headings, paragraphs, lists, blockquotes, code blocks, and tables while filtering out navigation, ads, and UI noise
- **Clean PDF output** — Generates a well-formatted A4 PDF with proper typography, bullet points, blockquote styling, and syntax-highlighted code blocks
- **No remote code** — All dependencies (jsPDF) are bundled locally, fully compliant with MV3 restrictions

## Architecture

The extension uses four isolated execution contexts communicating via Chrome message passing:

```
Popup → Content Script → Service Worker → Offscreen Document
 (UI)    (scroll/scrape)   (message router)   (jsPDF → PDF)
```

1. **Popup** — Injects the content script and sends `START_CAPTURE`
2. **Content Script** — Scrolls the page, waits for lazy content, extracts structured text
3. **Service Worker** — Routes messages, manages the Offscreen Document lifecycle, triggers downloads
4. **Offscreen Document** — Uses jsPDF to compile extracted content into a multi-page PDF

## Installation

1. Clone this repository
2. Open `chrome://extensions/` in Chrome
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** and select the project directory

## Usage

1. Navigate to any webpage
2. Click the **Scroll to PDF** extension icon
3. Click **Capture Full Page**
4. The extension scrolls the page, extracts content, and downloads a PDF

## Permissions

| Permission | Reason |
|---|---|
| `activeTab` | Access the current tab to inject the content script |
| `scripting` | Inject the content script programmatically |
| `offscreen` | Create an offscreen document for jsPDF PDF generation |
| `downloads` | Save the generated PDF file |

## Project Structure

```
├── manifest.json            # Extension manifest (MV3)
├── background.js            # Service worker — message router
├── content.js               # Content script — scroll & scrape
├── popup/
│   ├── popup.html           # Extension popup UI
│   └── popup.js             # Popup logic
├── offscreen/
│   ├── offscreen.html       # Offscreen document
│   └── offscreen.js         # PDF generation with jsPDF
├── assets/
│   ├── icon-16.png
│   ├── icon-48.png
│   └── icon-128.png
└── lib/
    └── jspdf.umd.min.js     # Bundled jsPDF library
```

## License

MIT
