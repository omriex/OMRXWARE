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
        jsCode = jsCode.replace(/-0\.35/g, '-0.65');
        console.log('[OK] Zoom mod (' + physCount + ' replacements)');

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

        const flagInterceptor = `
(function() {
    var _flags = ${JSON.stringify(flagVars)};
    _flags.forEach(function(f) {
        try {
            Object.defineProperty(window, f, {
                get: function() { return 0; },
                set: function(v) {},
                configurable: false,
                enumerable: false
            });
        } catch(e) {}
    });
    console.log('[OMRXWARE] AC flag interceptors installed:', _flags.length);
})();
`;

        // Each wrapper spoofs its own toString so the game sees "[native code]"
        // and does not flag the token as hooked when it checks function identity.
        const wasmBypass = `
(function() {
    var _origInstantiate = WebAssembly.instantiate;
    var _origInstantiateStreaming = WebAssembly.instantiateStreaming;
    var _wrapInstantiate = function(buf, imports) {
        return _origInstantiate(buf, imports);
    };
    var _wrapInstantiateStreaming = function(src, imports) {
        return _origInstantiateStreaming(src, imports);
    };
    _wrapInstantiate.toString = function() { return 'function instantiate() { [native code] }'; };
    _wrapInstantiateStreaming.toString = function() { return 'function instantiateStreaming() { [native code] }'; };
    WebAssembly.instantiate = _wrapInstantiate;
    WebAssembly.instantiateStreaming = _wrapInstantiateStreaming;
})();
`;

        const timingBypass = `
(function() {
    var _perfNow = performance.now.bind(performance);
    var _dateNow = Date.now.bind(Date);
    var _wrapPerfNow = function() { return _perfNow(); };
    var _wrapDateNow = function() { return _dateNow(); };
    _wrapPerfNow.toString = function() { return 'function now() { [native code] }'; };
    _wrapDateNow.toString = function() { return 'function now() { [native code] }'; };
    performance.now = _wrapPerfNow;
    Date.now = _wrapDateNow;
})();
`;

        const canvasBypass = `
(function() {
    var _origToDataURL = HTMLCanvasElement.prototype.toDataURL;
    var _wrapToDataURL = function(type, quality) {
        return _origToDataURL.call(this, type, quality);
    };
    _wrapToDataURL.toString = function() { return 'function toDataURL() { [native code] }'; };
    HTMLCanvasElement.prototype.toDataURL = _wrapToDataURL;
    if (typeof OffscreenCanvas !== 'undefined') {
        var _origOff = OffscreenCanvas.prototype.convertToBlob;
        if (_origOff) {
            var _wrapOff = function() { return _origOff.apply(this, arguments); };
            _wrapOff.toString = function() { return 'function convertToBlob() { [native code] }'; };
            OffscreenCanvas.prototype.convertToBlob = _wrapOff;
        }
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

        jsCode = uiRemover    + '\n' + jsCode;
        jsCode = canvasBypass + '\n' + jsCode;
        jsCode = timingBypass + '\n' + jsCode;
        jsCode = wasmBypass   + '\n' + jsCode;
        jsCode = flagInterceptor + '\n' + jsCode;

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
