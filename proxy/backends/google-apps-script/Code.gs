/**
 * Google Apps Script — CORS proxy backend
 *
 * ── HOW TO DEPLOY ─────────────────────────────────────────────────────────
 * 1. script.google.com → New project → paste this file
 * 2. Deploy → New deployment → Web app
 *    Execute as: Me  |  Who has access: Anyone
 * 3. Copy the /exec URL → paste into proxy/uv.sw.js as CORS_BACKEND
 *
 * ── IMPORTANT: after updating this code ──────────────────────────────────
 * Deploy → Manage deployments → pencil icon → Version: New version → Deploy
 * (changes don't go live until you create a new version)
 */

// GAS redirects POST to googleusercontent.com, which browsers convert to GET
// (HTTP 302 spec). So the SW always sends GET with URL params — both handlers
// just call the same function.

function doGet(e)  { return handleRequest(e); }
function doPost(e) { return handleRequest(e); }

function handleRequest(e) {
  var p = (e && e.parameter) || {};

  var targetURL = p['target'];
  if (!targetURL) {
    return out(JSON.stringify({ error: 'missing ?target= param' }));
  }

  // Health check
  if (p['ping']) {
    return out(JSON.stringify({ ok: true }));
  }

  var method     = (p['method']  || 'GET').toUpperCase();
  var accept     = p['accept']   || '*/*';
  var acceptLang = p['al']       || 'en-US,en;q=0.9';
  var cookie     = p['cookie']   || '';
  var contentType = p['ct']      || '';

  // Decode base64 POST body if present
  var body = null;
  if (p['body']) {
    try { body = decodeURIComponent(escape(Utilities.newBlob(Utilities.base64Decode(p['body'])).getDataAsString())); }
    catch(e) { body = p['body']; }
  }

  // Spoof Origin/Referer so target APIs don't reject us
  var targetOrigin = '';
  try { targetOrigin = targetURL.match(/^(https?:\/\/[^\/]+)/)[1]; } catch(e) {}

  var headers = {
    'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept':          accept,
    'Accept-Language': acceptLang,
    'sec-fetch-site':  'same-origin',
    'sec-fetch-mode':  'navigate',
  };
  if (targetOrigin) { headers['Origin'] = targetOrigin; headers['Referer'] = targetURL; }
  if (cookie)       { headers['Cookie'] = cookie; }

  var options = {
    method:             method.toLowerCase(),
    headers:            headers,
    followRedirects:    true,
    muteHttpExceptions: true,
  };

  if (body && method !== 'GET' && method !== 'HEAD') {
    options.payload = body;
    if (contentType) options.contentType = contentType;
  }

  var upstream;
  try {
    upstream = UrlFetchApp.fetch(targetURL, options);
  } catch(err) {
    return out(JSON.stringify({ error: String(err), status: 502 }));
  }

  var statusCode  = upstream.getResponseCode();
  var upHeaders   = upstream.getHeaders();
  var ct          = upHeaders['Content-Type'] || upHeaders['content-type'] || 'application/octet-stream';
  var setCookie   = upHeaders['Set-Cookie']   || upHeaders['set-cookie']   || null;

  var isBinary = !/^text\/|application\/(json|javascript|xml)/.test(ct);
  var bodyOut, encoding;

  if (isBinary) {
    bodyOut  = Utilities.base64Encode(upstream.getContent());
    encoding = 'base64';
  } else {
    bodyOut  = upstream.getContentText('UTF-8');
    encoding = 'utf8';
  }

  return out(JSON.stringify({
    status:      statusCode,
    contentType: ct,
    body:        bodyOut,
    encoding:    encoding,
    setCookie:   setCookie,
  }));
}

function out(text) {
  return ContentService.createTextOutput(text)
    .setMimeType(ContentService.MimeType.JSON);
}
