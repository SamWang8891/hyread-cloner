<div align="center">

# Hyread Cloner

<img src="https://img.shields.io/badge/Version-v1.1.0-green">

一個 Tampermonkey 使用者腳本，自動翻頁並將 HyRead 電子書頁面匯出成單一 PDF 檔案。

[English Version](README.md)

</div>

---

## 免責聲明 ⚠️

本腳本僅供學習用途，使用風險請自負！

---

## 功能 ✨

- **自動翻頁**：自動按右方向鍵翻頁。
- **Blob 圖片擷取**：攔截並收集 HyRead 閱讀器產生的 blob URL 圖片。
- **PDF 匯出**：將所有收集的頁面匯出成單一 PDF 檔。
- **自動去重**：跳過已擷取的頁面，過濾縮圖和小型覆蓋圖。
- **浮動工具列**：頁面頂部的工具列，包含自動翻頁開關、匯出 PDF 和頁數計數器。

---

## 使用方式 🚀

### 安裝 ⚙️

1. 在瀏覽器中安裝 [Tampermonkey](https://www.tampermonkey.net/)。
2. 新增腳本，貼上 `hyread-cloner.user.js` 的內容。
3. 儲存並確認已啟用。

### 操作方法 📖

1. 在 [HyRead](https://service.ebook.hyread.com.tw/) 開啟一本書。
2. 頁面頂部中央會出現浮動工具列。
3. 點擊 **▶ Auto ON** 開始自動翻頁，腳本會自動翻頁並擷取圖片。
4. 完成後（或想停止時），點擊 **⏹ Auto OFF**。
5. 點擊 **📄 Export PDF** 將所有擷取的頁面下載為單一 PDF。

### 調整翻頁速度 ⏱

打開腳本，找到頂部附近這一行：

```js
let flip_page_wait_ms = 1000;
```

將 `1000`（1 秒）改成你想要的數值。例如：
- `500` → 每 0.5 秒翻一頁（較快）
- `2000` → 每 2 秒翻一頁（較慢，網路慢時更穩定）

---

## 備註 📝

- 使用 [jsPDF](https://github.com/parallax/jsPDF)（從 CDN 載入）產生 PDF。
- 小於 400×400px 的圖片會自動跳過。
- `@match *://service.ebook.hyread.com.tw/ebookservice/epubreader/*` 會匹配所有閱讀的網頁。你可以依照需要擴大範圍（`*://*/*`），例如頂層控制台不顯示的時候。

---

## 遇到問題？🙋‍♀️

遇到問題或 Bug？歡迎在 Issues 中回報。