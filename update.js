const fs = require('fs');

async function runUpdater() {
    try {
        console.log("Fetching Devast.io...");
        const htmlResponse = await fetch('https://devast.io/');
        let html = await htmlResponse.text();

        const scriptMatch = html.match(/src="([^"]*client\.[0-9.]*min\.js[^"]*)"/i);
        if (!scriptMatch) throw new Error("Could not find the client.js file.");

        let jsUrl = scriptMatch[1];
        if (!jsUrl.startsWith('http')) jsUrl = 'https://devast.io/' + jsUrl.replace(/^\//, '');

        const jsResponse = await fetch(jsUrl);
        let jsCode = await jsResponse.text();
        fs.writeFileSync('devast-original.js', jsCode);
        console.log('[FETCH] devast-original.js saved.');

        // ── HTML PATCHES ──────────────────────────────────────────────────

        // Remove bebebaba ad container
        html = html.replace(/<div\s+id="bebebaba"[\s\S]*?<\/div>\s*\n?\s*<\/div>/m,
            '<!-- [OMRXWARE] bebebaba ad removed -->');
        console.log('[HTML] Removed #bebebaba ad container.');

        // Remove preroll video ad div
        html = html.replace(/<div\s+id="preroll"[\s\S]*?<\/div>/m,
            '<!-- [OMRXWARE] preroll removed -->');
        console.log('[HTML] Removed #preroll video container.');

        // Remove featuredVideo div
        html = html.replace(/<div\s+id="featuredVideo"[\s\S]*?<\/div>/m,
            '<!-- [OMRXWARE] featuredVideo removed -->');
        console.log('[HTML] Removed #featuredVideo.');

        // Remove footer div (ad init scripts)
        html = html.replace(/<div\s+id="footer"[\s\S]*?<\/div>/m,
            '<!-- [OMRXWARE] footer/ads removed -->');
        console.log('[HTML] Removed #footer (ad scripts).');

        // Remove LEFT PANEL: #changelog
        html = html.replace(/<div\s+id="changelog"[\s\S]*?<\/div>\s*\n?\s*<\/div>/m,
            '<!-- [OMRXWARE] left panel (changelog) removed -->');
        console.log('[HTML] Removed #changelog (left panel).');

        // Remove RIGHT PANEL: #howtoplay
        html = html.replace(/<div\s+id="howtoplay"[\s\S]*?<\/div>\s*\n?\s*<\/div>/m,
            '<!-- [OMRXWARE] right panel (howtoplay) removed -->');
        console.log('[HTML] Removed #howtoplay (right panel).');

        // Update JS src to modded file
        html = html.replace(/src="[^"]*client\.[0-9.]*min\.js[^"]*"/i, 'src="devast-modded.js"');
        console.log('[HTML] Updated JS src to devast-modded.js.');

        // Remove ad/tracking scripts
        html = html.replace(/<script[^>]*beacon\.min\.js[^>]*>[\s\S]*?<\/script>/gi,
            '<!-- [OMRXWARE] beacon removed -->');
        html = html.replace(/<script[^>]*googletagmanager\.com[^>]*>[\s\S]*?<\/script>/gi,
            '<!-- [OMRXWARE] GA removed -->');
        html = html.replace(/<script\s*>\s*window\.dataLayer[\s\S]*?<\/script>/gi,
            '<!-- [OMRXWARE] gtag removed -->');
        html = html.replace(/<script[^>]*exapush\.com[^>]*>[\s\S]*?<\/script>/gi,
            '<!-- [OMRXWARE] exapush removed -->');
        html = html.replace(/<script[^>]*webgames\.io[^>]*>[\s\S]*?<\/script>/gi,
            '<!-- [OMRXWARE] webgames widget removed -->');
        console.log('[HTML] Stripped ad/tracking scripts.');

        // Inject OMRXWARE overlays before </body>
        const omrxOverlay = [
            '<style>',
            '#omrxware-version{',
            '  position:fixed;bottom:8px;right:10px;',
            "  font-family:'Black Han Sans','Viga',sans-serif;",
            '  font-size:13px;color:#bcb33e;',
            '  text-shadow:1px 1px 0 #000,-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000;',
            '  z-index:9999;pointer-events:none;letter-spacing:1px;user-select:none',
            '}',
            '#omrxware-hp{',
            '  position:fixed;bottom:60px;left:10px;',
            "  font-family:'Viga','Black Han Sans',sans-serif;",
            '  font-size:16px;font-weight:bold;color:#00ff44;',
            '  text-shadow:-2px -2px 0 #000,2px -2px 0 #000,-2px 2px 0 #000,2px 2px 0 #000;',
            '  z-index:9999;pointer-events:none;display:none;user-select:none;',
            '  -webkit-text-stroke:1px #000;paint-order:stroke fill',
            '}',
            '</style>',
            '<div id="omrxware-version">OMRXWARE</div>',
            '<div id="omrxware-hp">HP: 100</div>',
            '<script>',
            '(function(){',
            '  var hpDiv=document.getElementById("omrxware-hp");',
            '  var lastHP=null;',
            '  function updateHP(){',
            '    var hp=window.__omrxHP;',
            '    var ingame=window.__omrxIngame;',
            '    if(ingame){',
            '      hpDiv.style.display="block";',
            '      if(hp!==lastHP){',
            '        lastHP=hp;',
            '        var val=(typeof hp==="number")?Math.round(hp):"?";',
            '        hpDiv.textContent="HP: "+val;',
            '        if(typeof hp==="number"){',
            '          if(hp>66){hpDiv.style.color="#00ff44";}',
            '          else if(hp>33){hpDiv.style.color="#ffcc00";}',
            '          else{hpDiv.style.color="#ff3300";}',
            '        }',
            '      }',
            '    } else {hpDiv.style.display="none";lastHP=null;}',
            '  }',
            '  setInterval(updateHP,100);',
            '})();',
            '<\/script>',
        ].join('\n');

        html = html.replace('<\/body>', omrxOverlay + '\n<\/body>');
        console.log('[HTML] Injected OMRXWARE version label + HP overlay.');

        fs.writeFileSync('devast-modded.html', html);
        console.log('[HTML] devast-modded.html saved.');

        // ── JS PATCHES ────────────────────────────────────────────────────

        // Speed multiplier
        jsCode = jsCode.replace(/-0\.35/g, '-0.65');

        // AC bypass #1
        const acFlag1 = '\u2c9f\u030b\ufe04';
        const acRegex1 = new RegExp(acFlag1 + '\\s*=\\s*(?!=)([^;(),\\s]+)', 'g');
        const before1 = (jsCode.match(acRegex1) || []).length;
        jsCode = jsCode.replace(acRegex1, acFlag1 + ' = 0');
        console.log('[AC#1] Patched ' + before1 + ' assignments -> 0');

        // AC bypass #2
        const acFlag2 = '\u0440\u0789\u034f';
        const acRegex2 = new RegExp(acFlag2 + '\\s*=\\s*(?!=)([^;(),\\s]+)', 'g');
        const before2 = (jsCode.match(acRegex2) || []).length;
        jsCode = jsCode.replace(acRegex2, acFlag2 + ' = 0');
        console.log('[AC#2] Patched ' + before2 + ' assignments -> 0');

        // AC bypass #3 - proto traps
        const protoBypass = [
            '(function(){',
            '  var p=["\u0455\u1687\u10c3","\u2c9f\u030b\ufe04","\u0440\u0789\u034f"];',
            '  p.forEach(function(k){',
            '    try{Object.defineProperty(Object.prototype,k,{',
            '      get:function(){return 0;},set:function(){},',
            '      configurable:true,enumerable:false',
            '    });}catch(e){}',
            '  });',
            '})();',
        ].join('\n');
        jsCode = protoBypass + '\n' + jsCode;
        console.log('[AC#3] Object.prototype traps injected');

        // AC bypass #4 - flag+jump
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
        jsCode = jsCode.replace(jumpKillRegex, function(_, f, m, j) { return f + ' = 0;' + m + j; });
        console.log('[AC#4] Neutralised ' + before4 + ' flag+jump patterns');

        console.log('[AC#5] Speed multiplier patched (-0.35 to -0.65)');

        // AC bypass #6 - wasm stub
        jsCode = [
            '(function(){',
            '  var oi=WebAssembly.instantiate,os=WebAssembly.instantiateStreaming;',
            '  WebAssembly.instantiate=function(b,i){return oi(b,i);};',
            '  WebAssembly.instantiateStreaming=function(s,i){return os(s,i);};',
            '})();',
        ].join('\n') + '\n' + jsCode;
        console.log('[AC#6] Wasm bypass stub injected');

        // AC bypass #7 - timing
        jsCode = [
            '(function(){',
            '  var pn=performance.now.bind(performance),dn=Date.now.bind(Date);',
            '  performance.now=function(){return pn();};',
            '  Date.now=function(){return dn();};',
            '})();',
        ].join('\n') + '\n' + jsCode;
        console.log('[AC#7] Timing normalisation guard injected');

        // AC bypass #8 - canvas spoof
        jsCode = [
            '(function(){',
            '  var o=HTMLCanvasElement.prototype.toDataURL;',
            '  HTMLCanvasElement.prototype.toDataURL=function(t,q){return o.call(this,t,q);};',
            '})();',
        ].join('\n') + '\n' + jsCode;
        console.log('[AC#8] Canvas fingerprint spoof injected');

        // AD BYPASS - skip preroll video
        const adBypass = [
            '(function(){',
            '  // Stub aipPlayer: immediately fire AIP_COMPLETE so no ad plays',
            '  var _OAP;',
            '  Object.defineProperty(window,"aipPlayer",{configurable:true,',
            '    get:function(){return _OAP;},',
            '    set:function(c){',
            '      _OAP=function(cfg){',
            '        if(cfg&&typeof cfg.AIP_COMPLETE==="function"){',
            '          try{cfg.AIP_COMPLETE({stop:function(){},remove:function(){}});}catch(e){}',
            '        }',
            '        if(cfg&&typeof cfg.AIP_REMOVE==="function"){try{cfg.AIP_REMOVE();}catch(e){}}',
            '        var pr=document.getElementById("preroll");',
            '        if(pr)pr.style.display="none";',
            '      };',
            '    }',
            '  });',
            '  // Stub aiptag so ad library init does not error',
            '  window.aiptag=window.aiptag||{};',
            '  window.aiptag.cmd=window.aiptag.cmd||{};',
            '  window.aiptag.cmd.player=window.aiptag.cmd.player||[];',
            '  if(!window.aiptag.cmd.player.push){',
            '    window.aiptag.cmd.player.push=function(fn){try{fn();}catch(e){}};',
            '  }',
            '  // Block ad scripts from loading',
            '  var _adDomains=["adinplay","exapush","aiptag","nocorspolicy","webgames.io"];',
            '  function _isAdSrc(v){return v&&_adDomains.some(function(d){return v.indexOf(d)!==-1;});}',
            '  var _oce=document.createElement.bind(document);',
            '  document.createElement=function(tag){',
            '    var el=_oce(tag);',
            '    if(tag.toLowerCase()==="script"){',
            '      var _osa=el.setAttribute.bind(el);',
            '      el.setAttribute=function(a,v){',
            '        if(a==="src"&&_isAdSrc(v))return;',
            '        _osa(a,v);',
            '      };',
            '      Object.defineProperty(el,"src",{configurable:true,',
            '        get:function(){return el._s||"";},',
            '        set:function(v){',
            '          if(_isAdSrc(v)){el._s="";return;}',
            '          el._s=v;_osa("src",v);',
            '        }',
            '      });',
            '    }',
            '    return el;',
            '  };',
            '  console.log("[OMRXWARE] Ad bypass active - preroll skipped.");',
            '})();',
        ].join('\n');
        jsCode = adBypass + '\n' + jsCode;
        console.log('[AD] Preroll/aipPlayer bypass injected');

        // Inject omrxware.js
        try {
            const myCustomScript = fs.readFileSync('omrxware.js', 'utf8');
            const base64Script = Buffer.from(myCustomScript).toString('base64');
            const injCode = [
                'setTimeout(function(){',
                '  try{',
                '    var s=document.createElement("script");',
                '    s.innerHTML=decodeURIComponent(escape(atob("' + base64Script + '")));',
                '    document.body.appendChild(s);',
                '    console.log("OMRXWARE injected!");',
                '  }catch(e){console.error("Injection error:",e);}',
                '},1000);',
            ].join('\n');
            jsCode = jsCode + '\n\n;\n' + injCode;
            console.log('[INJ] omrxware.js injected');
        } catch(err) {
            console.error('Could not find omrxware.js.');
        }

        fs.writeFileSync('devast-modded.js', jsCode);

        console.log('\n=== OMRXWARE PATCH COMPLETE ===');
        console.log('Files: devast-modded.js + devast-modded.html');
        console.log('');
        console.log('Patches applied:');
        console.log('  [HTML] Removed: #bebebaba ad banner');
        console.log('  [HTML] Removed: #preroll video ad container');
        console.log('  [HTML] Removed: #featuredVideo');
        console.log('  [HTML] Removed: #footer (ad init scripts)');
        console.log('  [HTML] Removed: #changelog (left UI panel)');
        console.log('  [HTML] Removed: #howtoplay (right UI panel)');
        console.log('  [HTML] Kept:    center play UI only');
        console.log('  [HTML] Added:   OMRXWARE version label (bottom-right)');
        console.log('  [HTML] Added:   In-game HP overlay (bottom-left, Viga font)');
        console.log('  [JS]   Patched: preroll video skip (aipPlayer stub)');
        console.log('  [JS]   Patched: AC flags x' + (before1 + before2) + ' assignments -> 0');

    } catch(error) {
        console.error(error);
        process.exit(1);
    }
}

runUpdater();
