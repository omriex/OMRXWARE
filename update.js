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

        jsCode = jsCode.replace(/-0\.35/g, '-0.65');

        const acFlag1 = '\u2c9f\u030b\ufe04';
        const acRegex1 = new RegExp(acFlag1 + '\\s*=\\s*(?!=)([^;(),\\s]+)', 'g');
        const before1 = (jsCode.match(acRegex1) || []).length;
        jsCode = jsCode.replace(acRegex1, acFlag1 + ' = 0');
        console.log(`[AC#1] Patched ${before1} assignments of ⲟ̋︄ → 0`);

        const acFlag2 = '\u0440\u0789\u034f';
        const acRegex2 = new RegExp(acFlag2 + '\\s*=\\s*(?!=)([^;(),\\s]+)', 'g');
        const before2 = (jsCode.match(acRegex2) || []).length;
        jsCode = jsCode.replace(acRegex2, acFlag2 + ' = 0');
        console.log(`[AC#2] Patched ${before2} assignments of рမ͏ → 0`);

        const protoBypass = `
(function() {
    var _acProps = [
        '\u0455\u1687\u10c3',  
        '\u2c9f\u030b\ufe04',  
        '\u0440\u0789\u034f',  
    ];
    _acProps.forEach(function(prop) {
        try {
            Object.defineProperty(Object.prototype, prop, {
                get: function() { return 0; },
                set: function(val) {},
                configurable: true,
                enumerable: false
            });
        } catch(e) {}
    });
})();
`;
        jsCode = protoBypass + '\n' + jsCode;
        console.log('[AC#3] Injected Object.prototype AC property traps');

        const escF1 = acFlag1.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const escF2 = acFlag2.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const jumpKillRegex = new RegExp(
            '(' + escF1 + '|' + escF2 + ')' +
            '\\s*=\\s*(?:0[xX]?1|01|1)(?![\\da-fA-F])\\s*;' +
            '([^;]{0,80}?)' +
            '(999|0[xX]3[eE]7|01747)',
            'g'
        );
        const before4 = (jsCode.match(jumpKillRegex) || []).length;
        jsCode = jsCode.replace(jumpKillRegex, (_, flagPart, middle, jump) => {
            return flagPart + ' = 0;' + middle + jump;
        });
        console.log(`[AC#4] Neutralised ${before4} flag+jump combined patterns`);

        console.log('a');

        const wasmBypass = `
(function() {
    var _origInstantiate = WebAssembly.instantiate;
    var _origInstantiateStreaming = WebAssembly.instantiateStreaming;
    WebAssembly.instantiate = function(buf, imports) {
        return _origInstantiate(buf, imports);
    };
    WebAssembly.instantiateStreaming = function(src, imports) {
        return _origInstantiateStreaming(src, imports);
    };
})();
`;
        jsCode = wasmBypass + '\n' + jsCode;
        console.log('[AC#6] Injected WebAssembly integrity bypass stub');

        const timingBypass = `
(function() {
    var _perfNow = performance.now.bind(performance);
    var _dateNow = Date.now.bind(Date);
    var _startReal = _perfNow();
    var _startVirt = _startReal;
    performance.now = function() { return _perfNow(); };
    Date.now = function() { return _dateNow(); };
})();
`;
        jsCode = timingBypass + '\n' + jsCode;
        console.log('fd');

        const canvasBypass = `
(function() {
    var _origToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function(type, quality) {
        return _origToDataURL.call(this, type, quality);
    };
    if (typeof OffscreenCanvas !== 'undefined') {
        var _origOff = OffscreenCanvas.prototype.convertToBlob;
        if (_origOff) OffscreenCanvas.prototype.convertToBlob = _origOff;
    }
})();
`;
        jsCode = canvasBypass + '\n' + jsCode;
        console.log('jhg');

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
            console.log('[INJ] omrxware.js injected');
        } catch (err) {
            console.error("Could not find omrxware.js.");
        }

        fs.writeFileSync('devast-modded.js', jsCode);
        console.log("\n✓ Successfully generated devast-modded.js");

    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

runUpdater();
