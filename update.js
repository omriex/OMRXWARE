
const fs = require('fs');

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

        jsCode = jsCode.replace(/-0\.35/g, '-0.65');
        console.log('[OK] Physics modifier applied');

        const AC_SENTINELS = [
            '999',
            '0x3[Ee]7',
            '0X3[Ee]7',
            '01747',       
            '0x3e7',
        ];
        const sentinelAlt = AC_SENTINELS.join('|');

        jsCode = jsCode.replace(
            new RegExp('[?]\\s*([^;:?]{1,60}?)\\s*:\\s*(' + sentinelAlt + ')(?=[\\s;,)[\\]])', 'g'),
            function(_, trueVal) { return '? ' + trueVal + ' : 0'; }
        );

        jsCode = jsCode.replace(
            new RegExp('[=]\\s*(' + sentinelAlt + ')\\s*;', 'g'),
            '= 0;'
        );
        console.log('[OK] State-machine sentinels zeroed');

        jsCode = jsCode.replace(
            /=\s*(\([^;]{5,400}?\))\s*\?\s*(?:0[xX]?1|01|1)\s*:\s*(?:0[xX]?0|0x0|00|0)\s*;/g,
            '= 0;'
        );

        jsCode = jsCode.replace(
            /=\s*(\([^;]{5,400}?\))\s*\?\s*(?:0[xX]?0|0x0|00|0)\s*:\s*(?:0[xX]?1|01|1)\s*;/g,
            '= 0;'
        );
        console.log('[OK] Flag-variable assignments zeroed');

        const definePropertyShield = `
(function() {
    var _origDefProp = Object.defineProperty;
    Object.defineProperty = function(target, prop, descriptor) {
        if (target === Object.prototype) {
            try {
                var safeDesc = Object.assign({}, descriptor, {
                    configurable: true,
                    enumerable:   false
                });
                return _origDefProp.call(this, target, prop, safeDesc);
            } catch(e) { return target; }
        }
        return _origDefProp.apply(this, arguments);
    };
})();
`;
        jsCode = definePropertyShield + '\n' + jsCode;
        console.log('[OK] Object.prototype defineProperty shield prepended');

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

        const timingBypass = `
(function() {
    var _perfNow = performance.now.bind(performance);
    var _dateNow = Date.now.bind(Date);
    performance.now = function() { return _perfNow(); };
    Date.now = function() { return _dateNow(); };
})();
`;
        jsCode = timingBypass + '\n' + jsCode;

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
