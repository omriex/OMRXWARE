const fs = require('fs');

async function runUpdater() {
    try {
        console.log("Fetching Devast.io...");
        const htmlResponse = await fetch('https://devast.io/');
        const html = await htmlResponse.text();

        const scriptMatch = html.match(/src="([^"]*client\.[0-9.]*min\.js[^"]*)"/i);
        if (!scriptMatch) throw new Error("Could not find the client.js file.");

        let jsUrl = scriptMatch[1];
        if (!jsUrl.startsWith('http')) jsUrl = 'https://devast.io/' + jsUrl.replace(/^\//, '');

        const jsResponse = await fetch(jsUrl);
        let jsCode = await jsResponse.text();

        fs.writeFileSync('devast-original.js', jsCode);

        // --- 1. ZOOM PATCH (works fine) ---
        jsCode = jsCode.replace(/-0\.35/g, '-0.65');

        // --- 2. ANTICHEAT PATCH (direct regex replacement) ---
        // This replaces the WebSocket native‑code check with a simple assignment.
        jsCode = jsCode.replace(
            /if\s*\(\s*webSocketInstance\s*===\s*undefined\s*\)\s*\{\s*try\s*\{\s*if\s*\(\s*typeof\s*window\.WebSocket\s*!==\s*"function"\s*\|\|\s*indexOf\s*\(\s*Function\.prototype\.toString\.call\s*\(\s*window\.WebSocket\s*\)\s*,\s*"\[native\s*code\]"\s*\)\s*===\s*-1\s*\)\s*\{\s*webSocketInstance\s*=\s*null;\s*\}\s*else\s*\{\s*webSocketInstance\s*=\s*new\s*window\.WebSocket\s*\(\s*"wss:\/\/127\.0\.0\.1:1"\s*\);\s*\}\s*\}\s*catch\s*\(\s*err\s*\)\s*\{\s*webSocketInstance\s*=\s*null;\s*\}\s*\}/,
            'if (webSocketInstance === undefined) { webSocketInstance = new window.WebSocket("wss://127.0.0.1:1"); }'
        );

        // --- 3. ORIGINAL BOOTLOADER (unchanged) ---
        try {
            const myCustomScript = fs.readFileSync('omrxware.js', 'utf8');
            const base64Script = Buffer.from(myCustomScript).toString('base64');

            const injectionCode = `
// --- OMRXWARE BOOTLOADER & UI REMOVER ---
(function() {
    // 1. SAFE Anti-Crash DOM Proxy
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

    // 2. Safely Hide Target UI Texts via CSS
    var style = document.createElement('style');
    style.innerHTML = '#' + targets.join(', #') + ' { display: none !important; opacity: 0 !important; visibility: hidden !important; pointer-events: none !important; z-index: -9999 !important; width: 0 !important; height: 0 !important; }';
    style.innerHTML += ' .bebebaba { display: none !important; }';
    
    if (document.head) document.head.appendChild(style);
    else document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style));

    // 3. FLAWLESS & OPTIMIZED CANVAS RENDERING HIJACK
    const origDrawImage = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function() {
        var nickInput = document.getElementById('nicknameInput');
        if (!nickInput || nickInput.offsetParent === null) {
            return origDrawImage.apply(this, arguments);
        }

        try {
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

                    if (relX < -440 || relX > 275) {
                        return; // Stop drawing the side panels!
                    }
                }
            }
        } catch (err) {}
        
        return origDrawImage.apply(this, arguments);
    };

    // 4. Inject Omrxware
    setTimeout(function() {
        try {
            var script = document.createElement('script');
            script.innerHTML = decodeURIComponent(escape(atob('${base64Script}')));
            document.body.appendChild(script);
            console.log("OMRXWARE successfully injected! Menu isolated and In-Game FPS optimized.");
        } catch (e) {
            console.error("Injection error:", e);
        }
    }, 1000);
})();
// ---------------------------
`;
            // Add the bootloader to the TOP of the script
            jsCode = injectionCode + '\n;\n' + jsCode;

        } catch (err) {
            console.error("Could not find omrxware.js.");
        }

        fs.writeFileSync('devast-modded.js', jsCode);
        console.log("Successfully generated devast-modded.js");

    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

runUpdater();
