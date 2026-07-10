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
    // 1. Anti-Crash DOM Proxy: Prevents ANY "Cannot read properties of null (reading 'style')" crashes.
    // If the game or an ad-blocker removes an element, we supply a dummy element so the game's JS engine doesn't crash!
    var origGet = document.getElementById;
    document.getElementById = function(id) {
        var el = origGet.call(document, id);
        if (!el) {
            el = document.createElement('div');
            el.id = id;
            el.style.display = 'none'; // Safe dummy element
        }
        return el;
    };

    // 2. Safely Hide UI Elements via CSS (Forces them to 0 pixels entirely)
    var style = document.createElement('style');
    style.innerHTML = '#terms, #howtoplay, #changelog, #featuredVideo, #bebebaba, .bebebaba, #devast-io_970x250, #preroll, #exapush-popup { display: none !important; opacity: 0 !important; visibility: hidden !important; pointer-events: none !important; z-index: -9999 !important; left: -9999px !important; top: -9999px !important; width: 0 !important; height: 0 !important; max-width: 0 !important; max-height: 0 !important; overflow: hidden !important; }';
    
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
            console.log("OMRXWARE successfully injected & UI hidden safely without crashing!");
        } catch (e) {
            console.error("Injection error:", e);
        }
    }, 1000);
})();
// ---------------------------
`;
            // Notice this is added to the TOP of the JS file now, ensuring protection starts instantly!
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
