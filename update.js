const fs = require('fs');

async function runUpdater() {
    try {
        console.log("Fetching Devast.io...");
        const htmlResponse = await fetch('https://devast.io/');
        const html = await htmlResponse.text();

        const scriptMatch = html.match(/src="(js\/[^"]+\.js[^"]*)"/i)
                         || html.match(/src="([^"]*client\.[0-9.]*min\.js[^"]*)"/i);
        if (!scriptMatch) throw new Error("Could not find the client.js file.");

        let jsUrl = scriptMatch[1];
        if (!jsUrl.startsWith('http')) jsUrl = 'https://devast.io/' + jsUrl.replace(/^\//, '');

        const jsResponse = await fetch(jsUrl);
        let jsCode = await jsResponse.text();

        fs.writeFileSync('devast-original.js', jsCode);

        jsCode = jsCode.replace(/-0\.35/g, '-0.65');

        // Bypass the anti-cheat verification flag (ⲟ̋︄)
        const flagVar = '\u2c9f\u030b\ufe04';
        const anticheatRegex = new RegExp(flagVar + '\\s*=\\s*(?!=)([^;(),\\s]+)', 'g');
        jsCode = jsCode.replace(anticheatRegex, flagVar + ' = 0');

        // Bypass the tamper score (ѕᚇᄇ) on player/object prototype
        const tamperBypass = `
Object.defineProperty(Object.prototype, '\\u0455\\u1687\\u10c3', {
    get: function() { return 0; },
    set: function(val) {},
    configurable: true
});
`;
        jsCode = tamperBypass + '\n' + jsCode;


        try {
            const myCustomScript = fs.readFileSync('omrxware.js', 'utf8');
            
            const base64Script = Buffer.from(myCustomScript).toString('base64');
            
            const injectionCode = `
setTimeout(function() {
    try {
        var script = document.createElement('script');
        script.innerHTML = decodeURIComponent(escape(atob('${base64Script}')));
        document.body.appendChild(script);
        console.log("OMRXWARE successfully injected!");
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
