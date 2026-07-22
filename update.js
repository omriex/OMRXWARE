// updater.js
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

        // Physics modifier
        const physCount = (jsCode.match(/-0\.35/g) || []).length;
        if (physCount > 0) {
            jsCode = jsCode.replace(/-0\.35/g, '-0.65');
            console.log('[OK] Physics mod (' + physCount + ' replacements)');
        } else {
            console.log('[OK] Physics mod (none found – may already be patched)');
        }

        // Detect AC flag variable names
        const flagVars = [];
        const tryFlagRe = /try\s*\{\s*(\S+)\s*=\s*[^=\n][^\n;]{5,800}\?\s*(?:0[xX]?1|01|1)\s*:\s*(?:0[xX]?0|0x0|00|0)\s*;\s*\}\s*catch\s*\(\s*\S+\s*\)\s*\{[^{}]*\}/g;
        let m;
        while ((m = tryFlagRe.exec(jsCode)) !== null) {
            if (!flagVars.includes(m[1])) flagVars.push(m[1]);
        }
        if (flagVars.length < 3) {
            const declRe = /var\s+(\S+)\s*=\s*(?:0[xX]?0|00|0)\s*;/g;
            while ((m = declRe.exec(jsCode)) !== null) {
                if (flagVars.includes(m[1])) continue;
                const next500 = jsCode.substring(m.index, m.index + 500);
                if (/try\s*\{/.test(next500) && /chrome|CSS|safari/i.test(next500)) {
                    flagVars.push(m[1]);
                }
            }
        }
        console.log('[AC] Detected', flagVars.length, 'flag var(s):', flagVars.map(JSON.stringify).join(', ') || 'none');

        // Delayed kill bypass – the only hook, safe because it doesn't wrap native APIs
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
                        if (typeof v === 'number') _stored = 0;
                        else _stored = v;
                    },
                    configurable: true,
                    enumerable: false
                });
            } catch(e) {}
        });
        console.log('[OMRXWARE] Kill bypass active (' + _flags.length + ' flags zeroed)');
    }

    setTimeout(installKillBypass, 5000);
    console.log('[OMRXWARE] Kill bypass scheduled in 5s (flags:', _flags.length, ')');
})();
`;

        jsCode = delayedKillBypass + '\n' + jsCode;

        // Inject omrxware.js (unchanged)
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
