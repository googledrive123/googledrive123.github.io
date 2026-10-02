/* GameVault polls (polls/polls.sql). The newest open poll someone has not
   answered pops up when they come to the site, and they can vote right in
   it. /polls/ shows every poll. One vote each: per account, and per browser
   for a guest.
   Public surface: window.GV.polls.ask(), .card(poll), .use(client), .rpc. */
(function () {
  'use strict';

  var SUPA_URL = 'https://dxwjxzmlezfyursysays.supabase.co';
  var SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4d2p4em1sZXpmeXVyc3lzYXlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MTM1MzAsImV4cCI6MjA5NDI4OTUzMH0.BQZdvlRD1ykfSV0bhlxt77Nb90DzvcX4NI2LrMK4n_0';

  var client = null;

  // A page with its own Supabase client hands it over here, so a signed-in
  // player votes as their account.
  function use(sb) {
    client = sb;
  }

  // As the account when someone is signed in, otherwise as a guest with the
  // site's public key. Every refusal is a sentence to show as it is.
  function rpc(name, args) {
    if (client) {
      return client.rpc(name, args).then(function (res) {
        if (res.error) throw new Error(res.error.code === 'P0001' ? res.error.message : 'Could not reach GameVault. Try again.');
        return res.data;
      });
    }
    return fetch(SUPA_URL + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(args)
    }).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (body) {
        if (!r.ok) throw new Error(body && body.code === 'P0001' ? body.message : 'Could not reach GameVault. Try again.');
        return body;
      });
    });
  }

  // This browser's id (js/identity.js), which a guest votes as.
  function visitor() {
    var id = window.GV && GV.identity;
    if (id && id.ready) return id.ready.then(function (v) { return v || id.id(); });
    try { return Promise.resolve(localStorage.getItem('gv.vid')); } catch (e) { return Promise.resolve(null); }
  }

  window.GV = window.GV || {};
  window.GV.polls = {
    use: use,
    rpc: rpc,
    visitor: visitor
  };
}());
