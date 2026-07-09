// update.js
const fs = require('fs');

async function runUpdater() {
    try {
        // 1. Fetch the main HTML page of the game
        console.log("Fetching Devast.io...");
        const htmlResponse = await fetch('https://devast.io/');
        const html = await htmlResponse.text();

        // 2. Find the main JavaScript file URL using Regex
        // Note: You may need to inspect devast.io's source to find the exact filename pattern.
        // Usually, it looks like bundle.js, client.js, or main.js. 
        const scriptMatch = html.match(/<script[^>]+src="([^"]+\.js[^"]*)"/i);
        
        if (!scriptMatch) {
            throw new Error("Could not find the main JS file in the HTML source.");
        }

        let jsUrl = scriptMatch[1];
        // Ensure the URL is absolute
        if (!jsUrl.startsWith('http')) {
            jsUrl = 'https://devast.io/' + jsUrl.replace(/^\//, '');
        }

        console.log(`Found JS URL: ${jsUrl}`);

        // 3. Download the current client JS
        const jsResponse = await fetch(jsUrl);
        let jsCode = await jsResponse.text();

        // Save the original code so you can track the game's native updates in GitHub history
        fs.writeFileSync('devast-original.js', jsCode);

        // 4. Apply your Regex modifications
        console.log("Applying regex modifications...");
        
        // EXAMPLE MODIFICATION 1: Change a specific value (e.g., zoom/camera size)
        // Since the game is minified, you have to look for minified patterns.
        jsCode = jsCode.replace(/camera:\{zoom:\d+\}/g, 'camera:{zoom:9999}');
        
        // EXAMPLE MODIFICATION 2: Inject your own code into an initialization function
        // Finds a function like `function init(){` and adds a console log
        jsCode = jsCode.replace(/(function \w+\(\)\{)/, '$1 console.log("Modded Script Loaded!");');

        // 5. Save the modded script
        fs.writeFileSync('devast-modded.js', jsCode);
        console.log("Successfully generated devast-modded.js");

    } catch (error) {
        console.error("Error during update:", error);
        process.exit(1);
    }
}

runUpdater();
