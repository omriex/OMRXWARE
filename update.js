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
    // 1. SAFE Anti-Crash DOM Proxy (Prevents missing HTML element crashes)
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

    // 3. PERFECTED CANVAS RENDERING HIJACK (Removes Grey Panels, Keeps Logo & Locks)
    const origDrawImage = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function() {
        try {
            // Only hide panels when we are on the Main Menu
            var nickInput = document.getElementById('nicknameInput');
            var isMainMenu = nickInput && nickInput.offsetParent !== null;

            if (isMainMenu) {
                var dx = undefined;
                
                // Get the X coordinate based on how many arguments the game engine passed
                if (arguments.length === 3 || arguments.length === 5) {
                    dx = arguments[1];
                } else if (arguments.length === 9) {
                    dx = arguments[5];
                }

                if (dx !== undefined) {
                    var transform = this.getTransform();
                    
                    // Calculate the ABSOLUTE X coordinate on your monitor
                    var absX = dx * transform.a + transform.e;
                    var canvasCenter = this.canvas.width / 2;
                    
                    // Identify UI elements (They are drawn at scale 1.0, game world is scaled by zoom)
                    var isUI = Math.abs(transform.a - 1) < 0.05 || Math.abs(transform.a - window.devicePixelRatio) < 0.05;

                    if (isUI) {
                        // The entire center block (Logo, private server, ghoul mode) is ~800px wide.
                        // Safe zone is 450 pixels to the left and right of the exact center.
                        var safeRadius = 450; 

                        // If the element is drawn on the far-left or far-right edge, delete it!
                        if (absX < canvasCenter - safeRadius || absX > canvasCenter + safeRadius) {
                            return; // Do not draw this frame!
                        }
                    }
                }
            }
        } catch (err) {
            // Failsafe: Ensures the game engine never crashes
        }
        
        // Let the game draw everything inside the safe zone normally (Logo, Locks, Background)
        return origDrawImage.apply(this, arguments);
    };

    // 4. Inject the Omrxware script
    setTimeout(function() {
        try {
            var script = document.createElement('script');
            script.innerHTML = decodeURIComponent(escape(atob('${base64Script}')));
            document.body.appendChild(script);
            console.log("OMRXWARE successfully injected! Perfect UI Cleanup applied.");
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
