
const fs = require('fs');

// ─────────────────────────────────────────────────────────────────────────────
//  OMRXWARE Updater — permanent, obfuscation-resilient
//
//  What changes every devast.io update:
//    • client JS filename  → fixed by matching ANY js/anything.js
//    • AC flag variable names → fixed by targeting STRUCTURE, not names
//
//  Core AC bypass strategy:
//    Devast always has 3 identical-structure try-catch blocks that probe
//    the browser (chrome / CSS / safari) and store 0 or 1 in a flag var:
//
//      try {
//          <flagVar> = (<browser probe expr>) ? 1 : 0;
//      } catch (x) {}
//
//    We blank ALL three blocks entirely, so <flagVar> stays at its initial
//    value of 0. We do NOT touch any other code, so page loading is safe.
//    This works regardless of what the variable names are.
// ─────────────────────────────────────────────────────────────────────────────

async function runUpdater() {
    try {
        console.log('Fetching Devast.io...');
        const htmlResponse = await fetch('https://devast.io/');
        const html = await htmlResponse.text();

        // Match the game client JS — ANY file in the /js/ directory.
        // Devast has used: client.30.1125.min.js, hex hashes, base62 names, etc.
        const scriptMatch = html.match(/src="(js\/[^"]+\.js[^"]*)"/i)
                         || html.match(/src="([^"]*client\.[0-9.]*min\.js[^"]*)"/i);

        if (!scriptMatch) throw new Error('Could not find the client JS in the page HTML.');

        let jsUrl = scriptMatch[1];
        if (!jsUrl.startsWith('http')) jsUrl = 'https://devast.io/' + jsUrl.replace(/^\//, '');

        console.log('Downloading', jsUrl);
        const jsResponse = await fetch(jsUrl);
        let jsCode = await jsResponse.text();

        fs.writeFileSync('devast-original.js', jsCode);
        console.log('[OK] Saved devast-original.js');

        // ── 1. Physics modifier ─────────────────────────────────────────────
        const physBefore = (jsCode.match(/-0\.35/g) || []).length;
        jsCode = jsCode.replace(/-0\.35/g, '-0.65');
        console.log('[OK] Physics mod applied (' + physBefore + ' replacements)');

        // ── 2. Array-near-catch bypass ──────────────────────────────────────
        jsCode = jsCode.replace(
            /(\[\s*\d+\s*,\s*0[0-7]+\s*\]|\[\s*\d+\s*,\s*\d+\s*\])(?=\s*;[^}]{0,300}catch)/,
            '(function(){var _v=[30,1133];_v.toString=function(){return"OMRXWARE";};return _v;})()'
        );

        // ── 3. AC browser-fingerprint try-catch blanking ─────────────────────
        //
        // Pattern (appears 3 times — chrome, CSS, safari):
        //   try {
        //       <anyVar> = (<any browser probe>) ? <1> : <0>;
        //   } catch (<anyVar>) {}
        //
        // We replace each entire block with an empty try{}catch(e){} so the
        // flag variables remain at 0 (their initial declared value).
        //
        // Regex notes:
        //   \s*\S+\s*   — variable name (any non-whitespace sequence)
        //   =[^=\n]     — assignment that is NOT == or ===
        //   [^\n;]{5,}  — the probe expression (stays on one line, no semicolon)
        //   \?          — ternary
        //   1-ish : 0-ish — the detection result pattern
        //   \{[^{}]*\}  — catch body (usually empty, but allows for anything)
        //
        const acTryCatchRe = /try\s*\{\s*\S+\s*=\s*[^=\n][^\n;]{5,800}\?\s*(?:0[xX]?1|01|1)\s*:\s*(?:0[xX]?0|0x0|00|0)\s*;\s*\}\s*catch\s*\(\s*\S+\s*\)\s*\{[^{}]*\}/g;
        const acCount = (jsCode.match(acTryCatchRe) || []).length;
        jsCode = jsCode.replace(acTryCatchRe, 'try{}catch(e){}');
        console.log('[AC] Blanked ' + acCount + ' browser-fingerprint try-catch block(s)');
        if (acCount === 0) {
            console.warn('[AC] WARNING: 0 AC blocks found — check if pattern changed');
        }

        // ── 4. Proto bypass (defense-in-depth) ─────────────────────────────
        // Covers any remaining property-access checks on these known AC prop names.
        // Using only the historically stable props that are known not to conflict
        // with legitimate game internals.
        const protoBypass = `
(function() {
    var _acProps = [
        '\u0455\u1687\u10c3',
        '\u2c9f\u030b\ufe04',
        '\u0440\u0789\u034f',
        '\u2C9F\u030B\u0714',
        '\u2C9F\uFE0B\uFE08',
    ];
    _acProps.forEach(function(prop) {
        try {
            Object.defineProperty(Object.prototype, prop, {
                get: function() { return 0; },
                set: function(val) {},
                configurable: true,
                enumerable: false
            });
        } catch(e) {}
    });
})();
`;
        jsCode = protoBypass + '\n' + jsCode;

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
        jsCode = wasmBypass + '\n' + jsCode;

        // ── 6. Timing passthrough ────────────────────────────────────────────
        const timingBypass = `
(function() {
    var _perfNow = performance.now.bind(performance);
    var _dateNow = Date.now.bind(Date);
    performance.now = function() { return _perfNow(); };
    Date.now = function() { return _dateNow(); };
})();
`;
        jsCode = timingBypass + '\n' + jsCode;

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
        jsCode = canvasBypass + '\n' + jsCode;

        // ── 8. UI / ad remover ───────────────────────────────────────────────
        const uiRemoverBootloader = `
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
    style.innerHTML = '#' + targets.join(', #') + ' { display: none !important; opacity: 0 !important; visibility: hidden !important; pointer-events: none !important; z-index: -9999 !important; width: 0 !important; height: 0 !important; }';
    style.innerHTML += ' .bebebaba { display: none !important; }';

    if (document.head) document.head.appendChild(style);
    else document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style));

    const origDrawImage = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function() {
        try {
            var nickInput = document.getElementById('nicknameInput');
            var isMainMenu = nickInput && nickInput.offsetParent !== null;
            if (isMainMenu) {
                var dx;
                if (arguments.length === 3 || arguments.length === 5) dx = arguments[1];
                else if (arguments.length === 9) dx = arguments[5];
                if (dx !== undefined) {
                    var transform = this.getTransform();
                    var isUI = Math.abs(transform.a - 1) < 0.05
                            || Math.abs(transform.a - window.devicePixelRatio) < 0.05;
                    if (isUI) {
                        var absX = dx * transform.a + transform.e;
                        var relX = (absX - this.canvas.width / 2) / transform.a;
                        if (relX < -440 || relX > 300) return;
                    }
                }
            }
        } catch (err) {}
        return origDrawImage.apply(this, arguments);
    };
})();

`;
        jsCode = uiRemoverBootloader + '\n' + jsCode;

        // ── 9. Inject omrxware.js ────────────────────────────────────────────
        try {
            const myCustomScript = fs.readFileSync('omrxware.js', 'utf8');
            const base64Script = Buffer.from(myCustomScript).toString('base64');
            jsCode += '\n;\n' + `
setTimeout(function() {
    try {
        var script = document.createElement('script');
        script.innerHTML = decodeURIComponent(escape(atob('${base64Script}')));
        document.body.appendChild(script);
        console.log("OMRXWARE successfully injected!");
    } catch (e) {
        console.error("Injection error:", e);
    }
}, 1000);
`;
            console.log('[INJ] omrxware.js injected');
        } catch (err) {
            console.error('Could not find omrxware.js.');
            process.exit(1);
        }

        fs.writeFileSync('devast-modded.js', jsCode);
        console.log('\n✓ devast-modded.js ready  |  Resource Override pattern: *://devast.io/js/*.js*');

    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

runUpdater();
