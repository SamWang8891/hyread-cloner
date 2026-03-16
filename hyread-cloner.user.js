// ==UserScript==
// @name Hyread Cloner
// @namespace http://tampermonkey.net/
// @version 1.1.0
// @author SamWang8891
// @description Auto-flip and export HyRead ebook pages to PDF
// @match *://service.ebook.hyread.com.tw/ebookservice/epubreader/*
// @grant GM_registerMenuCommand
// @require https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js
// @run-at document-start
// ==/UserScript==

(function() {
    'use strict';

    // -----USER CUSTOM-----
    let flip_page_wait_ms = 1000;
    // ---------------------

    let autoMode = false;
    let autoInterval = null;
    const collectedPages = []; // { dataUrl, width, height, key }
    const seenKeys = new Set();

    // =============================================
    // Extract asset_id for correct image URL base
    // =============================================
    const urlParams = new URLSearchParams(window.location.search);
    const assetId = urlParams.get('asset_id') || '';
    // Real image base: /ebookservice/epub/{asset_id}/item/
    const imageBase = assetId
        ? `https://service.ebook.hyread.com.tw/ebookservice/epub/${assetId}/item/`
        : '';

    console.log(`[HyreadCloner] asset_id: ${assetId}`);
    console.log(`[HyreadCloner] Image base: ${imageBase}`);

    // =============================================
    // Intercept blob URLs
    // =============================================
    const origCreateObjectURL = URL.createObjectURL;
    const capturedBlobs = new Map();

    URL.createObjectURL = function(obj) {
        const url = origCreateObjectURL.call(this, obj);
        if (obj instanceof Blob && obj.size > 5000) {
            capturedBlobs.set(url, obj);
        }
        return url;
    };

    // =============================================
    // Intercept fetch() for image URLs
    // =============================================
    function patchFetch(win) {
        if (win.__hyreadFetchPatched) return;
        win.__hyreadFetchPatched = true;

        const origFetch = win.fetch;
        win.fetch = function(...args) {
            const result = origFetch.apply(this, args);
            const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';

            if (/\.(jpg|jpeg|png|webp)(\?|$)/i.test(url) && !url.includes('thumbnail') && !url.includes('icon')) {
                result.then(resp => {
                    if (!resp.ok) return;
                    const cloned = resp.clone();
                    cloned.blob().then(blob => {
                        if (blob.size > 5000) {
                            const key = url.split('?')[0];
                            if (!seenKeys.has(key)) {
                                seenKeys.add(key);
                                blobToImage(blob).then(img => {
                                    if (img) {
                                        img.key = key;
                                        collectedPages.push(img);
                                        updateCount();
                                        console.log(`[HyreadCloner] Intercepted fetch: ${key} (${img.width}x${img.height})`);
                                    }
                                });
                            }
                        }
                    });
                }).catch(() => {});
            }
            return result;
        };
    }

    // =============================================
    // Intercept XMLHttpRequest
    // =============================================
    function patchXHR(win) {
        if (win.__hyreadXHRPatched) return;
        win.__hyreadXHRPatched = true;

        const origOpen = win.XMLHttpRequest.prototype.open;
        const origSend = win.XMLHttpRequest.prototype.send;

        win.XMLHttpRequest.prototype.open = function(method, url, ...rest) {
            this.__hyreadUrl = url;
            return origOpen.call(this, method, url, ...rest);
        };

        win.XMLHttpRequest.prototype.send = function(...args) {
            const url = this.__hyreadUrl || '';
            if (/\.(jpg|jpeg|png|webp)(\?|$)/i.test(url) && !url.includes('thumbnail') && !url.includes('icon')) {
                this.addEventListener('load', function() {
                    try {
                        const blob = this.response instanceof Blob
                            ? this.response
                            : new Blob([this.response], { type: this.getResponseHeader('content-type') || 'image/jpeg' });
                        if (blob.size > 5000) {
                            const key = url.split('?')[0];
                            if (!seenKeys.has(key)) {
                                seenKeys.add(key);
                                blobToImage(blob).then(img => {
                                    if (img) {
                                        img.key = key;
                                        collectedPages.push(img);
                                        updateCount();
                                        console.log(`[HyreadCloner] Intercepted XHR: ${key} (${img.width}x${img.height})`);
                                    }
                                });
                            }
                        }
                    } catch (e) {}
                });
            }
            return origSend.apply(this, args);
        };
    }

    // Patch main window immediately
    patchFetch(window);
    patchXHR(window);

    // =============================================
    // Patch iframes as they appear
    // =============================================
    function patchIframe(iframe) {
        try {
            const win = iframe.contentWindow;
            if (!win) return;
            patchFetch(win);
            patchXHR(win);
        } catch (e) {}
    }

    const iframeObserver = new MutationObserver(mutations => {
        for (const m of mutations) {
            for (const node of m.addedNodes) {
                if (node.nodeName === 'IFRAME') {
                    patchIframe(node);
                    node.addEventListener('load', () => patchIframe(node));
                }
                if (node.querySelectorAll) {
                    node.querySelectorAll('iframe').forEach(f => {
                        patchIframe(f);
                        f.addEventListener('load', () => patchIframe(f));
                    });
                }
            }
        }
    });

    // =============================================
    // Periodic iframe content scan — resolve URLs
    // using the correct epub base path
    // =============================================
    function resolveImageHref(href, iframe) {
        if (!href || href.startsWith('data:') || href.startsWith('blob:')) return null;

        // If it's already absolute, use as-is
        if (href.startsWith('http://') || href.startsWith('https://')) return href;

        // Use our known imageBase to resolve relative paths like "../image/i-012.jpg"
        if (imageBase) {
            // Strip leading ../ — the SVG is in something like /item/xhtml/page.xhtml
            // and references ../image/i-012.jpg → /item/image/i-012.jpg
            const cleaned = href.replace(/^(\.\.\/)+/, '');
            return imageBase + cleaned;
        }

        // Fallback: resolve against iframe location
        try {
            const base = iframe.contentWindow?.location?.href || iframe.src || window.location.href;
            return new URL(href, base).href;
        } catch (e) {
            return null;
        }
    }

    function scanIframeContents() {
        document.querySelectorAll('iframe').forEach(iframe => {
            let doc;
            try {
                doc = iframe.contentDocument || iframe.contentWindow?.document;
            } catch (e) { return; }
            if (!doc) return;

            // SVG <image> with xlink:href
            doc.querySelectorAll('image').forEach(img => {
                const href = img.getAttributeNS('http://www.w3.org/1999/xlink', 'href')
                    || img.getAttribute('xlink:href')
                    || img.getAttribute('href');
                const fullUrl = resolveImageHref(href, iframe);
                if (!fullUrl) return;

                const key = fullUrl.split('?')[0];
                if (seenKeys.has(key)) return;
                seenKeys.add(key);

                console.log(`[HyreadCloner] Fetching SVG image: ${fullUrl}`);
                fetch(fullUrl, { credentials: 'include' })
                    .then(r => {
                        if (!r.ok) throw new Error(`HTTP ${r.status}`);
                        return r.blob();
                    })
                    .then(b => blobToImage(b))
                    .then(result => {
                        if (result) {
                            result.key = key;
                            collectedPages.push(result);
                            updateCount();
                            console.log(`[HyreadCloner] ✅ Captured: ${key} (${result.width}x${result.height})`);
                        }
                    })
                    .catch(err => console.warn(`[HyreadCloner] ❌ Failed: ${fullUrl}`, err));
            });

            // Regular <img>
            doc.querySelectorAll('img[src]').forEach(img => {
                const fullUrl = resolveImageHref(img.getAttribute('src'), iframe);
                if (!fullUrl) return;
                const key = fullUrl.split('?')[0];
                if (seenKeys.has(key)) return;
                seenKeys.add(key);

                fetch(fullUrl, { credentials: 'include' })
                    .then(r => r.blob())
                    .then(b => blobToImage(b))
                    .then(result => {
                        if (result) {
                            result.key = key;
                            collectedPages.push(result);
                            updateCount();
                        }
                    })
                    .catch(() => {});
            });
        });
    }

    // =============================================
    // PerformanceObserver fallback
    // =============================================
    function startPerfObserver() {
        try {
            const po = new PerformanceObserver(list => {
                for (const entry of list.getEntries()) {
                    const url = entry.name;
                    if (/\.(jpg|jpeg|png|webp)(\?|$)/i.test(url) && url.includes('/ebookservice/epub/')) {
                        const key = url.split('?')[0];
                        if (!seenKeys.has(key)) {
                            seenKeys.add(key);
                            fetch(url, { credentials: 'include' })
                                .then(r => r.blob())
                                .then(b => blobToImage(b))
                                .then(result => {
                                    if (result) {
                                        result.key = key;
                                        collectedPages.push(result);
                                        updateCount();
                                        console.log(`[HyreadCloner] PerfObserver caught: ${key}`);
                                    }
                                })
                                .catch(() => {});
                        }
                    }
                }
            });
            po.observe({ type: 'resource', buffered: true });
        } catch (e) {}
    }

    // =============================================
    // Blob capture (original)
    // =============================================
    function captureBlobImages() {
        const urls = new Set();
        document.querySelectorAll('img[src^="blob:"]').forEach(img => urls.add(img.src));
        document.querySelectorAll('div[style*="blob:"]').forEach(div => {
            const style = div.getAttribute('style') || '';
            const matches = style.match(/url\("?(blob:[^")\s]+)"?\)/g);
            if (matches) matches.forEach(m => urls.add(m.replace(/url\("?|"?\)/g, '')));
        });

        urls.forEach(url => {
            if (seenKeys.has(url)) return;
            seenKeys.add(url);
            const blob = capturedBlobs.get(url);
            const promise = blob ? Promise.resolve(blob) : fetch(url).then(r => r.blob());
            promise.then(b => blobToImage(b)).then(img => {
                if (img) {
                    img.key = url;
                    collectedPages.push(img);
                    updateCount();
                }
            }).catch(() => {});
        });
    }

    // =============================================
    // Utilities
    // =============================================
    function blobToImage(blob) {
        return new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = () => {
                const img = new Image();
                img.onload = () => {
                    if (img.naturalWidth < 400 && img.naturalHeight < 400) {
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

    function updateCount() {
        if (window.__hyreadCountLabel) {
            window.__hyreadCountLabel.textContent = `${collectedPages.length} pages`;
        }
    }

    function captureAll() {
        captureBlobImages();
        scanIframeContents();
    }

    // =============================================
    // UI
    // =============================================
    function initUI() {
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
       font-size: 13px; font-weight: bold; color: #fff; background: ${color};
     `;
            return btn;
        }

        const btnAuto = makeBtn('▶ Auto ON', '#2ecc71');
        const btnExport = makeBtn('📄 Export PDF', '#3498db');
        window.__hyreadCountLabel = document.createElement('span');
        window.__hyreadCountLabel.style.cssText = 'align-self: center; font-size: 12px; opacity: 0.8;';
        window.__hyreadCountLabel.textContent = `0 pages | asset: ${assetId ? assetId.slice(0, 8) + '...' : 'N/A'}`;

        bar.appendChild(btnAuto);
        bar.appendChild(btnExport);
        bar.appendChild(window.__hyreadCountLabel);
        document.body.appendChild(bar);

        btnAuto.addEventListener('click', () => {
            if (autoMode) stopAuto(); else startAuto();
        });

        function startAuto() {
            autoMode = true;
            btnAuto.textContent = '⏹ Auto OFF';
            btnAuto.style.background = '#e74c3c';
            captureAll();
            autoInterval = setInterval(() => {
                document.dispatchEvent(new KeyboardEvent('keydown', {
                    key: 'ArrowRight', code: 'ArrowRight', keyCode: 39, which: 39, bubbles: true
                }));
                document.dispatchEvent(new KeyboardEvent('keyup', {
                    key: 'ArrowRight', code: 'ArrowRight', keyCode: 39, which: 39, bubbles: true
                }));
                setTimeout(() => captureAll(), 600);
            }, flip_page_wait_ms);
        }

        function stopAuto() {
            autoMode = false;
            btnAuto.textContent = '▶ Auto ON';
            btnAuto.style.background = '#2ecc71';
            if (autoInterval) { clearInterval(autoInterval); autoInterval = null; }
        }

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
                    const first = collectedPages[0];
                    const pdf = new jsPDF({
                        orientation: first.width > first.height ? 'landscape' : 'portrait',
                        unit: 'px', format: [first.width, first.height]
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
                    console.error('[HyreadCloner] PDF export failed:', e);
                    alert('PDF export failed: ' + e.message);
                    btnExport.textContent = '📄 Export PDF';
                }
                btnExport.disabled = false;
            }, 100);
        });
    }

    // =============================================
    // Bootstrap
    // =============================================
    const onReady = () => {
        initUI();
        iframeObserver.observe(document.body, { childList: true, subtree: true });
        document.querySelectorAll('iframe').forEach(f => {
            patchIframe(f);
            f.addEventListener('load', () => patchIframe(f));
        });
        startPerfObserver();
        setInterval(scanIframeContents, 2000);
    };

    if (document.body) onReady();
    else document.addEventListener('DOMContentLoaded', onReady);

})();