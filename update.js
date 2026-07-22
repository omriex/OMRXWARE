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

        // ── New kill bypass: proxy WebSocket constructor, patch instances ──
        const killBypass = `
(function() {
    var NativeWebSocket = WebSocket;
    var wsInstances = [];

    // Create a proxy that captures new WebSocket instances
    window.WebSocket = new Proxy(NativeWebSocket, {
        construct: function(target, args) {
            var ws = new target(...args);
            wsInstances.push(ws);
            return ws;
        }
    });
    // The proxy's toString() still returns "[native code]" – integrity OK.

    // After 4 seconds (before the ~6s kill timer), disable .close on all captured sockets
    setTimeout(function() {
        wsInstances.forEach(function(ws) {
            try { ws.close = function() {}; } catch(e) {}
        });
        console.log('[OMRXWARE] WebSocket.close neutralized on ' + wsInstances.length + ' connection(s)');
    }, 4000);

    console.log('[OMRXWARE] Kill bypass (WebSocket proxy) active');
})();
`;

        // Prepend the bypass – no other native API hooks
        jsCode = killBypass + '\n' + jsCode;

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
