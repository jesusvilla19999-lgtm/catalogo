/**
 * Catalogo Materiali TE — sito Google Apps Script
 *
 * Cosa fa:
 *  - mostra il sito (file Index.html)
 *  - fa da "ponte" verso Gemini per il riconoscimento da foto e la lettura dei fogli a mano,
 *    sia per questo sito sia per l'app installata da GitHub Pages
 *
 * Impostazione una tantum:
 *  Impostazioni progetto (rotellina) > Proprietà script > Aggiungi proprietà
 *     Nome:   GEMINI_API_KEY
 *     Valore: la chiave presa da https://aistudio.google.com/apikey
 */

// Modelli da provare in ordine. Se uno è occupato o non esiste più si passa al successivo,
// e alla fine si prova qualunque altro modello "flash" disponibile per la tua chiave.
var MODELLI = ['gemini-3.8-flash', 'gemini-3.8-flash-lite', 'gemini-3-flash', 'gemini-flash-latest'];

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Catalogo Materiali TE')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// Chiamata dall'app su GitHub Pages
function doPost(e) {
  var out;
  try {
    var payload = JSON.parse(e.postData.contents);
    out = ai(payload);
  } catch (err) {
    out = { error: String(err), code: 'upstream_error' };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function chiamaModello_(modello, key, parts) {
  return UrlFetchApp.fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/' + modello + ':generateContent',
    {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-goog-api-key': key },
      muteHttpExceptions: true,
      payload: JSON.stringify({
        contents: [{ role: 'user', parts: parts }],
        generationConfig: { temperature: 0.2, responseMimeType: 'application/json' }
      })
    }
  );
}

function altriModelli_(key) {
  try {
    var cache = CacheService.getScriptCache();
    var c = cache.get('modelli');
    if (c) return JSON.parse(c);
    var r = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': key }, muteHttpExceptions: true });
    var list = (JSON.parse(r.getContentText()).models || [])
      .filter(function (m) { return (m.supportedGenerationMethods || []).indexOf('generateContent') >= 0 && /flash/i.test(m.name) && !/image|tts|audio|live|embed|thinking/i.test(m.name); })
      .map(function (m) { return m.name.replace('models/', ''); });
    cache.put('modelli', JSON.stringify(list), 6 * 3600);
    return list;
  } catch (e) { return []; }
}

// Chiamata dal sito Apps Script (google.script.run.ai) e da doPost
function ai(payload) {
  var key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!key) return { error: 'Manca la chiave GEMINI_API_KEY nelle proprietà dello script', code: 'not_granted' };

  var parts = [{ text: String(payload.prompt || '') }];
  (payload.images || []).slice(0, 8).forEach(function (b64) {
    parts.push({ inline_data: { mime_type: 'image/jpeg', data: b64 } });
  });

  var scadenza = Date.now() + 45000; // non aspettare più di 45 secondi in tutto
  var provati = {}, ultimo = '';
  var coda = MODELLI.slice();
  var listaCaricata = false;
  while (coda.length && Date.now() < scadenza) {
    var modello = coda.shift();
    if (provati[modello]) continue;
    provati[modello] = true;
    for (var tentativo = 0; tentativo < 2 && Date.now() < scadenza; tentativo++) {
      var t0 = Date.now();
      var res = chiamaModello_(modello, key, parts);
      Logger.log(modello + ' -> ' + res.getResponseCode() + ' in ' + (Date.now() - t0) + ' ms');
      var code = res.getResponseCode();
      if (code === 200) {
        var data = JSON.parse(res.getContentText());
        var cand = (data.candidates || [])[0];
        var text = cand && cand.content && cand.content.parts ? cand.content.parts.map(function (p) { return p.text || ''; }).join('') : '';
        if (!text) return { error: 'Risposta vuota da Gemini', code: 'refused' };
        return { text: text, modello: modello };
      }
      ultimo = modello + ' ' + code + ': ' + res.getContentText().slice(0, 200);
      if (code === 400 || code === 401 || code === 403) return { error: 'Gemini ha risposto ' + ultimo, code: 'upstream_error' };
      if (code === 503 || code === 429 || code === 500) { Utilities.sleep(1500); continue; }
      break; // 404 o altro: passa al modello successivo
    }
    if (!coda.length && !listaCaricata) { listaCaricata = true; coda = altriModelli_(key).filter(function (m) { return !provati[m]; }).slice(0, 3); }
  }
  if (/ 429/.test(ultimo)) return { error: 'Troppe richieste a Gemini, riprova tra poco', code: 'rate_limited' };
  return { error: 'Gemini è molto carico in questo momento, riprova tra qualche minuto (' + ultimo + ')', code: 'upstream_error' };
}

// Prova veloce dall'editor: seleziona "provaGemini" e premi Esegui
function provaGemini() {
  Logger.log(JSON.stringify(ai({ prompt: 'Rispondi solo con JSON: {"ok":true}' })));
}
