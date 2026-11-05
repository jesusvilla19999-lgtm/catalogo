/* Collega l'app ai servizi fuori da Claude:
   - dati: stessi file .json (sul sito GitHub, o all'indirizzo DATA_BASE per Apps Script)
   - intelligenza artificiale: Gemini attraverso il sito Apps Script (CONFIG.AI_URL o google.script.run)
   - download: file salvato dal browser */
(function(){
  var CFG = window.CONFIG || {};
  var BASE = CFG.DATA_BASE || '';
  if (BASE) {
    var _f = window.fetch.bind(window);
    window.fetch = function(u, o){ if (typeof u === 'string' && !/^[a-z]+:|^\//i.test(u)) u = BASE.replace(/\/?$/, '/') + u; return _f(u, o); };
  }
  var hasGAS = !!(window.google && google.script && google.script.run);
  var hasAI = hasGAS || !!CFG.AI_URL;

  function toJpegB64(blob){
    return new Promise(function(res, rej){
      var url = URL.createObjectURL(blob), img = new Image();
      img.onload = function(){
        var s = Math.min(1, 1400 / Math.max(img.width, img.height));
        var c = document.createElement('canvas'); c.width = Math.round(img.width*s); c.height = Math.round(img.height*s);
        var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0,0,c.width,c.height); x.drawImage(img,0,0,c.width,c.height);
        URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', 0.85).split(',')[1]);
      };
      img.onerror = function(){ rej({code:'image_rejected'}); };
      img.src = url;
    });
  }
  function parseJSON(t){
    try { return JSON.parse(t); } catch(e){}
    var m = t.match(/```(?:json)?\s*([\s\S]*?)```/); if (m) { try { return JSON.parse(m[1]); } catch(e){} }
    var a = t.search(/[\[{]/), b = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
    if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b+1)); } catch(e){} }
    throw {code:'invalid_json', text:t};
  }
  function callAI(payload){
    if (hasGAS) return new Promise(function(res, rej){
      google.script.run.withSuccessHandler(res).withFailureHandler(function(e){ rej({code:'upstream_error', message:String(e)}); }).ai(payload);
    });
    return fetch(CFG.AI_URL, {method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body: JSON.stringify(payload)})
      .then(function(r){ return r.json(); });
  }
  async function json(prompt, opts){
    opts = opts || {};
    var imgs = opts.images ? Array.from(opts.images.length !== undefined && !(opts.images instanceof Blob) ? opts.images : [opts.images]) : [];
    var b64 = []; for (var i = 0; i < imgs.length; i++) b64.push(await toJpegB64(imgs[i]));
    if (opts.signal && opts.signal.aborted) throw {code:'cancelled'};
    var r = await callAI({prompt: prompt, images: b64});
    if (opts.signal && opts.signal.aborted) throw {code:'cancelled'};
    if (!r || r.error) throw {code: (r && r.code) || 'upstream_error', message: r && r.error};
    return parseJSON(r.text || '');
  }
  var sample = async function(p, o){ var t = JSON.stringify(await json(p, o)); return {text:t, truncated:false}; };
  sample.json = json;
  sample.limits = async function(){ return {maxPromptBytes: 900000, images: {maxCount: 7, maxInputBytes: 20e6, mediaTypes: ['image/jpeg','image/png','image/webp','image/heic','image/heif']}}; };

  var downloads = { save: async function(o){
    var blob = new Blob([o.data], {type: /\.csv$/i.test(o.filename) ? 'text/csv;charset=utf-8' : 'application/octet-stream'});
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = o.filename; document.body.appendChild(a); a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }};
  window.claude = { use: async function(n){ return n === 'sample' ? (hasAI ? sample : null) : n === 'downloads' ? downloads : null; } };
})();
