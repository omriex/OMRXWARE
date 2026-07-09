const fs = require('fs');

async function runUpdater() {
    try {
        console.log("Fetching Devast.io...");
        const htmlResponse = await fetch('https://devast.io/');
        const html = await htmlResponse.text();

        // BULLETPROOF REGEX: Looks exactly for anything that includes "client.[numbers].min.js"
        const scriptMatch = html.match(/src="([^"]*client\.[0-9.]*min\.js[^"]*)"/i);
        
        if (!scriptMatch) {
            throw new Error("Could not find the client.js file in the HTML source.");
        }

        let jsUrl = scriptMatch[1];
        // If it extracted "js/client...js", turn it into "https://devast.io/js/client...js"
        if (!jsUrl.startsWith('http')) {
            jsUrl = 'https://devast.io/' + jsUrl.replace(/^\//, '');
        }

        console.log(`Found JS URL: ${jsUrl}`);

        // Download the script
        const jsResponse = await fetch(jsUrl);
        let jsCode = await jsResponse.text();

        // Save original
        fs.writeFileSync('devast-original.js', jsCode);

        // Apply your modifications
        console.log("Applying regex modifications...");
        jsCode = jsCode.replace(/-0\.35/g, '-0.65');

        // ==========================================
        // NEW CODE: LOAD AND APPEND YOUR OWN SCRIPT
        // ==========================================
        console.log("Injecting custom script...");
        try {
            // Read your custom script file
            const myCustomScript = fs.readFileSync('omrxware.js', 'utf8');
            
            // Append it to the end of the game's code 
            // (The '\n\n' ensures it starts on a new line and doesn't break existing code)
            jsCode = jsCode + '\n\n/* --- MY CUSTOM SCRIPT START --- */\n' + myCustomScript + '\n/* --- MY CUSTOM SCRIPT END --- */\n';
            
            console.log("Custom script injected successfully!");
        } catch (err) {
            console.error("Could not load omrxware.js. Make sure the file exists in the same folder.");
        }
        // ==========================================

        // Save modded
        fs.writeFileSync('devast-modded.js', jsCode);
        console.log("Successfully generated devast-modded.js");

    } catch (error) {
        console.error("Error during update:", error);
        process.exit(1);
    }
}

runUpdater();
