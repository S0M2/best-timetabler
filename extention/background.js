// ═══════════════════════════════════════════════════
//  BEST TIMETABLER — background.js
//  Relais de synchronisation vers le serveur Webcal local (127.0.0.1:8765)
// ═══════════════════════════════════════════════════

const LOCAL_SERVER_URL = 'http://127.0.0.1:8765';

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'sync_to_local_server') {
    fetch(`${LOCAL_SERVER_URL}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: msg.events || [] })
    })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => sendResponse({ ok: true, data }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true; // Réponse asynchrone
  }

  if (msg.action === 'check_local_server_status') {
    fetch(`${LOCAL_SERVER_URL}/api/status`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => sendResponse({ ok: true, data }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true; // Réponse asynchrone
  }
});
