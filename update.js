const fs = require('fs');

async function runUpdater() {
    try {
        console.log('Fetching Devast.io...');

        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Cache-Control': 'max-age=0'
        };

        const htmlResponse = await fetch('https://devast.io/', { headers });
        const html = await htmlResponse.text();

        fs.writeFileSync('debug-html.html', html);
        console.log('[DEBUG] Saved raw HTML to debug-html.html (first 500 chars):');
        console.log(html.substring(0, 500) + '...\n');

        const scriptSrcRegex = /<script[^>]*src=["']([^"']+\.js)["'][^>]*>/gi;
        let match;
        const scriptUrls = [];
        while ((match = scriptSrcRegex.exec(html)) !== null) {
            scriptUrls.push(match[1]);
        }

        if (scriptUrls.length === 0) {
            throw new Error('No script tags with .js src found in HTML.');
        }

        console.log(`[DEBUG] Found ${scriptUrls.length} script URLs:`, scriptUrls);

        let selected = scriptUrls.find(url => url.includes('js/') && !url.includes('jquery') && !url.includes('bootstrap'));
        if (!selected) {
            selected = scriptUrls.find(url => url.includes('client') || url.includes('main') || url.includes('bundle'));
        }
        if (!selected) {
            selected = scriptUrls.reduce((a, b) => a.length > b.length ? a : b);
        }

        console.log('[DEBUG] Selected script URL:', selected);

        let jsUrl = selected;
        if (!jsUrl.startsWith('http')) {
            jsUrl = 'https://devast.io/' + jsUrl.replace(/^\//, '');
        }

        console.log('Downloading', jsUrl);

        const jsResponse = await fetch(jsUrl, { headers });
        let jsCode = await jsResponse.text();

        fs.writeFileSync('devast-original.js', jsCode);
        console.log('[OK] Saved devast-original.js');

        const physCount = (jsCode.match(/-0\.35/g) || []).length;
        jsCode = jsCode.replace(/-0\.35/g, '-0.65');
        console.log('[OK] Physics mod (' + physCount + ' replacements)');

        jsCode = jsCode.replace(
            /(\[\s*\d+\s*,\s*0[0-7]+\s*\]|\[\s*\d+\s*,\s*\d+\s*\])(?=\s*;[^}]{0,300}catch)/,
            '(function(){var _v=[30,1133];_v.toString=function(){return"OMRXWARE";};return _v;})()'
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
                set: function(v) { },
                configurable: false,
                enumerable: false
            });
        } catch(e) {}
    });
    console.log('[OMRXWARE] AC flag interceptors installed:', _flags.length);
})();
`;

        const protoBypass = `
(function() {
    var _oldProps = [
        '\u0455\u1687\u10c3',
        '\u2c9f\u030b\ufe04',
        '\u0440\u0789\u034f',
    ];
    _oldProps.forEach(function(prop) {
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
        jsCode = protoBypass  + '\n' + jsCode;
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
            console.error('Could not find omrxware.js. Exiting.');
            process.exit(1);
        }

        fs.writeFileSync('devast-modded.js', jsCode);
        console.log('\n✓ devast-modded.js ready');
        console.log('Resource Override pattern: *://devast.io/js/*.js*');

    } catch(err) {
        console.error(err);
        process.exit(1);
    }
}

runUpdater();
