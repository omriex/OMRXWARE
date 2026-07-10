const fs = require('fs');

async function runUpdater() {
    try {
        console.log("Fetching Devast.io...");
        const htmlResponse = await fetch('https://devast.io/');
        const html = await htmlResponse.text();

        const scriptMatch = html.match(/src="([^"]*client\.[0-9.]*min\.js[^"]*)"/i);
        if (!scriptMatch) throw new Error("Could not find the client.js file.");

        let jsUrl = scriptMatch[1];
        if (!jsUrl.startsWith('http')) jsUrl = 'https://devast.io/' + jsUrl.replace(/^\//, '');

        const jsResponse = await fetch(jsUrl);
        let jsCode = await jsResponse.text();

        fs.writeFileSync('devast-original.js', jsCode);

        // Apply Zoom patch
        jsCode = jsCode.replace(/-0\.35/g, '-0.65');

        try {
            const myCustomScript = fs.readFileSync('omrxware.js', 'utf8');
            const base64Script = Buffer.from(myCustomScript).toString('base64');

            // --- ENHANCED UI HIDING + PROXY-ONLY BOOTLOADER ---
            const injectionCode = `
// --- OMRXWARE BOOTLOADER (UI Hiding + Proxy Only, No Canvas/WebSocket) ---
(function() {
    console.log("[OMRXWARE] Bootloader starting (UI hiding + proxy-only)");

    // ========== 1. AGGRESSIVE UI HIDING ==========
    // Target IDs (known from game)
    const uiTargets = [
        'terms', 'howtoplay', 'changelog', 'featuredVideo',
        'bebebaba', 'devast-io_970x250', 'preroll', 'exapush-popup'
    ];

    // Additional classes that often appear on popups/overlays
    const uiClasses = [
        'popup', 'modal', 'overlay', 'panel', 'dialog',
        'ui-panel', 'game-overlay', 'menu-panel', 'popup-container'
    ];

    // Build CSS rules
    let cssRules = '';
    uiTargets.forEach(id => {
        cssRules += '#' + id + ' { display: none !important; opacity: 0 !important; visibility: hidden !important; pointer-events: none !important; z-index: -9999 !important; width: 0 !important; height: 0 !important; }';
    });
    uiClasses.forEach(cls => {
        cssRules += '.' + cls + ' { display: none !important; opacity: 0 !important; visibility: hidden !important; pointer-events: none !important; z-index: -9999 !important; width: 0 !important; height: 0 !important; }';
    });
    // Also hide any element with "popup" or "modal" in its ID (catch-all)
    cssRules += '[id*="popup"] { display: none !important; }';
    cssRules += '[id*="modal"] { display: none !important; }';
    cssRules += '[id*="overlay"] { display: none !important; }';

    const style = document.createElement('style');
    style.innerHTML = cssRules;
    if (document.head) document.head.appendChild(style);
    else document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style));

    // Safe getElementById stub – returns dummy for known IDs
    const origGet = document.getElementById;
    document.getElementById = function(id) {
        const el = origGet.call(document, id);
        if (el) return el;
        if (uiTargets.includes(id)) {
            const dummy = document.createElement('div');
            dummy.id = id;
            dummy.style.display = 'none';
            return dummy;
        }
        return null;
    };

    // MutationObserver – hide any newly added elements that match our selectors
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === 1) { // element node
                    // Check if the node itself matches any target
                    const id = node.id;
                    const classList = node.classList;
                    let shouldHide = false;
                    if (id && uiTargets.includes(id)) shouldHide = true;
                    if (!shouldHide) {
                        for (let cls of uiClasses) {
                            if (classList.contains(cls)) { shouldHide = true; break; }
                        }
                    }
                    if (!shouldHide) {
                        // Check if ID contains popup/modal/overlay
                        if (id && (id.includes('popup') || id.includes('modal') || id.includes('overlay'))) {
                            shouldHide = true;
                        }
                    }
                    if (shouldHide) {
                        node.style.display = 'none';
                        node.style.opacity = '0';
                        node.style.visibility = 'hidden';
                        node.style.pointerEvents = 'none';
                        node.style.zIndex = '-9999';
                        console.log('[OMRXWARE] Hidden UI element:', node);
                    }
                }
            });
        });
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // ========== 2. NETWORK PROXY (fetch + XHR, NO WebSocket) ==========
    window.__proxy = {
        hooks: { beforeRequest: [], afterResponse: [] },
        registerHook: function(type, callback) {
            if (this.hooks[type]) this.hooks[type].push(callback);
        }
    };

    // Intercept fetch
    const origFetch = window.fetch;
    window.fetch = function(url, options) {
        const req = { url, options };
        window.__proxy.hooks.beforeRequest.forEach(h => h(req));
        return origFetch(url, options).then(res => {
            const resp = { url, status: res.status };
            window.__proxy.hooks.afterResponse.forEach(h => h(resp));
            return res;
        });
    };

    // Intercept XMLHttpRequest
    const origXHR = window.XMLHttpRequest;
    window.XMLHttpRequest = function() {
        const xhr = new origXHR();
        const origOpen = xhr.open;
        const origSend = xhr.send;

        xhr.open = function(method, url) {
            this._method = method;
            this._url = url;
            return origOpen.apply(this, arguments);
        };

        xhr.send = function(body) {
            const req = { method: this._method, url: this._url, body };
            window.__proxy.hooks.beforeRequest.forEach(h => h(req));
            this.addEventListener('load', function() {
                const resp = { method: this._method, url: this._url, status: this.status, response: this.response };
                window.__proxy.hooks.afterResponse.forEach(h => h(resp));
            });
            return origSend.apply(this, arguments);
        };
        return xhr;
    };

    // ========== 3. INJECT OMRXWARE SCRIPT ==========
    setTimeout(function() {
        try {
            const script = document.createElement('script');
            script.innerHTML = decodeURIComponent(escape(atob('${base64Script}')));
            document.body.appendChild(script);
            console.log("[OMRXWARE] ✅ Custom script injected successfully.");
        } catch (e) {
            console.error("[OMRXWARE] ❌ Injection error:", e);
        }
    }, 1000);

    console.log("[OMRXWARE] Bootloader ready. UI hidden, proxy active.");
})();
// ---------------------------
`;

            // Prepend bootloader to the game code
            jsCode = injectionCode + '\n;\n' + jsCode;

        } catch (err) {
            console.error("Could not find omrxware.js.");
        }

        fs.writeFileSync('devast-modded.js', jsCode);
        console.log("✅ Successfully generated devast-modded.js (with UI hiding + proxy-only)");

    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

runUpdater();
