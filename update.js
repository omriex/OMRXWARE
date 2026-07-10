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

        // Zoom patch (kept – works fine alone)
        jsCode = jsCode.replace(/-0\.35/g, '-0.65');

        try {
            const myCustomScript = fs.readFileSync('omrxware.js', 'utf8');
            const base64Script = Buffer.from(myCustomScript).toString('base64');

            // NEW BOOTLOADER – no overrides, just CSS + Blob injection
            const injectionCode = `
// --- OMRXWARE BOOTLOADER (MINIMAL, NO NATIVE OVERRIDES) ---
(function() {
    console.log("[OMRXWARE] Bootloader starting – CSS only + Blob injection");

    // 1. Hide UI panels using pure CSS (no getElementById override)
    const targets = [
        'terms', 'howtoplay', 'changelog', 'featuredVideo',
        'bebebaba', 'devast-io_970x250', 'preroll', 'exapush-popup'
    ];
    const style = document.createElement('style');
    style.innerHTML = targets.map(id => '#' + id).join(', ') + 
        ' { display: none !important; opacity: 0 !important; visibility: hidden !important; pointer-events: none !important; z-index: -9999 !important; width: 0 !important; height: 0 !important; }';
    style.innerHTML += ' .bebebaba { display: none !important; }';
    
    if (document.head) document.head.appendChild(style);
    else document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style));

    // 2. Inject omrxware.js via a clean Blob URL (avoids eval/innerHTML detection)
    try {
        const scriptContent = atob('${base64Script}');
        const blob = new Blob([scriptContent], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        const script = document.createElement('script');
        script.src = url;
        script.onload = () => {
            URL.revokeObjectURL(url);
            console.log("[OMRXWARE] ✅ Script injected via Blob URL.");
        };
        document.body.appendChild(script);
    } catch (e) {
        console.error("[OMRXWARE] ❌ Injection error:", e);
    }
})();
// ---------------------------
`;
            // Add bootloader to the top of the game code
            jsCode = injectionCode + '\n;\n' + jsCode;

        } catch (err) {
            console.error("Could not find omrxware.js.");
        }

        fs.writeFileSync('devast-modded.js', jsCode);
        console.log("✅ Successfully generated devast-modded.js (no overrides, Blob injection)");

    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

runUpdater();
