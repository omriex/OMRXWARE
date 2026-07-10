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

        // Zoom patch
        jsCode = jsCode.replace(/-0\.35/g, '-0.65');

        // Regex replacements to remove the specified UI elements if they exist as HTML strings inside the JS
        jsCode = jsCode.replace(/<div[^>]*id="terms"[^>]*>[\s\S]*?<\/div>/gi, '');
        jsCode = jsCode.replace(/<div[^>]*id="featuredVideo"[^>]*>[\s\S]*?<\/div>/gi, '');
        jsCode = jsCode.replace(/<div[^>]*id="changelog"[^>]*>[\s\S]*?CHANGELOG[\s\S]*?(?:<\/div>\s*){3}/gi, '');
        jsCode = jsCode.replace(/<div[^>]*id="howtoplay"[^>]*>[\s\S]*?HOW TO PLAY\?[\s\S]*?(?:<\/div>\s*){2,5}(?:<script[\s\S]*?<\/script>\s*)?(?:<\/div>)?/gi, '');
        jsCode = jsCode.replace(/<div[^>]*id="bebebaba"[^>]*>[\s\S]*?<\/div>/gi, '');

        // Neutralize the game's JS logic that tries to make these elements visible (prevents errors/re-appearing)
        jsCode = jsCode.replace(/(?:document\.)?getElementById\(['"](?:terms|howtoplay|changelog|featuredVideo)['"]\)\.style\.display\s*=\s*['"](?:inline-block|block|flex)['"]/gi, 'void(0)');

        try {
            const myCustomScript = fs.readFileSync('omrxware.js', 'utf8');
            
            const base64Script = Buffer.from(myCustomScript).toString('base64');
            
            const injectionCode = `
setTimeout(function() {
    try {
        // Fallback 1: Inject hardcoded CSS to permanently hide them and their ad containers
        var style = document.createElement('style');
        style.innerHTML = '#terms, #howtoplay, #changelog, #featuredVideo, #bebebaba, .bebebaba, #devast-io_970x250, #preroll { display: none !important; opacity: 0 !important; visibility: hidden !important; pointer-events: none !important; width: 0 !important; height: 0 !important; }';
        document.head.appendChild(style);

        // Fallback 2: Bruteforce remove them from the DOM completely
        ['terms', 'howtoplay', 'changelog', 'featuredVideo', 'bebebaba', 'devast-io_970x250', 'preroll'].forEach(function(id) {
            var el = document.getElementById(id);
            if (el) el.remove();
        });
        
        // Remove class based elements (like the .bebebaba ad container)
        var classEls = document.querySelectorAll('.bebebaba');
        classEls.forEach(function(el) { el.remove(); });

        // Load Omrxware
        var script = document.createElement('script');
        script.innerHTML = decodeURIComponent(escape(atob('${base64Script}')));
        document.body.appendChild(script);
        console.log("OMRXWARE successfully injected & UI Elements removed!");
    } catch (e) {
        console.error("Injection error:", e);
    }
}, 1000); 
`;
            jsCode = jsCode + '\n\n;\n' + injectionCode;
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
