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

        // Zoom patch (kept – works fine)
        jsCode = jsCode.replace(/-0\.35/g, '-0.65');

        try {
            const myCustomScript = fs.readFileSync('omrxware.js', 'utf8');
            const base64Script = Buffer.from(myCustomScript).toString('base64');

            // --- BOOTLOADER: Only CSS hiding + MutationObserver + innerHTML injection ---
            const injectionCode = `
// --- OMRXWARE BOOTLOADER (No overrides, only CSS + observer) ---
(function() {
    console.log("[OMRXWARE] Bootloader starting (UI hiding via CSS + observer)");

    // 1. Hide all known UI panels using pure CSS
    const targets = [
        'terms', 'howtoplay', 'changelog', 'featuredVideo',
        'bebebaba', 'devast-io_970x250', 'preroll', 'exapush-popup'
    ];
    // Also hide any element with common popup/modal classes
    const classes = ['popup', 'modal', 'overlay', 'panel', 'dialog', 'ui-panel', 'game-overlay', 'menu-panel', 'popup-container'];

    let css = '';
    targets.forEach(id => {
        css += '#' + id + ' { display: none !important; opacity: 0 !important; visibility: hidden !important; pointer-events: none !important; z-index: -9999 !important; width: 0 !important; height: 0 !important; }';
    });
    classes.forEach(cls => {
        css += '.' + cls + ' { display: none !important; opacity: 0 !important; visibility: hidden !important; pointer-events: none !important; z-index: -9999 !important; width: 0 !important; height: 0 !important; }';
    });
    // Extra catch-all for IDs containing popup/modal/overlay
    css += '[id*="popup"] { display: none !important; }';
    css += '[id*="modal"] { display: none !important; }';
    css += '[id*="overlay"] { display: none !important; }';

    const style = document.createElement('style');
    style.innerHTML = css;
    if (document.head) document.head.appendChild(style);
    else document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style));

    // 2. MutationObserver to hide any newly added UI elements
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === 1) {
                    const id = node.id;
                    const classList = node.classList;
                    let hide = false;
                    if (id && targets.includes(id)) hide = true;
                    if (!hide) {
                        for (let cls of classes) {
                            if (classList.contains(cls)) { hide = true; break; }
                        }
                    }
                    if (!hide && id) {
                        if (id.includes('popup') || id.includes('modal') || id.includes('overlay')) hide = true;
                    }
                    if (hide) {
                        node.style.display = 'none';
                        node.style.opacity = '0';
                        node.style.visibility = 'hidden';
                        node.style.pointerEvents = 'none';
                        node.style.zIndex = '-9999';
                        node.style.width = '0';
                        node.style.height = '0';
                        console.log("[OMRXWARE] Hidden new element:", node);
                    }
                }
            });
        });
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // 3. Inject omrxware.js using the original innerHTML method (works perfectly)
    setTimeout(function() {
        try {
            var script = document.createElement('script');
            script.innerHTML = decodeURIComponent(escape(atob('${base64Script}')));
            document.body.appendChild(script);
            console.log("[OMRXWARE] ✅ Script injected successfully.");
        } catch (e) {
            console.error("[OMRXWARE] ❌ Injection error:", e);
        }
    }, 1000);

    console.log("[OMRXWARE] Bootloader ready – UI hidden, observer active.");
})();
// ---------------------------
`;
            jsCode = injectionCode + '\n;\n' + jsCode;

        } catch (err) {
            console.error("Could not find omrxware.js.");
        }

        fs.writeFileSync('devast-modded.js', jsCode);
        console.log("✅ Successfully generated devast-modded.js (UI hiding + observer, no overrides)");

    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

runUpdater();
