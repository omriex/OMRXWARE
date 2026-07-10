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

            // --- PROXY-ONLY BOOTLOADER (no Canvas / WebSocket hooks) ---
            const injectionCode = `
// --- OMRXWARE PROXY-ONLY BOOTLOADER ---
(function() {
    console.log("[OMRXWARE] Proxy-only bootloader starting...");

    // 1. UI Hiding (CSS only – no DOM overrides)
    const uiTargets = ['terms', 'howtoplay', 'changelog', 'featuredVideo', 'bebebaba', 'devast-io_970x250', 'preroll', 'exapush-popup'];
    const style = document.createElement('style');
    style.innerHTML = '#' + uiTargets.join(', #') + ' { display: none !important; opacity: 0 !important; visibility: hidden !important; pointer-events: none !important; z-index: -9999 !important; width: 0 !important; height: 0 !important; }';
    style.innerHTML += ' .bebebaba { display: none !important; }';
    if (document.head) document.head.appendChild(style);
    else document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style));

    // 2. Safe getElementById stub (only for missing UI elements – no canvas logic)
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

    // 3. Network Proxy (intercepts fetch & XHR, leaves WebSocket untouched)
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

    // Intercept XMLHttpRequest (for older requests)
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

    // 4. Inject your custom script (omrxware.js)
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

    console.log("[OMRXWARE] Proxy-only bootloader ready. Use window.__proxy to intercept network traffic.");
})();
// -------------------------------------------------
`;

            // Prepend bootloader to the game code
            jsCode = injectionCode + '\n;\n' + jsCode;

        } catch (err) {
            console.error("Could not find omrxware.js.");
        }

        fs.writeFileSync('devast-modded.js', jsCode);
        console.log("✅ Successfully generated devast-modded.js (proxy-only)");

    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

runUpdater();
