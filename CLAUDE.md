# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chrome Manifest V3 extension ("Scroll to PDF") that auto-scrolls a webpage to trigger lazy-loaded content, then generates a PDF. The current code is a minimal prototype; `blueprint.md` contains the full production architecture plan.

## Current State vs. Blueprint

The codebase has a **simple prototype** (flat file structure, uses html2pdf.js via DOM emulation) and a **detailed blueprint** (`blueprint.md`) describing the target production architecture:

- **Prototype** (`manifest.json`, `popup.html`, `popup.js`, `content.js`): Uses `chrome.tabs.sendMessage` to trigger scrolling in the content script, then calls `html2pdf()` directly on `document.body`.
- **Blueprint target**: Native viewport capture via `chrome.tabs.captureVisibleTab`, Service Worker message routing, Offscreen Document API for jsPDF-based PDF compilation, sticky/fixed element neutralization, and lazy-load detection.

## Architecture (Blueprint Target)

The production extension uses four isolated execution contexts communicating via Chrome message passing:

1. **Popup** (`popup/popup.js`) — Minimal UI trigger. Injects content script via `chrome.scripting.executeScript`, then sends `START_CAPTURE`.
2. **Content Script** (`content.js`) — Injected into the target page. Handles programmatic scrolling, lazy-load waiting (image `load`/`error` events with timeout), fixed/sticky element neutralization (opacity trick, not `display:none` to avoid layout shifts), and sends `CAPTURE_VIEWPORT` requests per scroll position.
3. **Service Worker** (`background.js`) — Stateless message router. Executes `chrome.tabs.captureVisibleTab` for native rasterization (CORS-immune, pixel-perfect), manages Offscreen Document lifecycle.
4. **Offscreen Document** (`offscreen/offscreen.js`) — Hidden DOM context for jsPDF. Receives Base64 image chunks, applies `devicePixelRatio` scaling, compiles multi-page PDF, triggers `chrome.downloads.download`.

## Key Technical Constraints

- **MV3 Service Workers have no DOM** — all canvas/Blob/jsPDF work must go through the Offscreen Document API.
- **No remotely hosted code** — jsPDF must be bundled locally in `lib/jspdf.umd.min.js`, never loaded from a CDN.
- **Required permissions**: `activeTab`, `scripting`, `offscreen`, `downloads`.
- **Fixed/sticky elements** must be neutralized with `opacity: 0` (not `display: none`) to prevent layout shifts that break scroll-height math.
- **Lazy-load handling** requires per-viewport image load detection with a ~3500ms failsafe timeout, plus a post-scroll debounce (~450ms) for SPA framework repaints.

## Loading the Extension for Development

1. Open `chrome://extensions/` in Chrome
2. Enable "Developer mode"
3. Click "Load unpacked" and select the project directory
4. After code changes, click the refresh icon on the extension card
