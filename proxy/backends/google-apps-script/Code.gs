/**
 * Google Apps Script — CORS proxy backend
 * Runs on Google's own servers — impossible for schools to block without
 * breaking Google Classroom, Docs, Forms, etc.
 *
 * ── HOW TO DEPLOY (takes ~3 minutes) ─────────────────────────────────────
 *
 * 1. Go to script.google.com → New project
 * 2. Delete everything in the editor, paste THIS ENTIRE FILE
 * 3. Click Deploy (top right) → New deployment
 * 4. Type: Web app
 * 5. Execute as: Me
 *    Who has access: Anyone   ← IMPORTANT, must be "Anyone"
 * 6. Click Deploy → Authorize (grant permissions when prompted)
 * 7. Copy the Web App URL — looks like:
 *      https://script.google.com/macros/s/AKfycb.../exec
 *
 * 8. Open proxy/uv.sw.js and set:
 *      const BACKEND_MODE = 'gas';
 *      const CORS_BACKEND  = 'https://script.google.com/macros/s/AKfycb.../exec';
 *
 * ── IMPORTANT: after any code change, deploy a NEW version ───────────────
 * Deploy → Manage deployments → edit → "New version" → Deploy
 * (editing code doesn't update a live deployment automatically)
 *
 * ── Limits (free account) ────────────────────────────────────────────────
 * UrlFetchApp: 20,000 calls/day — plenty for casual browsing
 * Script runtime: 6 min max per call — each proxy request finishes in <5s
 * Response size: up to 50 MB from UrlFetchApp
 */

// ── Entry points ────────────────────────────────────────────────────────────

function doPost(e) {
  try {
    // The SW sends JSON body: { target, method, accept, acceptLang, contentType, cookie, body }
    var data = JSON.parse(e.postData.contents);
    return proxyRequest(data);
  } catch (err) {
    return gasResponse(JSON.stringify({ error: String(err) }), 'application/json');
  }
}

function doGet(e) {
  // CORS preflight lands here sometimes; also used as a health check
  if (e.parameter && e.parameter.ping) {
    return gasResponse(JSON.stringify({ ok: true }), 'application/json');
  }
  // Try to handle GET proxying from URL params as fallback
  try {
    return proxyRequest({
      target:     e.parameter.target  || '',
      method:     e.parameter.method  || 'GET',
      accept:     e.parameter.accept  || '*/*',
      cookie:     e.parameter.cookie  || '',
    });
  } catch (err) {
    return gasResponse(JSON.stringify({ error: String(err) }), 'application/json');
  }
}

// ── Core proxy logic ────────────────────────────────────────────────────────

function proxyRequest(data) {
  var targetURL   = data.target;
  var method      = (data.method  || 'GET').toUpperCase();
  var accept      = data.accept   || '*/*';
  var acceptLang  = data.acceptLang || 'en-US,en;q=0.9';
  var cookie      = data.cookie   || '';
  var contentType = data.contentType || '';
  var bodyData    = data.body     || null;

  if (!targetURL) {
    return gasResponse(JSON.stringify({ error: 'Missing target' }), 'application/json');
  }

  // Spoof Origin/Referer so APIs don't reject us
  var targetOrigin = '';
  try { targetOrigin = targetURL.match(/^(https?:\/\/[^\/]+)/)[1]; } catch(e) {}

  var headers = {
    'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept':          accept,
    'Accept-Language': acceptLang,
    'sec-fetch-site':  'same-origin',
    'sec-fetch-mode':  'navigate',
    'sec-fetch-dest':  'document',
  };
  if (targetOrigin) { headers['Origin'] = targetOrigin; headers['Referer'] = targetURL; }
  if (cookie)       { headers['Cookie'] = cookie; }

  var options = {
    method:           method.toLowerCase(),
    headers:          headers,
    followRedirects:  true,
    muteHttpExceptions: true,
  };

  if (bodyData && method !== 'GET' && method !== 'HEAD') {
    options.payload     = bodyData;
    if (contentType) options.contentType = contentType;
  }

  var upstream;
  try {
    upstream = UrlFetchApp.fetch(targetURL, options);
  } catch (err) {
    return gasResponse(JSON.stringify({ error: String(err), status: 502 }), 'application/json');
  }

  var statusCode   = upstream.getResponseCode();
  var upHeaders    = upstream.getHeaders();
  var ct           = upHeaders['Content-Type'] || upHeaders['content-type'] || 'application/octet-stream';
  var setCookie    = upHeaders['Set-Cookie']   || upHeaders['set-cookie']   || null;

  // Detect binary content — base64-encode so it survives JSON transport
  var isBinary = !/^text\/|application\/json|application\/javascript|application\/xml/.test(ct);
  var body, encoding;

  if (isBinary) {
    body     = Utilities.base64Encode(upstream.getContent());
    encoding = 'base64';
  } else {
    body     = upstream.getContentText('UTF-8');
    encoding = 'utf8';
  }

  var envelope = JSON.stringify({
    status:      statusCode,
    contentType: ct,
    body:        body,
    encoding:    encoding,
    setCookie:   setCookie,
  });

  return gasResponse(envelope, 'application/json');
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function gasResponse(text, mimeType) {
  // ContentService always returns HTTP 200; real status is inside the JSON envelope
  return ContentService.createTextOutput(text)
    .setMimeType(ContentService.MimeType.JSON);
}
