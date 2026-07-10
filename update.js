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

        // Apply Zoom patch
        jsCode = jsCode.replace(/-0\.35/g, '-0.65');

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

    // 3. ZERO-LAG CANVAS HIJACK
    // Use a lightweight timer to check if we are in the menu.
    // This stops the JS engine from choking and causing you to disconnect/die on spawn!
    var isMainMenu = true;
    setInterval(function() {
        var nickContainer = document.getElementById('nickname');
        var nickInput = document.getElementById('nicknameInput');
        
        // If the nickname wrapper or input is hidden, we are officially in-game.
        if (nickContainer && nickContainer.style.display === 'none') {
            isMainMenu = false;
        } else if (nickInput && nickInput.offsetParent === null) {
            isMainMenu = false;
        } else {
            isMainMenu = true;
        }
    }, 500);

    const origDrawImage = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function() {
        // QUICK EXIT: Checks a single boolean instead of querying the DOM. Zero FPS lag!
        if (!isMainMenu) {
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

                    // Asymmetrical Safe Zone
                    if (relX < -440 || relX > 275) {
                        return; // Drop frame
                    }
                }
            }
        } catch (err) {}
        
        return origDrawImage.apply(this, arguments);
    };
    
    // ANTI-CHEAT SPOOF: Disguise our hooked function so the game thinks it's native browser code
    CanvasRenderingContext2D.prototype.drawImage.toString = function() {
        return 'function drawImage() { [native code] }';
    };

    // 4. Inject Omrxware
    setTimeout(function() {
        try {
            var script = document.createElement('script');
            script.innerHTML = decodeURIComponent(escape(atob('${base64Script}')));
            document.body.appendChild(script);
            console.log("OMRXWARE successfully injected! Lag fixed, Anti-Cheat spoofed.");
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
