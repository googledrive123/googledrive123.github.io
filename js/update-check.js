/*
 * GameVault update notice
 * -----------------------
 * Shows a "Site updated" bar when a newer build of the site is live than the
 * one this tab loaded. Works with plain GitHub Pages, no build step:
 *
 *   - document.lastModified is the Last-Modified header of the HTML this tab
 *     actually loaded (GitHub Pages stamps it per deploy).
 *   - Every POLL_MS we HEAD "/" bypassing the browser cache and compare the
 *     Last-Modified (and ETag) that comes back. GitHub purges its CDN on every
 *     deploy, so a push shows up here about a minute after it lands.
 *
 * We never reload on our own: someone may be mid-game.
 */
(function () {
  'use strict';

  var POLL_MS = 60 * 1000;
  var URL_TO_CHECK = location.origin + '/';

  // Never run inside an iframe (games embed pages).
  try { if (window.self !== window.top) return; } catch (e) { return; }

  var loadedAt = NaN;
  try { loadedAt = new Date(document.lastModified).getTime(); } catch (e) {}
  var baselineEtag = null;
  var shown = false;
  var timer = null;
  var inflight = false;

  function check() {
    if (shown || inflight || document.visibilityState === 'hidden') return;
    inflight = true;
    fetch(URL_TO_CHECK, { method: 'HEAD', cache: 'no-store', credentials: 'omit' })
      .then(function (r) {
        inflight = false;
        if (!r.ok) return;
        var lm = r.headers.get('last-modified');
        var etag = r.headers.get('etag');
        var remoteAt = lm ? new Date(lm).getTime() : NaN;

        // Primary: the live build is newer than the one we loaded (tolerate 1s of rounding).
        if (isFinite(remoteAt) && isFinite(loadedAt) && remoteAt - loadedAt > 1000) { show(); return; }

        // Fallback when Last-Modified is unusable: watch the ETag drift from what we first saw.
        if (etag) {
          if (baselineEtag === null) baselineEtag = etag;
          else if (etag !== baselineEtag && !isFinite(remoteAt)) show();
        }
      })
      .catch(function () { inflight = false; });
  }

  function show() {
    if (shown) return;
    shown = true;
    clearInterval(timer);

    var style = document.createElement('style');
    style.textContent =
      '#gvUpdateBar{position:fixed;top:0;left:0;right:0;z-index:100000;display:flex;align-items:center;justify-content:center;gap:14px;' +
      'padding:10px 44px 10px 16px;background:var(--surface-2,#1a1a20);color:var(--text,#f4f4f6);border-bottom:1px solid var(--border-strong,rgba(255,255,255,.16));' +
      'font:500 14px/1.3 "Space Grotesk",system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.45);transform:translateY(-100%);animation:gvUpdateIn .35s ease-out forwards}' +
      '@keyframes gvUpdateIn{to{transform:translateY(0)}}' +
      '#gvUpdateBar .dot{width:8px;height:8px;border-radius:50%;background:var(--accent,#ff3b3b);flex:none;box-shadow:0 0 0 0 rgba(255,59,59,.6);animation:gvUpdatePulse 1.6s ease-out infinite}' +
      '@keyframes gvUpdatePulse{to{box-shadow:0 0 0 8px rgba(255,59,59,0)}}' +
      '#gvUpdateBar button{font:inherit;cursor:pointer;border-radius:8px}' +
      '#gvUpdateBar .go{background:var(--text,#f4f4f6);color:var(--bg,#08080a);border:0;padding:6px 14px;font-weight:600}' +
      '#gvUpdateBar .go:hover{background:#fff}' +
      '#gvUpdateBar .x{position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:0;color:var(--muted,#8a8a96);font-size:20px;line-height:1;padding:6px 10px}' +
      '#gvUpdateBar .x:hover{color:var(--text,#f4f4f6)}' +
      '@media (max-width:520px){#gvUpdateBar{font-size:13px;gap:10px;padding-left:12px}}';
    document.head.appendChild(style);

    var bar = document.createElement('div');
    bar.id = 'gvUpdateBar';
    bar.setAttribute('role', 'status');
    bar.innerHTML =
      '<span class="dot"></span>' +
      '<span>GameVault was just updated.</span>' +
      '<button class="go" type="button">Refresh now</button>' +
      '<button class="x" type="button" aria-label="Dismiss">&times;</button>';
    document.body.appendChild(bar);

    bar.querySelector('.go').addEventListener('click', function () {
      try { window.GVA && window.GVA.track && window.GVA.track('update_refresh'); } catch (e) {}
      location.reload();
    });
    bar.querySelector('.x').addEventListener('click', function () { bar.remove(); });
  }

  function start() {
    timer = setInterval(check, POLL_MS);
    // Tabs that were in the background catch up as soon as they come back.
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') check(); });
    // First check shortly after load so a deploy that just happened is caught quickly.
    setTimeout(check, 15000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
