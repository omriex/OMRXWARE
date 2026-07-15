
const fs = require('fs');

async function runUpdater() {
    try {
        console.log("Fetching Devast.io...");
        const htmlResponse = await fetch('https://devast.io/');
        const html = await htmlResponse.text();

        // NEW filename format: js/<16-char-hex>.js  (e.g. c91b8b1a111cca5c.js)
        // OLD filename format: js/client.XX.XXXX.min.js
        // Match either format so the updater survives future renames
        const scriptMatch =
            html.match(/src="((?:js\/)?[a-f0-9]{12,}\.js[^"]*)"/i) ||      // new hash format
            html.match(/src="([^"]*client\.[0-9.]*min\.js[^"]*)"/i);        // old versioned format

        if (!scriptMatch) throw new Error("Could not find the client JS file in the page HTML.");

        let jsUrl = scriptMatch[1];
        if (!jsUrl.startsWith('http')) jsUrl = 'https://devast.io/' + jsUrl.replace(/^\//, '');

        console.log(`Downloading ${jsUrl}`);
        const jsResponse = await fetch(jsUrl);
        let jsCode = await jsResponse.text();

        fs.writeFileSync('devast-original.js', jsCode);
        console.log('[OK] Saved devast-original.js');

        // ── Physics modifier ────────────────────────────────────────────────
        jsCode = jsCode.replace(/-0\.35/g, '-0.65');

        // ── Array-near-catch AC bypass ───────────────────────────────────────
        jsCode = jsCode.replace(
            /(\[\s*\d+\s*,\s*0[0-7]+\s*\]|\[\s*\d+\s*,\s*\d+\s*\])(?=\s*;[^}]{0,300}catch)/,
            `(function(){var _v=[30,1133];_v.toString=function(){return"OMRXWARE";};return _v;})()`
        );

        // ── Anticheat flag-variable neutralisation ───────────────────────────
        //
        // Devast.io uses 3 Unicode vars set inside try/catch blocks:
        //   acFlag1 = chrome-detection result  (? 1 : 0)
        //   acFlag2 = CSS-detection result     (? 1 : 0)
        //   acFlag3 = safari-detection result  (? 1 : 0)
        //
        // Strategy: find ALL variables assigned inside try{} as
        //   <var> = (<expr>) ? <1-ish> : <0-ish>
        // where the expression contains browser-fingerprint strings
        // (chrome, CSS, safari, navigator) — then zero those variables
        // everywhere in the file using a regex built from their names.
        //
        // This is resilient to variable renaming: we detect by WHAT the
        // try-block assigns, not by hardcoded Unicode names.

        // Extract AC flag variable names from try-catch boolean probes
        const acFlagNames = [];
        const tryFlagRe = /var\s+([\S]+)\s*=\s*0[x0]?0?;\s*[\s\S]{0,300}?try\s*\{[\s\S]{0,500}?\1\s*=\s*\([^)]{10,400}\)\s*\?\s*(?:0[xX]?1|01|1)\s*:\s*(?:0[xX]?0|0x0|00|0)\s*;\s*\}\s*catch/g;
        let m;
        while ((m = tryFlagRe.exec(jsCode)) !== null) {
            if (!acFlagNames.includes(m[1])) acFlagNames.push(m[1]);
        }

        // Fallback: also directly capture from the try block structure
        // Pattern: try { <unicodeVar> = (...chrome/CSS/safari...) ? 01 : 0x0; } catch
        const tryDirectRe = /try\s*\{\s*([\S]+)\s*=\s*\([^)]{10,400}(?:chrome|\\x63\\x68|CSS|\\x43\\x53|safari|navigator|\\x6e\\141)[^)]*\)\s*\?\s*(?:0[xX]?1|01|1)\s*:\s*(?:0[xX]?0|0x0|00|0)\s*;\s*\}\s*catch/g;
        while ((m = tryDirectRe.exec(jsCode)) !== null) {
            if (!acFlagNames.includes(m[1])) acFlagNames.push(m[1]);
        }

        if (acFlagNames.length > 0) {
            console.log('[AC] Found flag vars:', acFlagNames.length, '→', acFlagNames.map(v => JSON.stringify(v)).join(', '));
            for (const flag of acFlagNames) {
                const escaped = flag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                // Zero every assignment to this flag (except == checks)
                const re = new RegExp(escaped + '\\s*=\\s*(?!=)([^;(),\\s]+)', 'g');
                jsCode = jsCode.replace(re, flag + ' = 0');
            }
        } else {
            console.warn('[AC] WARNING: No flag vars found - AC may have changed structure');
        }

        // ── Proto bypass: zero ANY access to known AC prop names ─────────────
        // Build the list from detected flag names + any hardcoded fallbacks
        const protoProps = [...acFlagNames];

        // Also add the previous known flag names as a safety net
        const legacyFlags = [
            '\u0455\u1687\u10c3',
            '\u2c9f\u030b\ufe04',
            '\u0440\u0789\u034f',
        ];
        for (const f of legacyFlags) {
            if (!protoProps.includes(f)) protoProps.push(f);
        }

        const protoBypass = `
(function() {
    var _acProps = ${JSON.stringify(protoProps)};
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

        // ── Jump-kill: flag = 1 ; ... ; 999/01747/0x3E7 ─────────────────────
        // Build the regex dynamically from detected flag names
        if (acFlagNames.length > 0) {
            const escapedFlags = acFlagNames.map(f => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
            const jumpKillRegex = new RegExp(
                '(' + escapedFlags.join('|') + ')' +
                '\\s*=\\s*(?:0[xX]?1|01|1)(?![\\da-fA-F])\\s*;' +
                '([^;]{0,80}?)' +
                '(999|0[xX]3[eE]7|01747)',
                'g'
            );
            jsCode = jsCode.replace(jumpKillRegex, (_, flagPart, middle, jump) => {
                return flagPart + ' = 0;' + middle + jump;
            });
        }

        // ── Also zero the sentinel ternaries (structural backup) ─────────────
        // ? X : 999  /  ? X : 0x3E7  /  ? X : 01747
        const sentinelAlt = '999|0[xX]3[eE]7|01747';
        jsCode = jsCode.replace(
            new RegExp('[?]\\s*([^;:?\\n]{1,60}?)\\s*:\\s*(' + sentinelAlt + ')(?=[\\s;,)[\\]])', 'g'),
            function(_, trueVal) { return '? ' + trueVal + ' : 0'; }
        );

        // ── WebAssembly passthrough ──────────────────────────────────────────
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

        // ── Timing passthrough ───────────────────────────────────────────────
        const timingBypass = `
(function() {
    var _perfNow = performance.now.bind(performance);
    var _dateNow = Date.now.bind(Date);
    performance.now = function() { return _perfNow(); };
    Date.now = function() { return _dateNow(); };
})();
`;
        jsCode = timingBypass + '\n' + jsCode;

        // ── Canvas passthrough ───────────────────────────────────────────────
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

        // ── UI remover (ads, changelog, preroll, etc.) ───────────────────────
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

        // ── Inject omrxware.js ───────────────────────────────────────────────
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
            console.error("Could not find omrxware.js.");
            process.exit(1);
        }

        fs.writeFileSync('devast-modded.js', jsCode);
        console.log("\n✓ Successfully generated devast-modded.js");

        // Print the resource override pattern to use
        const urlPath = new URL(jsUrl).pathname; // e.g. /js/c91b8b1a111cca5c.js
        const dir = urlPath.substring(0, urlPath.lastIndexOf('/') + 1); // /js/
        console.log('\n──────────────────────────────────────────');
        console.log('Resource Override URL pattern to use:');
        console.log('  *://devast.io' + dir + '*.js*');
        console.log('──────────────────────────────────────────');

    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

runUpdater();
