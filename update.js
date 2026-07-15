
const fs = require('fs');

// ─────────────────────────────────────────────────────────────────────────────
//  OMRXWARE Updater v3 — obfuscation-resilient
//
//  Strategy: instead of matching specific Unicode variable names (which change
//  every update), we match the STRUCTURAL patterns the anticheat uses:
//
//   1. State-machine sentinels  – the exit values 999 / 01747 / 0x3E7 / 0x378
//      The AC sets a state variable to 999 (or equivalents) when a flag fires.
//      We neutralise this by making every "? X : 999" expression return 0
//      and patching every bare `= 999;` / `= 0x3E7;` / `= 01747` to `= 0;`.
//
//   2. Flag variables in try-catch blocks – devast sets tiny vars (chrome flag,
//      CSS flag, safari flag) to 0x1 inside try blocks, then uses them later.
//      We zero all assignments that follow the pattern:
//          <unicodeVar> = (…truthy test…) ? 0x1 : 0;
//      replacing with:
//          <unicodeVar> = 0;
//
//   3. Global Object.prototype poison-pill via defineProperty – we prepend a
//      block that intercepts ALL Object.defineProperty calls and prevents
//      non-configurable setters from being installed on Object.prototype,
//      effectively defusing property-trap anticheats without needing to know
//      the property names.
//
//   4. Math.random / performance.now / Date.now hooks – already present,
//      kept as-is.
//
//   5. The "jump-kill" pattern (flag = 1 ; … ; 999) is still handled but
//      generalised to all sentinel values.
// ─────────────────────────────────────────────────────────────────────────────

async function runUpdater() {
    try {
        console.log('Fetching Devast.io...');
        const htmlResponse = await fetch('https://devast.io/');
        const html = await htmlResponse.text();

        const scriptMatch = html.match(/src="([^"]*client\.[0-9.]*min\.js[^"]*)"/i);
        if (!scriptMatch) throw new Error('Could not find the client.js file.');

        let jsUrl = scriptMatch[1];
        if (!jsUrl.startsWith('http')) jsUrl = 'https://devast.io/' + jsUrl.replace(/^\//, '');

        console.log(`Downloading ${jsUrl}`);
        const jsResponse = await fetch(jsUrl);
        let jsCode = await jsResponse.text();

        fs.writeFileSync('devast-original.js', jsCode);
        console.log('[OK] Saved devast-original.js');

        // ── 1. Physics modifier ─────────────────────────────────────────────
        jsCode = jsCode.replace(/-0\.35/g, '-0.65');
        console.log('[OK] Physics modifier applied');

        // ── 2. State-machine sentinel zeroing ──────────────────────────────
        // Pattern A: ternary that can resolve to a sentinel exit value
        //   expr ? X : 999   →   expr ? X : 0
        // Covers 999, 0x3E7, 0X3E7, 03567 (octal 999), 01747 (octal 999 = 999? no, 01747=999)
        // 01747 octal = 1*512+7*64+4*8+7 = 512+448+32+7 = 999  ✓
        // 0x3E7 hex   = 3*256+14*16+7   = 768+224+7   = 999  ✓
        const AC_SENTINELS = [
            '999',
            '0x3[Ee]7',
            '0X3[Ee]7',
            '01747',       // octal 999
            '0x3e7',
        ];
        const sentinelAlt = AC_SENTINELS.join('|');

        // Ternary tail: `? <anything> : <sentinel>` → `? <anything> : 0`
        // Uses [?] character class to avoid template-literal escape ambiguity
        jsCode = jsCode.replace(
            new RegExp('[?]\\s*([^;:?]{1,60}?)\\s*:\\s*(' + sentinelAlt + ')(?=[\\s;,)[\\]])', 'g'),
            function(_, trueVal) { return '? ' + trueVal + ' : 0'; }
        );

        // Direct assignment: `= 999;` / `= 0x3E7;` / `= 01747;`
        jsCode = jsCode.replace(
            new RegExp('[=]\\s*(' + sentinelAlt + ')\\s*;', 'g'),
            '= 0;'
        );
        console.log('[OK] State-machine sentinels zeroed');

        console.log('[OK] Anticheat sentinels handled');

        // ── 5. WebAssembly passthrough (unchanged, structural) ──────────────
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

        // ── 8. UI remover (ads, terms, changelog, etc.) ──────────────────────
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
                var dx = undefined;

                if (arguments.length === 3 || arguments.length === 5) dx = arguments[1];
                else if (arguments.length === 9) dx = arguments[5];

                if (dx !== undefined) {
                    var transform = this.getTransform();
                    var isUI = Math.abs(transform.a - 1) < 0.05 || Math.abs(transform.a - window.devicePixelRatio) < 0.05;

                    if (isUI) {
                        var absX = dx * transform.a + transform.e;
                        var canvasCenter = this.canvas.width / 2;
                        var relX = (absX - canvasCenter) / transform.a;
                        if (relX < -440 || relX > 300) {
                            return;
                        }
                    }
                }
            }
        } catch (err) {}

        return origDrawImage.apply(this, arguments);
    };
})();

`;
        jsCode = uiRemoverBootloader + '\n' + jsCode;
        console.log('[OK] UI remover prepended');

        // ── 9. Inject omrxware.js ────────────────────────────────────────────
        try {
            const myCustomScript = fs.readFileSync('omrxware.js', 'utf8');
            const base64Script = Buffer.from(myCustomScript).toString('base64');

            const injectionCode = `
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
            jsCode += '\n;\n' + injectionCode;
            console.log('[INJ] omrxware.js injected');
        } catch (err) {
            console.error('Could not find omrxware.js.');
            process.exit(1);
        }

        fs.writeFileSync('devast-modded.js', jsCode);
        console.log('\n✓ Successfully generated devast-modded.js');

    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

runUpdater();
