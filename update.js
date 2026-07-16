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

        jsCode = jsCode.replace(
            /(\[\s*\d+\s*,\s*0[0-7]+\s*\]|\[\s*\d+\s*,\s*\d+\s*\])(?=\s*;[^}]{0,300}catch)/,
            '(function(){' +
                'var _a=[30,1133];' +
                'var _v=new Proxy(_a,{' +
                    'get:function(t,p){' +
                        'if(p==="toString")return function(){return"OMRXWARE";};' +
                        'if(p==="length")return t.length;' +
                        'if(typeof p==="string"&&!isNaN(p)){var i=+p;return i<t.length?t[i]:0;}' +
                        'if(typeof p==="symbol")return t[p];' +
                        'return t[p];' +
                    '}' +
                '});' +
                'return _v;' +
            '})()'
        );

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
                set: function(v) { /* silently ignore */ },
                configurable: false,
                enumerable: false
            });
        } catch(e) {}
    });
    console.log('[OMRXWARE] AC flag interceptors installed:', _flags.length);
})();
`;

        // The game decodes the XHR server-list response inside an eval() call.
        // That eval'd code accesses e.g. serverEntry[7] on a value that is undefined
        // when our patches are active, causing a throw.
        // Fix: intercept eval and rewrite variable[N] (for N >= 3) as (variable||[])[N]
        // so undefined[7] returns undefined gracefully instead of throwing.
        // Only rewrite short-ish eval strings (response decoders, not the full bundle).
        const evalPatch = `
(function() {
    var _origEval = window.eval;
    window.eval = function(code) {
        if (typeof code === 'string' && code.length < 100000) {
            try {
                code = code.replace(
                    /\b([a-zA-Z_$][\w$]{0,30})\[([3-9]|[1-9]\d+)\]/g,
                    '($1||[])[$2]'
                );
            } catch(e) {}
        }
        return _origEval.call(this, code);
    };
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
        jsCode = evalPatch    + '\n' + jsCode;
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
