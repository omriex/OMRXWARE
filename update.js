const fs = require('fs');

/**
 * Removes the ad code block that starts with a specific obfuscated pattern.
 * The ad code is wrapped in:
 *   if (undefined === օ༦️) {
 *     ... (all ad related code)
 *   }
 * This function finds that block by locating the 'if' statement and counting
 * braces to extract and remove the entire block.
 *
 * @param {string} code - The original client JS.
 * @returns {string} - Code with the ad block removed.
 */
function removeAdBlock(code) {
    // The obfuscated variable name may change across versions.
    // We look for the pattern: if (undefined === <someVariable>) {
    // In the provided snippet it is: if (undefined === օ༦️) {
    // We'll search for a generic pattern: "if (undefined === " followed by a
    // variable name and then a '{'. To be safe, we'll look for the literal
    // string from the snippet, but we can also make it more flexible.
    const startPattern = /if\s*\(undefined\s*===\s*[a-zA-Z0-9_]+\)\s*\{/;
    const match = code.match(startPattern);
    if (!match) {
        console.log('Ad block start pattern not found. Skipping ad removal.');
        return code;
    }

    const startIndex = match.index;
    // Find the matching closing brace for this 'if' block
    let openBraces = 0;
    let endIndex = startIndex;
    for (let i = startIndex; i < code.length; i++) {
        const ch = code[i];
        if (ch === '{') openBraces++;
        else if (ch === '}') {
            openBraces--;
            if (openBraces === 0) {
                endIndex = i + 1; // include the closing brace
                break;
            }
        }
    }

    if (endIndex === startIndex) {
        console.warn('Could not find matching closing brace for ad block. No removal.');
        return code;
    }

    // Remove the block
    const before = code.slice(0, startIndex);
    const after = code.slice(endIndex);
    console.log(`Removed ad block (${endIndex - startIndex} characters).`);
    return before + after;
}

async function runUpdater() {
    try {
        console.log("Fetching Devast.io...");
        const htmlResponse = await fetch('https://devast.io/');
        const html = await htmlResponse.text();

        const scriptMatch = html.match(/src="([^"]*client\.[0-9.]*min\.js[^"]*)"/i);
        if (!scriptMatch) throw new Error("Could not find the client.js file.");

        let jsUrl = scriptMatch[1];
        if (!jsUrl.startsWith('http')) jsUrl = 'https://devast.io/' + jsUrl.replace(/^\//, '');

        console.log("Fetching client JS:", jsUrl);
        const jsResponse = await fetch(jsUrl);
        let jsCode = await jsResponse.text();

        // Save original for reference
        fs.writeFileSync('devast-original.js', jsCode);

        // ---- Remove ad code ----
        jsCode = removeAdBlock(jsCode);

        // ---- Apply gameplay tweak ----
        jsCode = jsCode.replace(/-0\.35/g, '-0.65');

        // ---- Inject custom script (omrxware.js) ----
        try {
            const myCustomScript = fs.readFileSync('omrxware.js', 'utf8');
            const base64Script = Buffer.from(myCustomScript).toString('base64');

            const injectionCode = `
// Delay injection by 1 second to let the game fully load its UI and Keybinds
setTimeout(function() {
    try {
        var script = document.createElement('script');
        // Safely decode the Base64 script and place it in the tag
        script.innerHTML = decodeURIComponent(escape(atob('${base64Script}')));
        document.body.appendChild(script);
        console.log("Custom script successfully injected via Base64!");
    } catch (e) {
        console.error("Injection error:", e);
    }
}, 1000); 
`;
            jsCode = jsCode + '\n\n;\n' + injectionCode;
        } catch (err) {
            console.error("Could not find omrxware.js. Skipping injection.");
        }

        fs.writeFileSync('devast-modded.js', jsCode);
        console.log("Successfully generated devast-modded.js");

    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

runUpdater();
