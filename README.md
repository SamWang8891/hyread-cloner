<div align="center">

# Hyread Cloner

<img src="https://img.shields.io/badge/Version-v1.0-green">

A Tampermonkey userscript that auto-flips and exports HyRead ebook pages to a single PDF file.

[台灣繁體中文 請按這](README.zh-TW.md)

</div>

---

## Disclaimer ⚠️

This script is for educational purposes only. Use at your own risk!

---

## Features ✨

- **Auto page flip**: Automatically presses the right arrow key to flip through pages.
- **Blob image capture**: Intercepts and collects blob URL images rendered by the HyRead reader.
- **PDF export**: Exports all collected pages into a single PDF file.
- **Deduplication**: Skips already-captured pages and filters out small thumbnails/overlays.
- **Floating toolbar**: Clean top-bar UI with Auto ON/OFF, Export PDF, and a page counter.

---

## Usage 🚀

### Installation ⚙️

1. Install [Tampermonkey](https://www.tampermonkey.net/) in your browser.
2. Create a new script and paste the contents of `hyread-cloner.user.js`.
3. Save and make sure it's enabled.

### How to Use 📖

1. Open a book in [HyRead](https://service.ebook.hyread.com.tw/).
2. You'll see a floating toolbar at the top center of the page.
3. Click **▶ Auto ON** to start auto-flipping. The script will flip pages and capture images automatically.
4. When done (or when you want to stop), click **⏹ Auto OFF**.
5. Click **📄 Export PDF** to download all captured pages as a single PDF.

### Changing the Flip Speed ⏱

Open the script and find this line near the top:

```js
let flip_page_wait_ms = 1000;
```

Change `1000` (1 second) to whatever you want. For example:
- `500` → flip every 0.5 seconds (faster)
- `2000` → flip every 2 seconds (slower, more reliable on slow connections)

---

## Notes 📝

- Uses [jsPDF](https://github.com/parallax/jsPDF) (loaded from CDN) for PDF generation.
- Images smaller than 400×400px are automatically skipped.
- The `@match *://*hyread*/*` matches any domain containing "hyread". You can narrow it down (e.g. `*://service.ebook.hyread.com.tw/*`) or widen it (`*://*/*`) as needed.

---


## Issues / Bugs? 🙋‍♀️

Encounter issues or bugs? Feel free to report them in Issues.