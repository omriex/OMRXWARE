
const fs = require('fs');

// ─────────────────────────────────────────────────────────────────────────────
//  OMRXWARE Updater — permanent, obfuscation-resilient
//
//  AC bypass strategy (v3 — delayed interceptor):
//
//  HOW DEVAST.IO AC WORKS:
//   1. Outer JS sets 3 global flag vars (chrome/CSS/safari detection) to 0 or 1
//   2. Inner eval'd game reads them to:
//      (a) Compute a hash for the WebSocket URL query string
//      (b) Schedule a kill timer that fires if flags indicate Chrome
//
//  WHAT WENT WRONG BEFORE:
//   • Zeroing flags immediately → wrong WS hash → server rejects → can't join
//   • protoBypass on Object.prototype → inner game objects (WebSocket etc.) broken
//
//  CORRECT FIX — DELAYED INTERCEPTOR:
//   • Phase 1 (before WS opens): NO interceptors. Flags = 1 (natural Chrome value).
//     WS URL hash is computed correctly → server accepts → connection opens.
//   • Phase 2 (500ms after WS open event): install smart property interceptors.
//     - Numeric assignments → stored as 0 (kills the AC flag value)
//     - Non-numeric (objects, WebSocket…) → pass through normally
//     Kill timer reads flag → 0 → condition false → no kill. ✓
//
//  OBFUSCATION RESILIENCE:
//   • Flag var names: detected structurally from try-catch pattern (never hardcoded)
//   • Client JS URL: matched from HTML as js/<anything>.js
//   • Interceptors: work even if Devast renames the flags every update
// ─────────────────────────────────────────────────────────────────────────────

async function runUpdater() {
    try {
        console.log('Fetching Devast.io...');
        const htmlResponse = await fetch('https://devast.io/');
        const html = await htmlResponse.text();

        // Match any JS in /js/ directory — handles all naming schemes (hash, base62, etc.)
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
        if (physCount > 0) {
            jsCode = jsCode.replace(/-0\.35/g, '-0.65');
            console.log('[OK] Physics mod (' + physCount + ' replacements)');
        } else {
            console.log('[OK] Physics mod (none found — may already be patched or moved)');
        }

        // ── 2. Detect AC flag variable names ────────────────────────────────
        //
        // The 3 browser-fingerprint flag vars always follow this structure:
        //
        //   var <flagVar> = 0;
        //   try {
        //       <flagVar> = (<browser probe>) ? 1 : 0;
        //   } catch (<x>) {}
        //
        // Multiple regex fallbacks to handle obfuscation variations:
        //
        const flagVars = [];

        // Primary: standard ternary in try-catch
        const tryFlagRe = /try\s*\{\s*(\S+)\s*=\s*[^=\n][^\n;]{5,800}\?\s*(?:0[xX]?1|01|1)\s*:\s*(?:0[xX]?0|0x0|00|0)\s*;\s*\}\s*catch\s*\(\s*\S+\s*\)\s*\{[^{}]*\}/g;
        let _m;
        while ((_m = tryFlagRe.exec(jsCode)) !== null) {
            if (!flagVars.includes(_m[1])) flagVars.push(_m[1]);
        }

        // Fallback: look for var X = 0; immediately before try { X = ... }
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

        // ── 3. Phase-switching kill bypass (definitive AC bypass) ──────────────
        //
        // HOW THE AC KILL ACTUALLY WORKS (discovered through analysis):
        //
        //   1. Outer JS sets flag vars (оаߎ９ etc.) to 1 (Chrome detected)
        //   2. Inner eval'd game IMMEDIATELY caches them into local closure vars:
        //        var _f = оаߎ９;  // _f = 1 (at page load, T=0)
        //   3. Kill setInterval checks _f every 6s → if 1, kills player
        //   4. SEPARATELY, when user clicks Play, the game reads flags directly
        //      from window (NOT from cache) to compute the WebSocket URL hash
        //
        // WHY T=5s TIMER FAILED:
        //   Our getter only changes window.flag AFTER T=5s. But the cache (_f)
        //   was captured at T=0 with value=1. Kill checks _f → always kills.
        //
        // THE FIX — PHASE-SWITCHING GETTER:
        //
        //   Phase 0 (page load, T=0): getter returns 0
        //     → kill cache captures 0 → kill timer reads 0 → no kill ✓
        //
        //   Phase 1 (on click, ~2s window): getter returns REAL value (1 for Chrome)
        //     → hash computation gets 1 → server accepts connection ✓
        //
        //   Phase 0 again (after 2s): getter returns 0
        //     → any subsequent reads return 0 → no kill ✓
        //
        const delayedKillBypass = `
(function() {
    var _flags = ${JSON.stringify(flagVars)};
    var _realVals = {};   // stores values set by outer JS (1 for Chrome etc.)
    var _exposeReal = false;  // when true, getter returns real value (hash phase)

    // Install property interceptors IMMEDIATELY (T=0)
    // Getter returns 0 by default so kill cache captures 0
    _flags.forEach(function(f) {
        _realVals[f] = 0;
        try {
            Object.defineProperty(window, f, {
                get: function() {
                    return _exposeReal ? (_realVals[f] || 0) : 0;
                },
                set: function(v) {
                    // Store the real value (1 for Chrome) for later hash use.
                    // Do NOT expose it yet — keep returning 0 until click.
                    if (typeof v === 'number') _realVals[f] = v;
                },
                configurable: true,
                enumerable: false
            });
        } catch(e) {}
    });

    // On first click (Play button): temporarily expose real values for 2s
    // so the WebSocket URL hash computation gets the correct flag values.
    // After 2s, revert to 0 (hash is done, kill prevention resumes).
    document.addEventListener('click', function onPlayClick() {
        _exposeReal = true;
        setTimeout(function() { _exposeReal = false; }, 2000);
        document.removeEventListener('click', onPlayClick, true);
    }, { capture: true });

    console.log('[OMRXWARE] Kill bypass active — phase-switching (flags:', _flags.length, ')');
})();
`;


        // ── 4. WebSocket close guard ─────────────────────────────────────────
        //
        // The AC kill mechanism calls ws.close() immediately after creating the
        // WebSocket (while it's still in CONNECTING state), producing:
        //   "WebSocket is closed before the connection is established"
        //
        // Fix: hook WebSocket.prototype.close to block calls made on connections
        // that are still connecting (readyState === 0) to devast.io game servers.
        // Legitimate closes (after connection opens, or to non-game servers) are
        // always passed through.
        //
        // NOTE: We do NOT hook the WebSocket constructor — only the .close method.
        // This avoids the function-name AC detection that broke the previous hook.
        //
        const wsCloseGuard = `
(function() {
    var _origClose = WebSocket.prototype.close;
    WebSocket.prototype.close = function(code, reason) {
        // Block premature close on devast game servers only
        if (this.readyState === 0 /* CONNECTING */ &&
            typeof this.url === 'string' &&
            this.url.indexOf('devast.io') !== -1 &&
            this.url.indexOf('127.0.0.1') === -1) {
            var self = this;
            // Allow close after 10s regardless (safety net)
            setTimeout(function() { try { _origClose.call(self, code, reason); } catch(e) {} }, 10000);
            return;
        }
        return _origClose.apply(this, arguments);
    };
    console.log('[OMRXWARE] WS close guard active');
})();
`;



        // ── 5. WebAssembly passthrough ──────────────────────────────────────
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

        // ── 6. Timing passthrough ────────────────────────────────────────────
        const timingBypass = `
(function() {
    var _perfNow = performance.now.bind(performance);
    var _dateNow = Date.now.bind(Date);
    performance.now = function() { return _perfNow(); };
    Date.now = function() { return _dateNow(); };
})();
`;

        // ── 7. Canvas passthrough ────────────────────────────────────────────
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

        // ── 8. UI / ad remover ───────────────────────────────────────────────
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

        // Only prepend the kill bypass. All other hooks (wsCloseGuard, wasmBypass,
        // timingBypass, canvasBypass, uiRemover) wrap native browser APIs, making
        // their .toString() return user code instead of "[native code]". The game
        // hashes these function signatures into the WebSocket URL query string →
        // any hook causes the server to reject the connection.
        //
        // The kill bypass is safe: it uses Object.defineProperty on plain global
        // variables (the AC flag vars), not on any browser API. At T=5s these vars
        // get property interceptors. By then the WS URL hash has been computed and
        // the connection is already open.
        jsCode = delayedKillBypass + '\n' + jsCode;

        // ── 9. Inject omrxware.js ────────────────────────────────────────────
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
