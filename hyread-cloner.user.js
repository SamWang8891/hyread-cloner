// ==UserScript==
// @name         Hyread Cloner
// @namespace    http://tampermonkey.net/
// @version      1.0
// @author       SamWang8891
// @description  Auto-flip and export HyRead ebook pages to PDF
// @match        *://*hyread*/*
// @grant        GM_registerMenuCommand
// @require      https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js
// @run-at       document-idle
// ==/UserScript==

(function() {
    // -----USER CUSTOM-----
    let flip_page_wait_ms = 1000;
    // ---------------------


    'use strict';

    let autoMode = false;
    let autoInterval = null;
    const collectedPages = []; // { dataUrl, width, height }
    const seenBlobs = new Set();

    // --- Intercept blob URLs ---
    const origCreateObjectURL = URL.createObjectURL;
    const capturedBlobs = new Map();

    URL.createObjectURL = function(obj) {
        const url = origCreateObjectURL.call(this, obj);
        if (obj instanceof Blob && obj.size > 5000) {
            capturedBlobs.set(url, obj);
        }
        return url;
    };

    // --- UI: floating toolbar ---
    const bar = document.createElement('div');
    bar.style.cssText = `
        position: fixed; top: 0; left: 50%; transform: translateX(-50%);
        z-index: 999999; display: flex; gap: 8px; padding: 6px 12px;
        background: rgba(0,0,0,0.85); border-radius: 0 0 8px 8px;
        font-family: sans-serif; font-size: 13px; color: #fff;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    `;

    function makeBtn(label, color) {
        const btn = document.createElement('button');
        btn.textContent = label;
        btn.style.cssText = `
            padding: 4px 12px; border: none; border-radius: 4px; cursor: pointer;
            font-size: 13px; font-weight: bold; color: #fff;
            background: ${color};
        `;
        return btn;
    }

    const btnAuto = makeBtn('▶ Auto ON', '#2ecc71');
    const btnExport = makeBtn('📄 Export PDF', '#3498db');
    const countLabel = document.createElement('span');
    countLabel.style.cssText = 'align-self: center; font-size: 12px; opacity: 0.8;';
    countLabel.textContent = '0 pages';

    bar.appendChild(btnAuto);
    bar.appendChild(btnExport);
    bar.appendChild(countLabel);
    document.body.appendChild(bar);

    function updateCount() {
        countLabel.textContent = `${collectedPages.length} pages`;
    }

    // --- Capture current visible blob images ---
    function captureCurrentPages() {
        const urls = new Set();

        document.querySelectorAll('img[src^="blob:"]').forEach(img => {
            urls.add(img.src);
        });
        document.querySelectorAll('div[style*="blob:"]').forEach(div => {
            const style = div.getAttribute('style') || '';
            const matches = style.match(/url\("?(blob:[^")\s]+)"?\)/g);
            if (matches) {
                matches.forEach(m => urls.add(m.replace(/url\("?|"?\)/g, '')));
            }
        });

        let added = 0;
        urls.forEach(url => {
            if (seenBlobs.has(url)) return;
            seenBlobs.add(url);

            // Convert blob to data URL and store
            const blob = capturedBlobs.get(url);
            if (blob) {
                blobToImage(blob).then(img => {
                    if (img) {
                        collectedPages.push(img);
                        updateCount();
                    }
                });
                added++;
            } else {
                fetch(url).then(r => r.blob()).then(b => {
                    blobToImage(b).then(img => {
                        if (img) {
                            collectedPages.push(img);
                            updateCount();
                        }
                    });
                }).catch(() => {});
                added++;
            }
        });
        return added;
    }

    function blobToImage(blob) {
        return new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = () => {
                const img = new Image();
                img.onload = () => {
                    // Only keep large images (skip thumbnails/overlays)
                    if (img.naturalWidth < 400 && img.naturalHeight < 400) {
                        console.log(`[BlobCloner] Skipped small image: ${img.naturalWidth}x${img.naturalHeight}`);
                        resolve(null);
                        return;
                    }
                    resolve({ dataUrl: reader.result, width: img.naturalWidth, height: img.naturalHeight });
                };
                img.onerror = () => resolve(null);
                img.src = reader.result;
            };
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
        });
    }

    // --- Auto mode: press right arrow every second ---
    function startAuto() {
        autoMode = true;
        btnAuto.textContent = '⏹ Auto OFF';
        btnAuto.style.background = '#e74c3c';

        // Capture initial page
        captureCurrentPages();

        autoInterval = setInterval(() => {
            // Press right arrow
            document.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'ArrowRight', code: 'ArrowRight', keyCode: 39, which: 39, bubbles: true
            }));
            document.dispatchEvent(new KeyboardEvent('keyup', {
                key: 'ArrowRight', code: 'ArrowRight', keyCode: 39, which: 39, bubbles: true
            }));

            // Wait a bit then capture
            setTimeout(() => captureCurrentPages(), 600);
        }, flip_page_wait_ms);
    }

    function stopAuto() {
        autoMode = false;
        btnAuto.textContent = '▶ Auto ON';
        btnAuto.style.background = '#2ecc71';
        if (autoInterval) {
            clearInterval(autoInterval);
            autoInterval = null;
        }
    }

    btnAuto.addEventListener('click', () => {
        if (autoMode) stopAuto();
        else startAuto();
    });

    // --- Export to PDF ---
    btnExport.addEventListener('click', () => {
        if (collectedPages.length === 0) {
            alert('No pages collected yet. Turn on Auto mode and flip through some pages first.');
            return;
        }

        stopAuto();
        btnExport.textContent = '⏳ Building PDF...';
        btnExport.disabled = true;

        setTimeout(() => {
            try {
                const { jsPDF } = window.jspdf;

                // Use first page dimensions as reference
                const first = collectedPages[0];
                const pdf = new jsPDF({
                    orientation: first.width > first.height ? 'landscape' : 'portrait',
                    unit: 'px',
                    format: [first.width, first.height]
                });

                collectedPages.forEach((page, i) => {
                    if (i > 0) {
                        pdf.addPage([page.width, page.height],
                            page.width > page.height ? 'landscape' : 'portrait');
                    }
                    pdf.addImage(page.dataUrl, 'JPEG', 0, 0, page.width, page.height);
                });

                pdf.save(`ebook-${Date.now()}.pdf`);
                btnExport.textContent = `✅ Exported ${collectedPages.length} pages`;
            } catch (e) {
                console.error('[BlobCloner] PDF export failed:', e);
                alert('PDF export failed: ' + e.message);
                btnExport.textContent = '📄 Export PDF';
            }
            btnExport.disabled = false;
        }, 100);
    });

})();