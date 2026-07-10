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
    // Prevents the game from crashing when it tries to modify HTML texts we hide.
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

    // 3. CANVAS RENDERING HIJACK (The magic trick to remove the Grey Panels)
    // The grey panels are drawn directly onto the <canvas>. CSS cannot hide them.
    // We intercept the drawImage function and stop them from rendering entirely!
    const origDrawImage = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function(image, ...args) {
        
        // Check if we are currently on the Main Menu (nickname input is visible)
        var nickInput = document.getElementById('nicknameInput');
        var isMainMenu = nickInput && nickInput.offsetParent !== null;

        if (isMainMenu) {
            // Get the X coordinate where the game is trying to draw an image
            var dx = args.length >= 8 ? args[4] : args[0];
            var center = window.innerWidth / 2;
            
            // Devast UI panels are drawn without camera scaling (transform.a === 1)
            // The scrolling background world is scaled, so this ensures we don't hide the background trees/ground!
            var transform = this.getTransform();
            var isUI = Math.abs(transform.a - 1) < 0.01 && Math.abs(transform.d - 1) < 0.01;

            // If it is a UI element drawn on the far left or far right, BLOCK IT.
            // This leaves the middle panel (center - 350 to center + 250) perfectly intact.
            if (isUI && (dx < center - 350 || dx > center + 250)) {
                return; // Skip drawing!
            }
        }
        
        // Draw everything else normally
        return origDrawImage.apply(this, args);
    };

    // 4. Inject the Omrxware script after 1s
    setTimeout(function() {
        try {
            var script = document.createElement('script');
            script.innerHTML = decodeURIComponent(escape(atob('${base64Script}')));
            document.body.appendChild(script);
            console.log("OMRXWARE successfully injected! Canvas panels & HTML UI removed.");
        } catch (e) {
            console.error("Injection error:", e);
        }
    }, 1000);
})();
// ---------------------------
`;
            // Add the bootloader to the TOP of the script so it protects the engine immediately
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
