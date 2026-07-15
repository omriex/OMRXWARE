const fs = require('fs');

// ─────────────────────────────────────────────────────────────────────────────
//  OMRXWARE Updater – AC bypass via delayed Object.prototype mock
//
//  Strategy:
//    • The game sets 3 flag vars (chrome/CSS/safari) – we do NOT touch them.
//      Let the detection run naturally so the WebSocket token is valid.
//    • The kill routine accesses the main WebSocket through obfuscated
//      Unicode properties on Object.prototype, then calls .close().
//    • We wait until the WebSocket connects (onopen), then immediately
//      install a mock on those properties that returns a dummy object
//      (with no‑op close). Any later kill attempt hits the dummy and fails.
// ─────────────────────────────────────────────────────────────────────────────

async function runUpdater() {
    try {
        console.log('Fetching Devast.io...');
        const htmlResponse = await fetch('https://devast.io/');
        const html = await htmlResponse.text();

        const scriptMatch = html.match(/src="(js\/[^"]+\.js[^"]*)"/i)
                         || html.match(/src="([^"]*client\.[0-9.]*min\.js[^"]*)"/i);
        if (!scriptMatch) throw new Error('Could not find client JS in HTML.');

        let jsUrl = scriptMatch[1];
        if (!jsUrl.startsWith('http')) jsUrl = 'https://devast.io/' + jsUrl.replace(/^\//, '');

        console.log('Downloading', jsUrl);
        const jsResponse = await fetch(jsUrl);
        let jsCode = await jsResponse.text();

        fs.writeFileSync('devast-original.js', jsCode);
        console.log('[OK] Saved devast-original.js');

        // ── 1. Physics modifier ─────────────────────────────────────────────
        const physCount = (jsCode.match(/-0\.35/g) || []).length;
        jsCode = jsCode.replace(/-0\.35/g, '-0.65');
        console.log('[OK] Physics mod (' + physCount + ' replacements)');

        // ── 2. Array-near-catch bypass ──────────────────────────────────────
        jsCode = jsCode.replace(
            /(\[\s*\d+\s*,\s*0[0-7]+\s*\]|\[\s*\d+\s*,\s*\d+\s*\])(?=\s*;[^}]{0,300}catch)/,
            '(function(){var _v=[30,1133];_v.toString=function(){return"OMRXWARE";};return _v;})()'
        );

        // ── 3. Delayed AC bypass ────────────────────────────────────────────
        // This script wraps the WebSocket constructor and waits for the
        // 'open' event before installing the Object.prototype mock.
        const acBypass = `
(function() {
    var _OrigWebSocket = window.WebSocket;
    var _mockInstalled = false;

    // Dummy socket that the kill routine will try to .close()
    var _fakeSocket = {
        close: function() { console.log('[OMRXWARE] Kill attempt blocked (fake socket close)'); },
        send: function() {},
        addEventListener: function() {},
        removeEventListener: function() {},
        readyState: 1,
        onopen: null,
        onclose: null,
        onmessage: null,
        onerror: null
    };

    // The Unicode properties the game uses to stash/reference the socket
    var _props = [
        '\u0455\u1687\u10c3',
        '\u2c9f\u030b\ufe04',
        '\u0440\u0789\u034f'
    ];

    function _installMock() {
        if (_mockInstalled) return;
        _mockInstalled = true;
        _props.forEach(function(prop) {
            try {
                Object.defineProperty(Object.prototype, prop, {
                    get: function() { return _fakeSocket; },
                    set: function(val) { /* ignore attempts to set the real socket */ },
                    configurable: true,
                    enumerable: false
                });
            } catch(e) {}
        });
        console.log('[OMRXWARE] Delayed AC mock installed (after WebSocket open)');
    }

    window.WebSocket = function(url, protocols) {
        var ws;
        if (protocols) {
            ws = new _OrigWebSocket(url, protocols);
        } else {
            ws = new _OrigWebSocket(url);
        }

        // Install the mock as soon as the socket connects
        ws.addEventListener('open', function() {
            _installMock();
        });

        return ws;
    };

    // Keep static properties
    window.WebSocket.prototype = _OrigWebSocket.prototype;
    window.WebSocket.CONNECTING = _OrigWebSocket.CONNECTING;
    window.WebSocket.OPEN = _OrigWebSocket.OPEN;
    window.WebSocket.CLOSING = _OrigWebSocket.CLOSING;
    window.WebSocket.CLOSED = _OrigWebSocket.CLOSED;
})();
`;

        // ── 4. WebAssembly passthrough ──────────────────────────────────────
        const wasmBypass = `
(function() {
    var _origInstantiate = WebAssembly.instantiate;
    var _origInstantiateStreaming = WebAssembly.instantiateStreaming;
    WebAssembly.instantiate = function(buf, imports) { return _origInstantiate(buf, imports); };
    WebAssembly.instantiateStreaming = function(src, imports) { return _origInstantiateStreaming(src, imports); };
})();`;

        // ── 5. Timing passthrough ────────────────────────────────────────────
        const timingBypass = `
(function() {
    var _perfNow = performance.now.bind(performance);
    var _dateNow = Date.now.bind(Date);
    performance.now = function() { return _perfNow(); };
    Date.now = function() { return _dateNow(); };
})();`;

        // ── 6. Canvas passthrough ────────────────────────────────────────────
        const canvasBypass = `
(function() {
    var _origToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function(type, quality) { return _origToDataURL.call(this, type, quality); };
    if (typeof OffscreenCanvas !== 'undefined') {
        var _origOff = OffscreenCanvas.prototype.convertToBlob;
        if (_origOff) OffscreenCanvas.prototype.convertToBlob = _origOff;
    }
})();`;

        // ── 7. UI / ad remover ───────────────────────────────────────────────
        const uiRemover = `
(function() {
    var targets = [
        'terms', 'howtoplay', 'changelog', 'featuredVideo',
        'bebebaba', 'devast-io_970x250', 'preroll', 'exapush-popup'
    ];
    var origGet = document.getElementById;
    document.getElementById = function(id) {
        var el = origGet.call(document, id);
        if (!el && targets.indexOf(id) !== -1) {
            el = document.createElement('div');
            el.id = id;
            el.style.display = 'none';
        }
        return el;
    };
    var style = document.createElement('style');
    style.innerHTML = '#' + targets.join(', #') + ' { display:none!important; opacity:0!important; visibility:hidden!important; pointer-events:none!important; z-index:-9999!important; width:0!important; height:0!important; }';
    style.innerHTML += ' .bebebaba { display:none!important; }';
    if (document.head) document.head.appendChild(style);
    else document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style));
    const origDraw = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function() {
        try {
            var nick = document.getElementById('nicknameInput');
            var isMenu = nick && nick.offsetParent !== null;
            if (isMenu) {
                var dx;
                if (arguments.length === 3 || arguments.length === 5) dx = arguments[1];
                else if (arguments.length === 9) dx = arguments[5];
                if (dx !== undefined) {
                    var t = this.getTransform();
                    var isUI = Math.abs(t.a - 1) < 0.05 || Math.abs(t.a - window.devicePixelRatio) < 0.05;
                    if (isUI) {
                        var relX = (dx * t.a + t.e - this.canvas.width / 2) / t.a;
                        if (relX < -440 || relX > 300) return;
                    }
                }
            }
        } catch(e) {}
        return origDraw.apply(this, arguments);
    };
})();`;

        // Prepend all bypass scripts (order matters for some overrides)
        jsCode = uiRemover    + '\n' + jsCode;
        jsCode = canvasBypass + '\n' + jsCode;
        jsCode = timingBypass + '\n' + jsCode;
        jsCode = wasmBypass   + '\n' + jsCode;
        jsCode = acBypass     + '\n' + jsCode;   // WebSocket wrapper runs early

        // ── 8. Inject omrxware.js ───────────────────────────────────────────
        try {
            const myScript = fs.readFileSync('omrxware.js', 'utf8');
            const b64 = Buffer.from(myScript).toString('base64');
            jsCode += '\n;\n' + `
setTimeout(function() {
    try {
        var s = document.createElement('script');
        s.innerHTML = decodeURIComponent(escape(atob('${b64}')));
        document.body.appendChild(s);
        console.log('[OMRXWARE] Injected!');
    } catch(e) { console.error('Injection error:', e); }
}, 1000);
`;
            console.log('[INJ] omrxware.js injected');
        } catch(e) {
            console.error('Could not find omrxware.js.'); process.exit(1);
        }

        fs.writeFileSync('devast-modded.js', jsCode);
        console.log('\n✓ devast-modded.js ready');
        console.log('Resource Override pattern: *://devast.io/js/*.js*');

    } catch(err) {
        console.error(err); process.exit(1);
    }
}

runUpdater();
