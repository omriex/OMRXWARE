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
// --- OMRXWARE BOOTLOADER ---
(function() {
    // 1. SAFE Anti-Crash DOM Proxy
    // We ONLY intercept the exact elements we want to hide.
    // This stops the game from accidentally binding to fake Name Inputs and Server Selects!
    var targets = [
        'terms', 'howtoplay', 'changelog', 'featuredVideo', 
        'bebebaba', 'devast-io_970x250', 'preroll', 'exapush-popup'
    ];
    
    var origGet = document.getElementById;
    document.getElementById = function(id) {
        var el = origGet.call(document, id);
        
        // If the game asks for one of our targets and it isn't ready yet, give it a fake dummy so it doesn't crash.
        if (!el && targets.indexOf(id) !== -1) {
            el = document.createElement('div');
            el.id = id;
            el.style.display = 'none'; 
        }
        return el;
    };

    // 2. Safely Hide Target UI Elements via CSS
    var style = document.createElement('style');
    style.innerHTML = '#' + targets.join(', #') + ' { display: none !important; opacity: 0 !important; visibility: hidden !important; pointer-events: none !important; z-index: -9999 !important; width: 0 !important; height: 0 !important; }';
    
    // Hide ad classes too
    style.innerHTML += ' .bebebaba { display: none !important; }';
    
    if (document.head) {
        document.head.appendChild(style);
    } else {
        document.addEventListener('DOMContentLoaded', function() {
            document.head.appendChild(style);
        });
    }

    // 3. Inject the Omrxware script after 1s
    setTimeout(function() {
        try {
            var script = document.createElement('script');
            script.innerHTML = decodeURIComponent(escape(atob('${base64Script}')));
            document.body.appendChild(script);
            console.log("OMRXWARE successfully injected! HTML UI hidden properly.");
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
