const fs = require('fs');

// ─────────────────────────────────────────────────────────────────────────────
//  OMRXWARE Updater — permanent, obfuscation-resilient
//
//  AC bypass strategy (revised):
//    • The game uses 3 flag vars (chrome/CSS/safari) to detect bots.
//      If they are 1 → game allows joining, then kills you in-game.
//      If they are 0 → game BLOCKS joining completely.
//    • We force these flags to always read as 1 so joining always succeeds.
//    • The kill routine accesses certain Unicode properties on
//      Object.prototype to grab the WebSocket connection and call .close().
//      We mock those properties with a dummy object that has no‑op methods,
//      so the kill attempt becomes harmless and the player stays alive.
// ─────────────────────────────────────────────────────────────────────────────

async function runUpdater() {
    try {
        console.log('Fetching Devast.io...');
        const htmlResponse = await fetch('https://devast.io/');
        const html = await htmlResponse.text();

        // Match any .js file in the /js/ directory — covers all naming schemes
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

        // ── 3. Detect AC flag variable names ────────────────────────────────
        const flagVars = [];
        const tryFlagRe = /try\s*\{\s*(\S+)\s*=\s*[^=\n][^\n;]{5,800}\?\s*(?:0[xX]?1|01|1)\s*:\s*(?:0[xX]?0|0x0|00|0)\s*;\s*\}\s*catch\s*\(\s*\S+\s*\)\s*\{[^{}]*\}/g;
        let _m;
        while ((_m = tryFlagRe.exec(jsCode)) !== null) {
            if (!flagVars.includes(_m[1])) flagVars.push(_m[1]);
        }
        console.log('[AC] Detected ' + flagVars.length + ' flag var(s)');
        if (flagVars.length === 0) {
            console.warn('[AC] WARNING: No flag vars detected — AC pattern may have changed');
        }

        // ── 4. Flag interceptor – force flags to 1 (allow joining) ──────────
        const flagInterceptor = `
(function() {
    var _flags = ${JSON.stringify(flagVars)};
    _flags.forEach(function(f) {
        try {
            Object.defineProperty(window, f, {
                get: function() { return 1; },   // force "bot" detection → allows joining
                set: function(v) { /* ignore assignments */ },
                configurable: false,
                enumerable: false
            });
        } catch(e) {}
    });
    console.log('[OMRXWARE] AC flag interceptors installed (forced 1):', _flags.length);
})();
`;

        // ── 5. Proto bypass – mock the Unicode properties the kill routine uses ──
        const protoBypass = `
(function() {
    // Dummy WebSocket-like object – the kill routine will call .close() on this,
    // but it does nothing, so the player stays alive.
    var _fakeSocket = {
        close: function() {},
        send: function() {},
        addEventListener: function() {},
        removeEventListener: function() {},
        readyState: 1,
        onopen: null,
        onclose: null,
        onmessage: null,
        onerror: null
    };
    var _oldProps = [
        '\u0455\u1687\u10c3',
        '\u2c9f\u030b\ufe04',
        '\u0440\u0789\u034f',
    ];
    _oldProps.forEach(function(prop) {
        try {
            Object.defineProperty(Object.prototype, prop, {
                get: function() { return _fakeSocket; },
                set: function(val) {},
                configurable: true,
                enumerable: false
            });
        } catch(e) {}
    });
    console.log('[OMRXWARE] Proto mock installed');
})();
`;

        // ── 6. WebAssembly passthrough ──────────────────────────────────────
        const wasmBypass = `
(function() {
    var _origInstantiate = WebAssembly.instantiate;
    var _origInstantiateStreaming = WebAssembly.instantiateStreaming;
    WebAssembly.instantiate = function(buf, imports) {
        return _origInstantiate(buf, imports);
    };
    WebAssembly.instantiateStreaming = function(src, imports) {
        return _origInstantiateStreaming(src, imports);
    };
})();
`;

        // ── 7. Timing passthrough ────────────────────────────────────────────
        const timingBypass = `
(function() {
    var _perfNow = performance.now.bind(performance);
    var _dateNow = Date.now.bind(Date);
    performance.now = function() { return _perfNow(); };
    Date.now = function() { return _dateNow(); };
})();
`;

        // ── 8. Canvas passthrough ────────────────────────────────────────────
        const canvasBypass = `
(function() {
    var _origToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function(type, quality) {
        return _origToDataURL.call(this, type, quality);
    };
    if (typeof OffscreenCanvas !== 'undefined') {
        var _origOff = OffscreenCanvas.prototype.convertToBlob;
        if (_origOff) OffscreenCanvas.prototype.convertToBlob = _origOff;
    }
})();
`;

        // ── 9. UI / ad remover ───────────────────────────────────────────────
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
})();
`;

        // Prepend all bypass code (order matters for some interceptors)
        jsCode = uiRemover    + '\n' + jsCode;
        jsCode = canvasBypass + '\n' + jsCode;
        jsCode = timingBypass + '\n' + jsCode;
        jsCode = wasmBypass   + '\n' + jsCode;
        jsCode = protoBypass  + '\n' + jsCode;
        jsCode = flagInterceptor + '\n' + jsCode;   // flag interceptor runs first

        // ── 10. Inject omrxware.js ───────────────────────────────────────────
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
