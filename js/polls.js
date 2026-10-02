/* GameVault polls (polls/polls.sql). The newest open poll someone has not
   answered pops up when they come to the site, and they can vote right in
   it. /polls/ shows every poll. One vote each: per account, and per browser
   for a guest.
   Public surface: window.GV.polls.ask(), .card(poll), .use(client), .rpc. */
(function () {
  'use strict';

  var SUPA_URL = 'https://dxwjxzmlezfyursysays.supabase.co';
  var SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4d2p4em1sZXpmeXVyc3lzYXlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MTM1MzAsImV4cCI6MjA5NDI4OTUzMH0.BQZdvlRD1ykfSV0bhlxt77Nb90DzvcX4NI2LrMK4n_0';

  // As a guest with the site's public key. Every refusal is a sentence to
  // show as it is.
  function rpc(name, args) {
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

  window.GV = window.GV || {};
  window.GV.polls = {
    rpc: rpc
  };
}());
