const fs = require('fs');

async function runUpdater() {
    try {
        console.log("Fetching Devast.io...");
        const htmlResponse = await fetch('https://devast.io/');
        const html = await htmlResponse.text();

        // UPDATED REGEX: Looks specifically for a file path containing "js/client." 
        // Example match: /js/client.30.1108.min.js?17836165
        const scriptMatch = html.match(/src="([^"]*\/js\/client\.[^"]*\.js[^"]*)"/i);
        
        if (!scriptMatch) {
            throw new Error("Could not find the client.js file in the HTML source.");
        }

        let jsUrl = scriptMatch[1];
        if (!jsUrl.startsWith('http')) {
            jsUrl = 'https://devast.io/' + jsUrl.replace(/^\//, '');
        }

        console.log(`Found JS URL: ${jsUrl}`);

        const jsResponse = await fetch(jsUrl);
        let jsCode = await jsResponse.text();

        fs.writeFileSync('devast-original.js', jsCode);

        // --- APPLY YOUR REGEX MODIFICATIONS HERE ---
        console.log("Applying regex modifications...");
        
        // This replaces ALL instances of -0.35 with -0.65
        // (The \. escapes the dot so it reads it as a decimal point)
        jsCode = jsCode.replace(/-0\.35/g, '-0.65');

        fs.writeFileSync('devast-modded.js', jsCode);
        console.log("Successfully generated devast-modded.js");

    } catch (error) {
        console.error("Error during update:", error);
        process.exit(1);
    }
}

runUpdater();
