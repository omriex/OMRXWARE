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
setTimeout(function() {
    try {
        // Inject CSS to permanently hide the UI elements safely.
        // Using !important overrides the game's inline style updates without breaking the JS engine!
        // We leave the HTML elements in the DOM so the game doesn't crash when it tries to read their styles.
        var style = document.createElement('style');
        style.innerHTML = '#terms, #howtoplay, #changelog, #featuredVideo, #bebebaba, .bebebaba, #devast-io_970x250, #preroll, #exapush-popup { display: none !important; opacity: 0 !important; visibility: hidden !important; pointer-events: none !important; width: 0 !important; height: 0 !important; z-index: -9999 !important; left: -9999px !important; top: -9999px !important; }';
        document.head.appendChild(style);

        // Load Omrxware
        var script = document.createElement('script');
        script.innerHTML = decodeURIComponent(escape(atob('${base64Script}')));
        document.body.appendChild(script);
        console.log("OMRXWARE successfully injected & HTML UI Elements hidden safely!");
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
