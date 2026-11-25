#!/usr/bin/env node
/**
 * Best Timetabler — Serveur Local Webcal & HTTPS
 * Compatible macOS, Windows et Linux
 * - Consommation mémoire : < 30 Mo RAM
 * - Rétention d'historique : 6 mois maximum (purge automatique)
 * - Support double : HTTP (port 8765) et HTTPS (port 8766)
 * - Aucune dépendance externe (pur Node.js)
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const PORT = 8765;
const HTTPS_PORT = 8766;
const HOST = '0.0.0.0';
const DATA_DIR = __dirname;
const EVENTS_FILE = path.join(DATA_DIR, 'events.json');
const ICS_FILE = path.join(DATA_DIR, 'calendar.ics');
const KEY_FILE = path.join(DATA_DIR, 'key.pem');
const CERT_FILE = path.join(DATA_DIR, 'cert.pem');
const CNF_FILE = path.join(DATA_DIR, 'openssl.cnf');

// Rétention d'historique : 6 mois max (en jours)
const RETENTION_MONTHS = 6;
const MAX_PAYLOAD_BYTES = 5 * 1024 * 1024; // 5 Mo max par requête de synchro

let eventsStore = new Map();

// ── Rétention et Purge des anciens événements (> 6 mois) ──
function getCutoffDate() {
  const d = new Date();
  d.setMonth(d.getMonth() - RETENTION_MONTHS);
  return d.toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function pruneOldEvents() {
  const cutoffStr = getCutoffDate();
  let removed = 0;
  for (const [key, ev] of eventsStore.entries()) {
    if (!ev.date || ev.date < cutoffStr) {
      eventsStore.delete(key);
      removed++;
    }
  }
  if (removed > 0) {
    console.log(`[PRUNE] ${removed} événement(s) antérieur(s) à 6 mois (< ${cutoffStr}) supprimé(s).`);
  }
  return removed;
}

// ── Chargement & Sauvegarde ──
function loadEvents() {
  try {
    if (fs.existsSync(EVENTS_FILE)) {
      const data = JSON.parse(fs.readFileSync(EVENTS_FILE, 'utf8'));
      if (Array.isArray(data)) {
        data.forEach(ev => {
          if (ev.date && (ev.courseName || ev.displayName)) {
            const key = getEventKey(ev);
            eventsStore.set(key, sanitizeEvent(ev));
          }
        });
      }
    }
    pruneOldEvents();
  } catch (err) {
    console.error('Erreur chargement events.json:', err.message);
  }
}

function sanitizeEvent(ev) {
  // Conserver uniquement les données utiles pour minimiser la RAM et le stockage
  return {
    date: String(ev.date || '').slice(0, 10),
    sh: Number(ev.sh) || 0,
    sm: Number(ev.sm) || 0,
    eh: Number(ev.eh) || 0,
    em: Number(ev.em) || 0,
    courseName: String(ev.courseName || '').slice(0, 120),
    displayName: String(ev.displayName || '').slice(0, 120),
    timeText: String(ev.timeText || '').slice(0, 30),
    parsed: {
      prof: String(ev.parsed?.prof || '').slice(0, 100),
      type: String(ev.parsed?.type || '').slice(0, 20),
      room: String(ev.parsed?.room || '').slice(0, 80),
      year: String(ev.parsed?.year || '').slice(0, 20)
    }
  };
}

function saveEvents() {
  try {
    pruneOldEvents();
    const list = [...eventsStore.values()].sort((a, b) => {
      const cmp = a.date.localeCompare(b.date);
      if (cmp !== 0) return cmp;
      return (a.sh * 60 + a.sm) - (b.sh * 60 + b.sm);
    });

    fs.writeFileSync(EVENTS_FILE, JSON.stringify(list, null, 2), 'utf8');
    const icsContent = generateICS(list);
    fs.writeFileSync(ICS_FILE, icsContent, 'utf8');
  } catch (err) {
    console.error('Erreur sauvegarde events:', err.message);
  }
}

function getEventKey(ev) {
  return `${ev.date}_${ev.sh}_${ev.sm}_${ev.eh}_${ev.em}_${ev.courseName || ev.displayName}`;
}

function formatICSDate(dateStr, h, m) {
  const parts = dateStr.split('-');
  const hh = String(h || 0).padStart(2, '0');
  const mm = String(m || 0).padStart(2, '0');
  return `${parts[0]}${parts[1]}${parts[2]}T${hh}${mm}00`;
}

function escapeICS(str) {
  if (!str) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function generateICS(events) {
  const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  let lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Best Timetabler//Henallux Horaires//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Horaires Hénallux',
    'X-WR-CALDESC:Horaire des cours Hénallux synchronisé en direct',
    'X-WR-TIMEZONE:Europe/Brussels',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
    'BEGIN:VTIMEZONE',
    'TZID:Europe/Brussels',
    'X-LIC-LOCATION:Europe/Brussels',
    'BEGIN:DAYLIGHT',
    'TZOFFSETFROM:+0100',
    'TZOFFSETTO:+0200',
    'TZNAME:CEST',
    'DTSTART:19700329T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
    'END:DAYLIGHT',
    'BEGIN:STANDARD',
    'TZOFFSETFROM:+0200',
    'TZOFFSETTO:+0100',
    'TZNAME:CET',
    'DTSTART:19701025T030000',
    'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
    'END:STANDARD',
    'END:VTIMEZONE'
  ];

  events.forEach(ev => {
    if (!ev.date) return;
    const key = getEventKey(ev);
    const uidHash = crypto.createHash('md5').update(key).digest('hex');
    const uid = `${uidHash}@henallux.be`;
    const dtStart = formatICSDate(ev.date, ev.sh, ev.sm);
    const dtEnd = formatICSDate(ev.date, ev.eh, ev.em);

    const summary = ev.displayName || ev.courseName || 'Cours';
    let desc = [];
    if (ev.parsed?.prof) desc.push(`Enseignant: ${ev.parsed.prof}`);
    if (ev.parsed?.type) desc.push(`Type: ${ev.parsed.type.toUpperCase()}`);
    if (ev.parsed?.year) desc.push(`Niveau: ${ev.parsed.year}`);
    if (ev.timeText) desc.push(`Horaire: ${ev.timeText}`);
    desc.push('Synchronisé via Best Timetabler');

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${now}`);
    lines.push(`DTSTART;TZID=Europe/Brussels:${dtStart}`);
    lines.push(`DTEND;TZID=Europe/Brussels:${dtEnd}`);
    lines.push(`SUMMARY:${escapeICS(summary)}`);
    if (desc.length > 0) lines.push(`DESCRIPTION:${escapeICS(desc.join('\n'))}`);
    if (ev.parsed?.room) lines.push(`LOCATION:${escapeICS(ev.parsed.room)}`);
    lines.push('STATUS:CONFIRMED');
    lines.push('END:VEVENT');
  });

  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

// ── Auto-génération du certificat SSL si absent ──
function ensureCertificates() {
  if (fs.existsSync(KEY_FILE) && fs.existsSync(CERT_FILE)) return true;
  try {
    if (!fs.existsSync(CNF_FILE)) {
      const cnf = `[req]
distinguished_name = req_distinguished_name
x509_extensions = v3_req
prompt = no

[req_distinguished_name]
CN = localhost
O = Best Timetabler
OU = Local Calendar Server

[v3_req]
keyUsage = critical, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
IP.1 = 127.0.0.1
`;
      fs.writeFileSync(CNF_FILE, cnf, 'utf8');
    }
    execSync(`openssl req -x509 -nodes -days 3650 -newkey rsa:2048 -keyout "${KEY_FILE}" -out "${CERT_FILE}" -config "${CNF_FILE}"`, { stdio: 'ignore' });
    console.log('🔒 Certificat SSL auto-généré avec succès pour localhost !');
    return true;
  } catch (err) {
    console.warn('ℹ️ OpenSSL non disponible pour générer automatiquement le certificat SSL:', err.message);
    return false;
  }
}

// Initialisation
loadEvents();
if (!fs.existsSync(ICS_FILE) || eventsStore.size > 0) {
  saveEvents();
}
ensureCertificates();

// Purge quotidienne automatique en arrière-plan
setInterval(pruneOldEvents, 24 * 60 * 60 * 1000);

// ── Gestionnaire de requêtes HTTP / HTTPS ──
function handleRequest(req, res) {
  const isHttps = Boolean(req.socket.encrypted);
  const proto = isHttps ? 'https' : 'http';

  // Entêtes CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const urlObj = new URL(req.url, `${proto}://${req.headers.host || 'localhost'}`);
  const pathname = urlObj.pathname;

  // 1. Flux Webcal / iCal
  if (pathname === '/calendar.ics' || pathname === '/webcal' || pathname === '/') {
    if (!fs.existsSync(ICS_FILE)) {
      saveEvents();
    }
    const icsContent = fs.readFileSync(ICS_FILE, 'utf8');
    res.writeHead(200, {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="henallux.ics"',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    res.end(icsContent);
    return;
  }

  // 2. Statut API et Métriques (RAM, Stockage, Rétention)
  if (pathname === '/api/status' && req.method === 'GET') {
    const mem = process.memoryUsage();
    let eventsSizeBytes = 0;
    let icsSizeBytes = 0;
    try {
      if (fs.existsSync(EVENTS_FILE)) eventsSizeBytes = fs.statSync(EVENTS_FILE).size;
      if (fs.existsSync(ICS_FILE)) icsSizeBytes = fs.statSync(ICS_FILE).size;
    } catch (e) {}

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'running',
      eventsCount: eventsStore.size,
      retentionMonths: RETENTION_MONTHS,
      cutoffDate: getCutoffDate(),
      storage: {
        eventsJsonKB: +(eventsSizeBytes / 1024).toFixed(1),
        calendarIcsKB: +(icsSizeBytes / 1024).toFixed(1),
        totalKB: +((eventsSizeBytes + icsSizeBytes) / 1024).toFixed(1)
      },
      memory: {
        rssMB: +(mem.rss / (1024 * 1024)).toFixed(1),
        heapUsedMB: +(mem.heapUsed / (1024 * 1024)).toFixed(1)
      },
      endpoints: {
        http: `http://localhost:${PORT}/calendar.ics`,
        https: `https://localhost:${HTTPS_PORT}/calendar.ics`,
        webcal: `webcal://localhost:${HTTPS_PORT}/calendar.ics`
      }
    }, null, 2));
    return;
  }

  // 3. Réception de synchronisation par l'extension
  if (pathname === '/api/sync' && req.method === 'POST') {
    let body = '';
    let bytesReceived = 0;

    req.on('data', chunk => {
      bytesReceived += chunk.length;
      if (bytesReceived > MAX_PAYLOAD_BYTES) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Payload trop volumineux (> 5 Mo)' }));
        req.destroy();
        return;
      }
      body += chunk;
    });

    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const incoming = payload.events || [];
        const cutoffStr = getCutoffDate();
        let addedOrUpdated = 0;

        if (Array.isArray(incoming)) {
          incoming.forEach(ev => {
            // Rejeter les cours vieux de plus de 6 mois
            if (ev.date && ev.date >= cutoffStr && (ev.courseName || ev.displayName)) {
              const sanitized = sanitizeEvent(ev);
              const key = getEventKey(sanitized);
              eventsStore.set(key, sanitized);
              addedOrUpdated++;
            }
          });
          saveEvents();
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: true,
          received: incoming.length,
          saved: addedOrUpdated,
          totalInStore: eventsStore.size,
          retentionMonths: RETENTION_MONTHS,
          updatedAt: new Date().toISOString()
        }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  // 4. Réinitialiser les événements si désiré
  if (pathname === '/api/clear' && req.method === 'POST') {
    eventsStore.clear();
    saveEvents();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, cleared: true }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
}

// ── Démarrage des serveurs ──
const httpServer = http.createServer(handleRequest);
httpServer.listen(PORT, HOST, () => {
  console.log(`🚀 [HTTP]  En écoute sur : http://localhost:${PORT}/calendar.ics`);
});

if (fs.existsSync(KEY_FILE) && fs.existsSync(CERT_FILE)) {
  try {
    const sslOptions = {
      key: fs.readFileSync(KEY_FILE),
      cert: fs.readFileSync(CERT_FILE)
    };
    const httpsServer = https.createServer(sslOptions, handleRequest);
    httpsServer.listen(HTTPS_PORT, HOST, () => {
      console.log(`🔒 [HTTPS] En écoute sur : https://localhost:${HTTPS_PORT}/calendar.ics`);
      console.log(` [WEBCAL] Apple Cal sur : webcal://localhost:${HTTPS_PORT}/calendar.ics`);
    });
  } catch (err) {
    console.error('Erreur démarrage HTTPS:', err.message);
  }
}
