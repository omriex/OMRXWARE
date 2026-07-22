
const fs = require('fs');

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

        const physCount = (jsCode.match(/-0\.35/g) || []).length;
        if (physCount > 0) {
            jsCode = jsCode.replace(/-0\.35/g, '-0.65');
            console.log('[OK] Physics mod (' + physCount + ' replacements)');
        } else {
            console.log('[OK] Physics mod (none found — may already be patched or moved)');
        }

        const flagVars = [];

        const tryFlagRe = /try\s*\{\s*(\S+)\s*=\s*[^=\n][^\n;]{5,800}\?\s*(?:0[xX]?1|01|1)\s*:\s*(?:0[xX]?0|0x0|00|0)\s*;\s*\}\s*catch\s*\(\s*\S+\s*\)\s*\{[^{}]*\}/g;
        let _m;
        while ((_m = tryFlagRe.exec(jsCode)) !== null) {
            if (!flagVars.includes(_m[1])) flagVars.push(_m[1]);
        }

        if (flagVars.length < 3) {
            const declRe = /var\s+(\S+)\s*=\s*(?:0[xX]?0|00|0)\s*;/g;
            while ((_m = declRe.exec(jsCode)) !== null) {
                if (flagVars.includes(_m[1])) continue;
                const next400 = jsCode.substring(_m.index, _m.index + 500);
                if (/try\s*\{/.test(next400) && /chrome|CSS|safari/i.test(next400)) {
                    flagVars.push(_m[1]);
                }
            }
        }

        console.log('[AC] Detected ' + flagVars.length + ' flag var(s):', flagVars.map(f => JSON.stringify(f)).join(', ') || 'none');
        if (flagVars.length === 0) {
            console.warn('[AC] WARNING: No flag vars found — AC structure may have changed. Kill bypass will be partial.');
        }

        const delayedKillBypass = `
(function() {
    var _flags = ${JSON.stringify(flagVars)};
    var _installed = false;

    function installKillBypass() {
        if (_installed) return;
        _installed = true;
        _flags.forEach(function(f) {
            var _stored = 0;
            try {
                Object.defineProperty(window, f, {
                    get: function() { return _stored; },
                    set: function(v) {
                        // AC flags are always numeric (0 or 1).
                        // Game objects (WebSocket, etc.) are non-numeric → pass through.
                        if (typeof v === 'number') {
                            _stored = 0;
                        } else {
                            _stored = v;
                        }
                    },
                    configurable: true,
                    enumerable: false
                });
            } catch(e) {}
        });
        console.log('[OMRXWARE] Kill bypass active (' + _flags.length + ' flags zeroed)');
    }

    // Simple 5-second timeout — no WebSocket hooking.
    // Timeline:
    //   ~0-2s : inner game computes WS URL hash (flags=1, correct)
    //   ~5s   : we zero the flags (kill condition now fails)
    //   ~6s+  : kill timer fires → reads 0 → no kill ✓
    // Hooking WebSocket was AC-detectable (function name mismatch).
    setTimeout(installKillBypass, 5000);
    console.log('[OMRXWARE] Kill bypass scheduled in 5s (flags:', _flags.length, ')');
})();
`;

        const zoomBypass = `
(function() {
    var _origMax = Math.max;
    Math.max = function(a, b) {
        if (typeof a === 'number' && a < 0 && a > -0.9 && arguments.length === 2) {
            return _origMax(a * 1.3, b);
        }
        return _origMax.apply(this, arguments);
    };
    console.log('[OMRXWARE] Zoom extender active');
})();
`;

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

        const timingBypass = `
(function() {
    var _perfNow = performance.now.bind(performance);
    var _dateNow = Date.now.bind(Date);
    performance.now = function() { return _perfNow(); };
    Date.now = function() { return _dateNow(); };
})();
`;

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
    else document.addEventListener('DOMContentLoaded', function() { document.head.appendChild(style); });

    var origDraw = CanvasRenderingContext2D.prototype.drawImage;
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

        jsCode = uiRemover       + '\n' + jsCode;
        jsCode = canvasBypass    + '\n' + jsCode;
        jsCode = timingBypass    + '\n' + jsCode;
        jsCode = wasmBypass      + '\n' + jsCode;
        jsCode = zoomBypass      + '\n' + jsCode;
        jsCode = delayedKillBypass + '\n' + jsCode;

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
