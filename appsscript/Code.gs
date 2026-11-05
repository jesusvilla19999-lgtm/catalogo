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

var MODELLO = 'gemini-2.5-flash'; // se Google lo cambia, basta scrivere qui il nome nuovo

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

// Chiamata dal sito Apps Script (google.script.run.ai) e da doPost
function ai(payload) {
  var key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!key) return { error: 'Manca la chiave GEMINI_API_KEY nelle proprietà dello script', code: 'not_granted' };

  var parts = [{ text: String(payload.prompt || '') }];
  (payload.images || []).slice(0, 8).forEach(function (b64) {
    parts.push({ inline_data: { mime_type: 'image/jpeg', data: b64 } });
  });

  var res = UrlFetchApp.fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/' + MODELLO + ':generateContent',
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

  var code = res.getResponseCode();
  if (code === 429) return { error: 'Troppe richieste a Gemini, riprova tra poco', code: 'rate_limited' };
  if (code !== 200) return { error: 'Gemini ha risposto ' + code + ': ' + res.getContentText().slice(0, 300), code: 'upstream_error' };

  var data = JSON.parse(res.getContentText());
  var cand = (data.candidates || [])[0];
  var text = cand && cand.content && cand.content.parts ? cand.content.parts.map(function (p) { return p.text || ''; }).join('') : '';
  if (!text) return { error: 'Risposta vuota da Gemini', code: 'refused' };
  return { text: text };
}

// Prova veloce dall'editor: seleziona "provaGemini" e premi Esegui
function provaGemini() {
  Logger.log(JSON.stringify(ai({ prompt: 'Rispondi solo con JSON: {"ok":true}' })));
}
