// ═══════════════════════════════════════════════════
//  BEST TIMETABLER — content.js v2.0
//  UI/UX Sublime, Remplacement Logo, Masquage Footer,
//  Sélection des Cours, Tri BAC (1, 2, 3) & Couleurs
// ═══════════════════════════════════════════════════

const isMoodle = location.hostname.includes('moodle.henallux.be');
const isPortal = location.hostname.includes('portail.henallux.be');

let enabled = true;
let portalTheme = 'light';
let courseSettings = {};
let knownCourses = new Set();
let moodleCourses = {};
let currentView = 'list';
let currentBacFilter = 'all';
let agendaObserver = null;
let updateDebounce = null;

// ── Initialisation ──
chrome.storage.local.get(['courseSettings', 'knownCourses', 'extensionEnabled', 'currentView', 'currentBacFilter', 'portalTheme', 'moodleCourses'], res => {
  if (chrome.runtime.lastError) return;
  courseSettings = res.courseSettings || {};
  if (res.knownCourses) res.knownCourses.forEach(c => knownCourses.add(c));
  if (res.moodleCourses) moodleCourses = res.moodleCourses;
  enabled = res.extensionEnabled !== false;
  portalTheme = res.portalTheme || 'light';
  if (res.currentView) currentView = res.currentView;
  if (res.currentBacFilter) currentBacFilter = res.currentBacFilter;

  if (enabled) {
    replaceSiteLogo();
    applyAll();
  }
});

// Écoute des changements de paramètres
chrome.storage.onChanged.addListener((changes, ns) => {
  if (ns !== 'local') return;
  if (changes.extensionEnabled !== undefined) {
    enabled = changes.extensionEnabled.newValue !== false;
    applyAll();
  }
  if (changes.portalTheme?.newValue) {
    portalTheme = changes.portalTheme.newValue;
    if (enabled) applyAll();
  }
  if (changes.courseSettings?.newValue) {
    courseSettings = changes.courseSettings.newValue;
    if (enabled) applyAll();
  }
  if (changes.moodleCourses?.newValue) {
    moodleCourses = changes.moodleCourses.newValue;
    if (enabled && isPortal) renderCustomAgenda();
  }
});

chrome.runtime.onMessage.addListener((msg, _s, reply) => {
  if (msg.action === 'get_courses') {
    reply({ courses: isPortal ? collectCourses() : [] });
    return true;
  }
  if (msg.action === 'apply_settings') {
    courseSettings = msg.settings || {};
    enabled = msg.enabled !== false;
    if (msg.portalTheme) portalTheme = msg.portalTheme;
    applyAll();
    return true;
  }
  return false;
});

function applyAll() {
  if (!enabled) {
    removeStyles();
    return;
  }
  replaceSiteLogo();
  injectGlobalStyles();
  if (isMoodle) initMoodle();
  if (isPortal) initPortal();
}

function removeStyles() {
  document.getElementById('enhancer-global-styles')?.remove();
  document.getElementById('enhancer-agenda')?.remove();
  document.body.classList.remove('enhancer-dark', 'enhancer-light');
  const fc = document.querySelector('.fc');
  if (fc) {
    fc.style.position = '';
    fc.style.top = '';
    fc.style.opacity = '';
    fc.style.pointerEvents = '';
  }
  document.querySelectorAll('.course-card').forEach(c => {
    c.style.removeProperty('border-left');
    c.style.removeProperty('display');
  });
}

// ══════════════════════════════════════════════════
//  REMPLACEMENT LOGO & MASQUAGE FOOTER
// ══════════════════════════════════════════════════

function replaceSiteLogo() {
  if (!enabled) return;
  const logoSelectors = [
    '#logo',
    '.navbar-brand img',
    '.site-name img',
    '.site-logo img',
    '.site-logo',
    '.brand img',
    'header .navbar-brand img'
  ];

  const logoUrl = chrome.runtime.getURL('icons/icon128.png');

  logoSelectors.forEach(sel => {
    document.querySelectorAll(sel).forEach(el => {
      if (el.tagName === 'IMG') {
        el.src = logoUrl;
        el.srcset = '';
        Object.entries({
          width: '38px',
          height: '38px',
          'min-width': '38px',
          'min-height': '38px',
          'border-radius': '9px',
          'object-fit': 'cover',
          'box-shadow': '0 2px 10px rgba(0,0,0,0.25)',
          border: '2px solid rgba(255,255,255,0.25)',
          display: 'inline-block'
        }).forEach(([k, v]) => el.style.setProperty(k, v, 'important'));
      }
    });
  });
}

// ══════════════════════════════════════════════════
//  HELPERS PASTEL & PARSER
// ══════════════════════════════════════════════════

function hexToRgba(hex, alpha = 1) {
  if (!hex || typeof hex !== 'string') return `rgba(147, 197, 253, ${alpha})`;
  let c = hex.replace('#', '').trim();
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  const num = parseInt(c, 16);
  if (isNaN(num)) return `rgba(147, 197, 253, ${alpha})`;
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function decodeHTMLEntities(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/<b\s*r\s*\/?>/gi, ' - ')
    .replace(/<br\s*\/?>/gi, ' - ')
    .replace(/<[^>]*>/g, ' ');
}

function detectBac(rawText) {
  if (!rawText) return null;
  const s = decodeHTMLEntities(rawText);

  // Format Portail: IE-IR-1B-C, IE-RT-2B-A, IE-TI-3B
  const mPortail = s.match(/(?:IE-)?[A-Z]{2,4}-([1-3])B(?:-[A-Z0-9]+)?\b/i);
  if (mPortail) return 'BAC ' + mPortail[1];

  // Format Moodle: IE-IR-B2-C270B, IR-B1-
  const mMoodle = s.match(/(?:IE-)?[A-Z]{2,4}-B([1-3])-[A-Z0-9]+/i);
  if (mMoodle) return 'BAC ' + mMoodle[1];

  // Format crochet: [BAC 1], [BAC2], [1B], [2]
  const mBracket = s.match(/\[\s*(?:BAC\s*)?([1-3])(?:[A-Z])?\s*\]/i);
  if (mBracket) return 'BAC ' + mBracket[1];

  // Format texte libre: BAC 1, BAC2, Bloc 1, Bloc 2
  const mText = s.match(/\b(?:BAC|BLOC)\s*([1-3])\b/i);
  if (mText) return 'BAC ' + mText[1];

  // Format code cours isolé: 1B, 2B, 3B
  const mIso = s.match(/\b([1-3])B\b/i);
  if (mIso) return 'BAC ' + mIso[1];

  return null;
}

const EMOJI_REGEX = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1FA00}-\u{1FAFF}\u{FE00}-\u{FE0F}]/gu;

function stripEmojis(p) {
  if (!p) return '';
  return p.replace(EMOJI_REGEX, '').replace(/\s{2,}/g, ' ').trim();
}

function removeEmojisFromDOM(root = document.body) {
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
  let node;
  while ((node = walker.nextNode())) {
    if (EMOJI_REGEX.test(node.nodeValue)) {
      node.nodeValue = node.nodeValue.replace(EMOJI_REGEX, '');
    }
  }
}

function setCleanHTML(el, htmlString) {
  el.replaceChildren();
  if (!htmlString) return;
  const doc = new DOMParser().parseFromString(htmlString, 'text/html');
  const frag = document.createDocumentFragment();
  while (doc.body.firstChild) {
    frag.appendChild(doc.body.firstChild);
  }
  el.appendChild(frag);
}

function cleanText(p) {
  if (!p) return '';
  return stripEmojis(p)
    .replace(/^[\s\-–—:,*|/]+|[\s\-–—:,*|/]+$/g, '')
    .replace(/\bfor\s+ensique\b/gi, 'forensique')
    .replace(/\bprofessio\s+nnelle\b/gi, 'professionnelle')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseCourseTitle(text) {
  if (!text) return null;
  let s = decodeHTMLEntities(text);

  s = s.replace(/Enseignant\s*:\s*/gi, ' - ')
       .replace(/Nom du cours\s*/gi, '')
       .replace(/Catégorie de cours\s*/gi, '')
       .replace(/\bfor\s+ensique\b/gi, 'forensique')
       .replace(/\bprofessio\s+nnelle\b/gi, 'professionnelle')
       .replace(/\s+/g, ' ')
       .trim();

  const year = detectBac(s);

  // Extraction des salles
  const rooms = [];
  s = s.replace(/\bIE-(?:L\.)?[0-9]+[A-Za-z0-9\-/.]*(?:\s*\([^)]+\))?(?:\s*Labo\s*[^,\-]+)?|\bIESN\b/gi, m => {
    const trimmed = m.trim();
    if (trimmed !== 'IESN' && !rooms.includes(trimmed)) rooms.push(trimmed);
    return ' __R__ ';
  });

  // Suppression des codes de groupe et capacité
  s = s.replace(/(?:IE-)?[A-Z]{2,4}-(?:[1-3]B|B[1-3])(?:-[A-Z0-9]+)?/gi, ' __C__ ');
  s = s.replace(/\(?\b\d+\s*pl(?:aces?)?\.?\)?/gi, '');
  s = s.replace(/\[[^\]]+\]/g, ' __G__ ');

  let parts = s.split(/\s*__R__\s*|\s*__C__\s*|\s*__G__\s*|\s+[-–—*|]\s+/)
    .map(cleanText)
    .filter(p => p.length > 0 && !/^[A-Z0-9\-,.\s]+$/.test(p));

  if (parts.length === 1 && parts[0].includes(' - ')) {
    parts = parts[0].split(/\s+[-–—]\s+/).map(cleanText).filter(p => p.length > 0);
  }

  let name = cleanText(parts[0] || 'Inconnu');
  let prof = cleanText(parts[1] || '');

  if (parts.length > 1 && parts[1].toLowerCase().startsWith(parts[0].toLowerCase())) {
    name = cleanText(parts[1]);
    prof = cleanText(parts[2] || '');
  } else if (name.length < 3 && parts.length > 1) {
    name = cleanText(parts[1]);
    prof = cleanText(parts[2] || '');
  }

  if (prof && name.toLowerCase().endsWith(prof.toLowerCase())) {
    name = cleanText(name.slice(0, name.length - prof.length));
  }

  name = name.replace(/\s*[-]?\s*Q[12](\/Q[12])?$/i, '')
             .replace(/[:\s-]+$/, '')
             .replace(/\s+/g, ' ')
             .trim();

  if (prof) {
    const profParts = prof.split(/\s*[-–]\s*/);
    if (profParts.length === 2 && profParts[0].trim().toLowerCase() === profParts[1].trim().toLowerCase()) {
      prof = profParts[0].trim();
    }
  }

  const lo = text.toLowerCase();
  let type = 'cours';
  if (/\b(?:exam|examen|interro|évaluation)\b/.test(lo)) type = 'exam';
  else if (/\b(?:labo|laboratoire|tp)\b/.test(lo)) type = 'lab';
  else if (/\b(?:autonomie)\b/.test(lo)) type = 'auto';
  else if (/\b(?:théorie|theorie)\b/.test(lo)) type = 'th';

  return { name, prof, type, room: rooms.join(', '), year };
}

function getCanonicalName(text) {
  const p = parseCourseTitle(text);
  if (!p) return text ? text.slice(0, 30) : '';
  return p.year ? `${p.name} [${p.year}]` : p.name;
}

function getCourseSetting(name) {
  if (!name || !courseSettings) return null;
  if (courseSettings[name]) return courseSettings[name];

  const base = name.replace(/\s*\[\s*BAC\s*[1-3]\s*\]/gi, '').trim().toLowerCase();
  for (const [key, val] of Object.entries(courseSettings)) {
    const keyBase = key.replace(/\s*\[\s*BAC\s*[1-3]\s*\]/gi, '').trim().toLowerCase();
    if (keyBase === base) return val;
  }
  return null;
}

function collectCourses() {
  if (!isPortal) return [];

  const fc = document.querySelector('.fc');
  if (fc) {
    fc.querySelectorAll('.fc-list-event-title, .fc-event-title, .fc-daygrid-event').forEach(el => {
      const name = getCanonicalName(el.textContent.replace(/\s+/g, ' ').trim());
      if (name && name.length >= 3) knownCourses.add(name);
    });
  }

  if (knownCourses.size > 0) {
    chrome.storage.local.get(['knownCourses'], res => {
      const existing = res.knownCourses || [];
      const merged = [...new Set([...existing, ...knownCourses])].sort();
      chrome.storage.local.set({ knownCourses: merged });
    });
  }
  return [...knownCourses].sort();
}

// ══════════════════════════════════════════════════
//  MOODLE INTÉGRATION & DÉTECTION AUTOMATIQUE
// ══════════════════════════════════════════════════

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function harvestMoodleCourses(doc = document) {
  const found = {};
  doc.querySelectorAll('a[href*="/course/view.php?id="]').forEach(a => {
    const href = a.getAttribute('href') || '';
    const m = href.match(/course\/view\.php\?id=(\d+)/);
    if (!m) return;
    const id = m[1];
    if (id === '1') return; // Page d'accueil du site

    let text = (a.innerText || a.textContent || '').replace(/\s+/g, ' ').trim();
    if (!text || text.length < 3) {
      const parent = a.closest('.course-card, .coursename, .course-info-container, li, [data-region="course-content"]');
      if (parent) {
        const titleEl = parent.querySelector('.coursename, .text-truncate, h4, h5, h6, .course-name');
        if (titleEl) text = (titleEl.innerText || titleEl.textContent || '').replace(/\s+/g, ' ').trim();
      }
    }
    if (!text || text.length < 3) return;
    const low = text.toLowerCase();
    if (low.includes('tableau de bord') || low.includes('accueil') || low.includes('mes cours') || low.includes('dashboard')) return;

    const fullUrl = `https://moodle.henallux.be/course/view.php?id=${id}`;
    found[id] = { id, name: text, url: fullUrl };
  });
  return found;
}

function harvestAndSaveMoodleCourses(doc = document) {
  const found = harvestMoodleCourses(doc);
  if (Object.keys(found).length > 0) {
    chrome.storage.local.get(['moodleCourses'], res => {
      const existing = res.moodleCourses || {};
      const merged = { ...existing, ...found };
      moodleCourses = merged;
      chrome.storage.local.set({ moodleCourses: merged });
    });
  }
}

let hasFetchedMoodle = false;
async function tryFetchMoodleCourses() {
  if (hasFetchedMoodle) return;
  hasFetchedMoodle = true;
  try {
    const res = await fetch('https://moodle.henallux.be/my/', { credentials: 'include' });
    if (!res.ok) return;
    const html = await res.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    harvestAndSaveMoodleCourses(doc);
  } catch (e) {
    // Session non partagée ou non connecté
  }
}

function normalizeForMatch(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // sans accents
    .replace(/\[\s*bac\s*[1-3]\s*\]/gi, ' ')
    .replace(/\b(?:bac|bloc)\s*[1-3]\b/gi, ' ')
    .replace(/\b(?:ie|he|ig)\s*[-_ ]*\s*[1-3]b\b/gi, ' ')
    .replace(/\bb[1-3]\b/gi, ' ')
    .replace(/\b(th|lab|auto|exam|q1|q2|aa|ue|quadrimestre|groupe|cours)\b/gi, ' ')
    .replace(/20\d\d\s*[-–/]\s*20\d\d/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findBestMoodleMatch(agendaCourseName, agendaDisplayName) {
  const s = getCourseSetting(agendaCourseName);
  if (s && s.moodleUrl !== undefined) {
    if (!s.moodleUrl) return null; // Désactivé manuellement
    return {
      url: s.moodleUrl,
      name: s.moodleName || 'Cours Moodle',
      isManual: true
    };
  }

  const base = agendaCourseName.replace(/\s*\[\s*BAC\s*[1-3]\s*\]/gi, '').trim();
  const baseSetting = getCourseSetting(base);
  if (baseSetting && baseSetting.moodleUrl !== undefined) {
    if (!baseSetting.moodleUrl) return null;
    return {
      url: baseSetting.moodleUrl,
      name: baseSetting.moodleName || 'Cours Moodle',
      isManual: true
    };
  }

  const courseList = Object.values(moodleCourses || {});
  if (courseList.length === 0) return null;

  const targetName = normalizeForMatch(agendaDisplayName || agendaCourseName);
  if (!targetName || targetName.length < 2) return null;

  const targetNums = targetName.match(/\b\d+\b/g) || [];
  const targetTokens = targetName.split(' ').filter(w => w.length > 2);

  let bestMatch = null;
  let bestScore = 0;

  for (const mc of courseList) {
    const mNorm = normalizeForMatch(mc.name);
    if (!mNorm) continue;

    const mNums = mNorm.match(/\b\d+\b/g) || [];
    // Empêcher les faux positifs entre années ou numéros de cours distincts
    if (targetNums.length > 0 && mNums.length > 0) {
      const hasCommon = targetNums.some(n => mNums.includes(n));
      if (!hasCommon) continue;
    }

    // Correspondance exacte normalisée
    if (mNorm === targetName) {
      return { url: mc.url, name: mc.name, isManual: false, score: 100 };
    }

    // Inclusion de sous-chaîne
    if (mNorm.includes(targetName) || targetName.includes(mNorm)) {
      const score = 80 + (Math.min(mNorm.length, targetName.length) / Math.max(mNorm.length, targetName.length)) * 15;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = mc;
      }
      continue;
    }

    // Chevauchement de mots significatifs
    if (targetTokens.length > 0) {
      const mTokens = new Set(mNorm.split(' ').filter(w => w.length > 2));
      let overlap = 0;
      targetTokens.forEach(t => {
        if (mTokens.has(t)) overlap++;
        else {
          for (const mt of mTokens) {
            if (mt.includes(t) || t.includes(mt)) {
              overlap += 0.7;
              break;
            }
          }
        }
      });

      const tokenScore = (overlap / targetTokens.length) * 70;
      if (overlap >= 1 && tokenScore > bestScore && tokenScore >= 40) {
        bestScore = tokenScore;
        bestMatch = mc;
      }
    }
  }

  if (bestMatch && bestScore >= 40) {
    return { url: bestMatch.url, name: bestMatch.name, isManual: false, score: bestScore };
  }
  return null;
}

// ══════════════════════════════════════════════════
//  MOODLE
// ══════════════════════════════════════════════════
function initMoodle() {
  injectGlobalStyles();
  replaceSiteLogo();
  removeEmojisFromDOM();
  applyMoodle();
  harvestAndSaveMoodleCourses(document);
  repositionMoodleSearchBar();

  const obs = new MutationObserver(() => {
    replaceSiteLogo();
    removeEmojisFromDOM();
    clearTimeout(updateDebounce);
    updateDebounce = setTimeout(applyMoodle, 300);
  });
  obs.observe(document.body, { childList: true, subtree: true });
}

function applyMoodle() {
  replaceSiteLogo();
  harvestAndSaveMoodleCourses(document);
  repositionMoodleSearchBar();

  // Supprimer le fond blanc et les bordures des conteneurs globaux (dashboard / overview)
  document.querySelectorAll('#region-main, .region-main, #region-main-box, .block, .block_myoverview, [data-region="myoverview"], .card:not(.course-card):not([data-region="card-deck"] .card):not(.dashboard-card)').forEach(el => {
    el.style.setProperty('background-color', 'transparent', 'important');
    el.style.setProperty('border', 'none', 'important');
    el.style.setProperty('box-shadow', 'none', 'important');
  });

  document.querySelectorAll('[data-region="card-deck"] .course-card, .block_recentlyaccessedcourses .course-card').forEach(card => {
    const titleEl = card.querySelector('.coursename, .text-truncate');
    if (!titleEl) return;
    const name = getCanonicalName(titleEl.textContent.trim());
    const s = getCourseSetting(name);

    if (s && s.visible === false) {
      card.style.setProperty('display', 'none', 'important');
    } else {
      card.style.removeProperty('display');
      card.style.removeProperty('border-left');
      card.style.setProperty('border', 'none', 'important');
    }
  });
}

function repositionMoodleSearchBar() {
  if (!isMoodle) return;

  // 1. Trouver le champ / groupe de recherche
  const searchInput = document.querySelector(
    'input[placeholder*="cours" i], form[action*="course/search.php"] input, #page-header input[type="search"], #page-header input[type="text"], input[name="q"]'
  );
  if (!searchInput) return;

  const inputGroup = searchInput.closest('.input-group') || searchInput.closest('form') || searchInput;
  const searchWrap = searchInput.closest('.simplesearchform') || searchInput.closest('form') || searchInput.closest('.header-actions-container') || inputGroup;

  // 2. Trouver le conteneur du titre "Moodle HENALLUX"
  let titleContainer = null;
  const candidates = document.querySelectorAll(
    '#page-header .d-flex.align-items-center, #page-header h1, #page-header .page-header-headings, #page-header .page-context-header, .page-header-headings'
  );

  for (const el of candidates) {
    if (el.textContent.includes('Moodle HENALLUX') || el.textContent.includes('HENALLUX')) {
      titleContainer = el.closest('.d-flex.align-items-center') || el.closest('.page-context-header') || el;
      break;
    }
  }

  if (!titleContainer) {
    titleContainer = document.querySelector('#page-header h1, #page-header .page-header-headings');
  }

  if (titleContainer && searchWrap) {
    titleContainer.style.setProperty('width', '100%', 'important');
    titleContainer.style.setProperty('margin-bottom', '4px', 'important');

    const parent = titleContainer.parentElement;
    if (parent) {
      parent.classList.add('ea-moodle-header-col');
    }

    // Déplacer searchWrap juste en-dessous du conteneur du titre
    if (titleContainer.nextElementSibling !== searchWrap) {
      titleContainer.insertAdjacentElement('afterend', searchWrap);
    }

    searchWrap.classList.add('ea-moodle-search-wrap');
    if (inputGroup) inputGroup.classList.add('ea-moodle-input-group');
  }
}

// ══════════════════════════════════════════════════
//  PORTAIL AGENDA
// ══════════════════════════════════════════════════
function initPortal() {
  injectGlobalStyles();
  replaceSiteLogo();
  removeEmojisFromDOM();
  tryFetchMoodleCourses();
  waitForFC();

  const obs = new MutationObserver(() => {
    replaceSiteLogo();
    removeEmojisFromDOM();
  });
  obs.observe(document.body, { childList: true, subtree: true });
}

function waitForFC() {
  const check = () => {
    const fc = document.querySelector('.fc');
    if (fc) {
      setupPortalAgenda();
      return true;
    }
    return false;
  };
  if (check()) return;

  const obs = new MutationObserver(() => {
    if (check()) obs.disconnect();
  });
  obs.observe(document.body, { childList: true, subtree: true });
  setTimeout(check, 1000);
}

function setupPortalAgenda() {
  injectGlobalStyles();
  buildAgendaUI();
  applyPortal();

  const fc = document.querySelector('.fc');
  if (fc && !agendaObserver) {
    agendaObserver = new MutationObserver(() => {
      clearTimeout(updateDebounce);
      updateDebounce = setTimeout(applyPortal, 200);
    });
    agendaObserver.observe(fc, { childList: true, subtree: true });
  }
}

function applyPortal() {
  collectCourses();
  renderCustomAgenda();
}

// ── Lecture des événements FullCalendar ──
function readEventsFromFC() {
  const fc = document.querySelector('.fc');
  if (!fc) return [];

  const map = new Map();

  const add = (date, timeText, rawText) => {
    const name = getCanonicalName(rawText);
    const parsed = parseCourseTitle(rawText);
    const s = getCourseSetting(name);

    // Filtrer si masqué
    if (s && s.visible === false) return;

    // Filtrer par BAC si actif
    if (currentBacFilter !== 'all') {
      const bacNum = parsed?.year ? parsed.year.replace('BAC ', '').trim() : null;
      if (bacNum && bacNum !== currentBacFilter) return;
    }

    const m = timeText.match(/(\d{1,2})[:h](\d{2})\s*[-–]\s*(\d{1,2})[:h](\d{2})/);
    const key = `${date}|${timeText}|${name}`;

    map.set(key, {
      date,
      timeText,
      courseName: name,
      displayName: parsed?.name || name,
      parsed,
      sh: m ? +m[1] : 0,
      sm: m ? +m[2] : 0,
      eh: m ? +m[3] : 0,
      em: m ? +m[4] : 0,
      color: s?.color || '#93c5fd'
    });
  };

  // 1. Vue liste
  const lt = fc.querySelector('.fc-list-table');
  if (lt) {
    let curDate = null;
    lt.querySelectorAll('tr').forEach(tr => {
      if (tr.classList.contains('fc-list-day')) {
        curDate = tr.getAttribute('data-date');
      } else if (tr.classList.contains('fc-list-event')) {
        const timeEl = tr.querySelector('.fc-list-event-time');
        const titleEl = tr.querySelector('.fc-list-event-title');
        if (timeEl && titleEl && curDate) {
          add(curDate, timeEl.textContent.trim(), titleEl.textContent.replace(/\s+/g, ' ').trim());
        }
      }
    });
    if (map.size > 0) return [...map.values()];
  }

  // 2. Vue grille / jours
  fc.querySelectorAll('.fc-day[data-date], .fc-daygrid-day[data-date]').forEach(day => {
    const date = day.getAttribute('data-date');
    day.querySelectorAll('.fc-event, .fc-daygrid-event').forEach(ev => {
      const timeEl = ev.querySelector('.fc-event-time, .fc-daygrid-event-time');
      const titleEl = ev.querySelector('.fc-event-title, .fc-daygrid-event-title') || ev;
      if (timeEl && titleEl && date) {
        add(date, timeEl.textContent.trim(), titleEl.textContent.replace(/\s+/g, ' ').trim());
      }
    });
  });

  return [...map.values()];
}

// ── Interface Agenda Portail ──
function buildAgendaUI() {
  if (document.getElementById('enhancer-agenda')) return;
  const fc = document.querySelector('.fc');
  if (!fc) return;

  const wrap = document.createElement('div');
  wrap.id = 'enhancer-agenda';

  setCleanHTML(wrap, `
    <div class="ea-bar">
      <div class="ea-nav">
        <button class="ea-btn" id="ea-prev" title="Précédent">‹</button>
        <button class="ea-btn ea-btn-today" id="ea-today">Aujourd'hui</button>
        <button class="ea-btn" id="ea-next" title="Suivant">›</button>
      </div>
      <div class="ea-title" id="ea-title"></div>
      <div class="ea-bacs">
        <button class="ea-bac-btn ${currentBacFilter === 'all' ? 'active' : ''}" data-bac="all">Tous</button>
        <button class="ea-bac-btn ${currentBacFilter === '1' ? 'active' : ''}" data-bac="1">BAC 1</button>
        <button class="ea-bac-btn ${currentBacFilter === '2' ? 'active' : ''}" data-bac="2">BAC 2</button>
        <button class="ea-bac-btn ${currentBacFilter === '3' ? 'active' : ''}" data-bac="3">BAC 3</button>
      </div>
      <div class="ea-views">
        <button class="ea-vbtn ${currentView === 'list' ? 'active' : ''}" data-view="list">Liste</button>
        <button class="ea-vbtn ${currentView === 'week' ? 'active' : ''}" data-view="week">Semaine</button>
      </div>
      <button class="ea-btn ea-btn-apple" id="ea-apple-cal-btn" title="Connecter ou synchroniser avec Apple Calendar"> Calendrier</button>
    </div>
    <div id="ea-container" class="ea-container"></div>
  `);

  fc.parentNode.insertBefore(wrap, fc);

  // Masquer FullCalendar d'origine sans bloquer ses calculs
  fc.style.position = 'fixed';
  fc.style.top = '-20000px';
  fc.style.opacity = '0';
  fc.style.pointerEvents = 'none';

  document.getElementById('ea-prev').onclick = () => navFC('prev');
  document.getElementById('ea-next').onclick = () => navFC('next');
  document.getElementById('ea-today').onclick = () => navFC('today');
  document.getElementById('ea-apple-cal-btn').onclick = openAppleCalendarModal;

  wrap.querySelectorAll('.ea-bac-btn').forEach(btn => {
    btn.onclick = () => {
      currentBacFilter = btn.dataset.bac;
      chrome.storage.local.set({ currentBacFilter });
      wrap.querySelectorAll('.ea-bac-btn').forEach(b => b.classList.toggle('active', b === btn));
      renderCustomAgenda();
    };
  });

  wrap.querySelectorAll('.ea-vbtn').forEach(btn => {
    btn.onclick = () => {
      currentView = btn.dataset.view;
      chrome.storage.local.set({ currentView });
      wrap.querySelectorAll('.ea-vbtn').forEach(b => b.classList.toggle('active', b === btn));
      renderCustomAgenda();
    };
  });
}

function navFC(action) {
  const btn = document.querySelector(`.fc .fc-${action}-button`);
  if (btn) {
    btn.click();
    setTimeout(renderCustomAgenda, 200);
  }
}

function renderCustomAgenda() {
  const container = document.getElementById('ea-container');
  const titleEl = document.getElementById('ea-title');
  if (!container) return;

  const fcTitle = document.querySelector('.fc .fc-toolbar-title, .fc .fc-toolbar h2')?.textContent.trim() || '';
  if (titleEl) titleEl.textContent = fcTitle;

  const events = readEventsFromFC();

  if (events.length > 0) {
    triggerSilentLocalSync(events);
  }

  if (events.length === 0) {
    setCleanHTML(container, '<div class="ea-empty">Aucun cours sur cette période pour la sélection actuelle.</div>');
    return;
  }

  if (currentView === 'week') {
    renderWeekView(container, events);
  } else {
    renderListView(container, events);
  }
}

// ── Rendu Vue Liste ──
function renderListView(container, events) {
  container.replaceChildren();
  const todayStr = new Date().toLocaleDateString('en-CA');

  const groups = {};
  events.forEach(ev => {
    (groups[ev.date] = groups[ev.date] || []).push(ev);
  });

  Object.keys(groups).sort().forEach(date => {
    const d = new Date(`${date}T12:00:00`);
    const isToday = date === todayStr;

    const dayBlock = document.createElement('div');
    dayBlock.className = `ea-day${isToday ? ' is-today' : ''}`;

    setCleanHTML(dayBlock, `
      <div class="ea-day-head">
        <span class="ea-day-name">${capitalize(d.toLocaleDateString('fr-FR', { weekday: 'long' }))}</span>
        ${isToday ? '<span class="ea-today-badge">Aujourd\'hui</span>' : ''}
        <span class="ea-day-date">${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
      </div>
      <div class="ea-day-events"></div>
    `);

    const eventsList = dayBlock.querySelector('.ea-day-events');

    groups[date].sort((a, b) => (a.sh * 60 + a.sm) - (b.sh * 60 + b.sm)).forEach(ev => {
      const moodleMatch = findBestMoodleMatch(ev.courseName, ev.displayName);
      ev.moodleMatch = moodleMatch;

      const isDark = portalTheme === 'dark';
      const card = document.createElement('div');
      card.className = 'ea-card';
      card.style.borderLeftColor = ev.color;
      card.style.setProperty('--card-accent', ev.color);
      card.style.setProperty('--card-pastel-bg', hexToRgba(ev.color, isDark ? 0.35 : 0.22));
      card.style.setProperty('--card-pastel-border', hexToRgba(ev.color, isDark ? 0.70 : 0.45));

      const typeBadge = {
        th: '<span class="ea-badge ea-badge-th">TH</span>',
        lab: '<span class="ea-badge ea-badge-lab">LAB</span>',
        auto: '<span class="ea-badge ea-badge-auto">AUTO</span>',
        exam: '<span class="ea-badge ea-badge-exam">EXAM</span>'
      }[ev.parsed?.type] || '';

      const bacBadge = ev.parsed?.year
        ? `<span class="ea-badge ea-badge-bac">${ev.parsed.year}</span>`
        : '';

      const moodleBadge = moodleMatch
        ? `<a href="${moodleMatch.url}" target="_blank" rel="noopener" class="ea-moodle-badge" title="Ouvrir le cours Moodle : ${escapeHtml(moodleMatch.name)}" onclick="event.stopPropagation();">Moodle ↗</a>`
        : '';

      const s = getCourseSetting(ev.courseName);
      const isDirectMoodle = Boolean(s?.directMoodle && moodleMatch);

      card.title = isDirectMoodle
        ? `Cliquer pour ouvrir sur Moodle (${moodleMatch.name})`
        : 'Cliquer pour options et couleur';

      setCleanHTML(card, `
        <div class="ea-time">${ev.timeText}</div>
        <div class="ea-info">
          <div class="ea-name">${ev.displayName} ${typeBadge} ${bacBadge}</div>
          <div class="ea-meta">
            ${ev.parsed?.room ? `<span class="ea-meta-room">${ev.parsed.room}</span>` : ''}
            ${ev.parsed?.prof ? `<span class="ea-meta-prof">${ev.parsed.prof}</span>` : ''}
          </div>
        </div>
        ${moodleBadge}
        <span class="ea-card-gear" title="Personnaliser et options Moodle" onclick="event.stopPropagation();"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg></span>
      `);

      card.querySelector('.ea-card-gear')?.addEventListener('click', (e) => {
        e.stopPropagation();
        openCourseQuickDialog(ev);
      });

      card.addEventListener('click', () => {
        if (isDirectMoodle) {
          window.open(moodleMatch.url, '_blank');
        } else {
          openCourseQuickDialog(ev);
        }
      });
      eventsList.appendChild(card);
    });

    container.appendChild(dayBlock);
  });
}

// ── Rendu Vue Semaine (Grille Horaire avec les Heures) ──
function renderWeekView(container, events) {
  container.replaceChildren();
  const todayStr = new Date().toLocaleDateString('en-CA');

  const sortedDates = [...new Set(events.map(e => e.date))].sort();
  if (sortedDates.length === 0) return;

  // Calcul du lundi de la semaine affichée
  const refDate = new Date(`${sortedDates[0]}T12:00:00`);
  const dayOfWeek = (refDate.getDay() + 6) % 7; // 0 = Lundi, 6 = Dimanche
  const monday = new Date(refDate);
  monday.setDate(refDate.getDate() - dayOfWeek);

  // Détection si des cours ont lieu le samedi
  const hasSaturday = sortedDates.some(d => new Date(`${d}T12:00:00`).getDay() === 6);
  const numDays = hasSaturday ? 6 : 5;

  const weekDates = [];
  for (let i = 0; i < numDays; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    weekDates.push(d.toLocaleDateString('en-CA'));
  }

  // Échelle des heures : min 8h, max 18h ou fin du dernier cours
  const START_HOUR = 8;
  let maxH = 18;
  events.forEach(e => {
    const endH = e.eh + (e.em > 0 ? 1 : 0);
    if (endH > maxH) maxH = endH;
  });
  const END_HOUR = Math.min(21, maxH);
  const TOTAL_HOURS = END_HOUR - START_HOUR;
  const HOUR_HEIGHT = 60; // 60px par heure = 1px par minute
  const totalGridHeight = TOTAL_HOURS * HOUR_HEIGHT;

  // Conteneur principal de la grille
  const tg = document.createElement('div');
  tg.className = 'ea-timegrid';

  // 1. En-tête des jours
  const headerRow = document.createElement('div');
  headerRow.className = 'ea-tg-header-row';

  const corner = document.createElement('div');
  corner.className = 'ea-tg-corner';
  headerRow.appendChild(corner);

  const dayHeadersWrap = document.createElement('div');
  dayHeadersWrap.className = 'ea-tg-day-headers';

  weekDates.forEach(date => {
    const d = new Date(`${date}T12:00:00`);
    const isToday = date === todayStr;
    const dh = document.createElement('div');
    dh.className = `ea-tg-day-header${isToday ? ' is-today' : ''}`;
    setCleanHTML(dh, `
      <div class="ea-tg-day-name">${capitalize(d.toLocaleDateString('fr-FR', { weekday: 'short' }))}</div>
      <div class="ea-tg-day-num${isToday ? ' today-num' : ''}">${d.getDate()}</div>
    `);
    dayHeadersWrap.appendChild(dh);
  });
  headerRow.appendChild(dayHeadersWrap);
  tg.appendChild(headerRow);

  // 2. Corps de la grille avec Heures et Colonnes
  const body = document.createElement('div');
  body.className = 'ea-tg-body';
  body.style.height = `${totalGridHeight}px`;

  // Colonne des heures
  const timeCol = document.createElement('div');
  timeCol.className = 'ea-tg-times';
  for (let h = START_HOUR; h <= END_HOUR; h++) {
    const slot = document.createElement('div');
    slot.className = 'ea-tg-time-slot';
    slot.style.top = `${(h - START_HOUR) * HOUR_HEIGHT}px`;
    const slotSpan = document.createElement('span');
    slotSpan.textContent = `${String(h).padStart(2, '0')}:00`;
    slot.appendChild(slotSpan);
    timeCol.appendChild(slot);
  }
  body.appendChild(timeCol);

  // Colonnes des jours
  const colsWrap = document.createElement('div');
  colsWrap.className = 'ea-tg-cols';

  weekDates.forEach(date => {
    const isToday = date === todayStr;
    const dayCol = document.createElement('div');
    dayCol.className = `ea-tg-col${isToday ? ' is-today' : ''}`;
    dayCol.setAttribute('data-date', date);

    // Lignes de séparation horizontales
    for (let h = 0; h <= TOTAL_HOURS; h++) {
      const gl = document.createElement('div');
      gl.className = 'ea-tg-gridline';
      gl.style.top = `${h * HOUR_HEIGHT}px`;
      dayCol.appendChild(gl);

      if (h < TOTAL_HOURS) {
        const half = document.createElement('div');
        half.className = 'ea-tg-gridline-half';
        half.style.top = `${h * HOUR_HEIGHT + (HOUR_HEIGHT / 2)}px`;
        dayCol.appendChild(half);
      }
    }

    // Ligne heure actuelle si aujourd'hui
    if (isToday) {
      const now = new Date();
      const curM = (now.getHours() - START_HOUR) * 60 + now.getMinutes();
      if (curM >= 0 && curM <= totalGridHeight) {
        const nowLine = document.createElement('div');
        nowLine.className = 'ea-tg-now-line';
        nowLine.style.top = `${curM * (HOUR_HEIGHT / 60)}px`;
        dayCol.appendChild(nowLine);
      }
    }

    // Événements du jour
    const dayEvs = events.filter(e => e.date === date);
    dayEvs.sort((a, b) => {
      const tA = a.sh * 60 + a.sm;
      const tB = b.sh * 60 + b.sm;
      if (tA !== tB) return tA - tB;
      return (b.eh * 60 + b.em) - (a.eh * 60 + a.em);
    });

    // Détection des chevauchements pour calcul de largeur
    const clusters = [];
    let currentCluster = [];
    let clusterEnd = -1;

    dayEvs.forEach(ev => {
      const startMin = (ev.sh - START_HOUR) * 60 + ev.sm;
      const endMin = (ev.eh - START_HOUR) * 60 + ev.em;
      if (currentCluster.length === 0 || startMin < clusterEnd) {
        currentCluster.push(ev);
        clusterEnd = Math.max(clusterEnd, endMin);
      } else {
        clusters.push(currentCluster);
        currentCluster = [ev];
        clusterEnd = endMin;
      }
    });
    if (currentCluster.length > 0) clusters.push(currentCluster);

    clusters.forEach(cluster => {
      const subCols = [];
      cluster.forEach(ev => {
        const startMin = (ev.sh - START_HOUR) * 60 + ev.sm;
        const endMin = (ev.eh - START_HOUR) * 60 + ev.em;
        let placed = false;
        for (let c = 0; c < subCols.length; c++) {
          if (startMin >= subCols[c]) {
            ev.colIdx = c;
            subCols[c] = endMin;
            placed = true;
            break;
          }
        }
        if (!placed) {
          ev.colIdx = subCols.length;
          subCols.push(endMin);
        }
      });
      cluster.forEach(ev => {
        ev.totalCols = subCols.length;
      });
    });

    // Placement des cartes
    dayEvs.forEach(ev => {
      const startMinutes = (ev.sh - START_HOUR) * 60 + ev.sm;
      const durationMinutes = Math.max(25, (ev.eh - ev.sh) * 60 + (ev.em - ev.sm));
      const top = Math.max(0, startMinutes * (HOUR_HEIGHT / 60));
      const height = Math.max(34, durationMinutes * (HOUR_HEIGHT / 60) - 3);

      const totalCols = ev.totalCols || 1;
      const colIdx = ev.colIdx || 0;
      const widthPercent = 100 / totalCols;
      const leftPercent = colIdx * widthPercent;

      const moodleMatch = findBestMoodleMatch(ev.courseName, ev.displayName);
      ev.moodleMatch = moodleMatch;

      const isDark = portalTheme === 'dark';
      const card = document.createElement('div');
      card.className = 'ea-tg-event';
      card.style.top = `${top}px`;
      card.style.height = `${height}px`;
      card.style.left = `calc(${leftPercent}% + 2px)`;
      card.style.width = `calc(${widthPercent}% - 4px)`;
      card.style.borderLeftColor = ev.color;
      card.style.setProperty('--card-accent', ev.color);
      card.style.setProperty('--card-pastel-bg', hexToRgba(ev.color, isDark ? 0.35 : 0.22));
      card.style.setProperty('--card-pastel-border', hexToRgba(ev.color, isDark ? 0.70 : 0.45));

      const typeBadge = {
        th: '<span class="ea-badge ea-badge-th">TH</span>',
        lab: '<span class="ea-badge ea-badge-lab">LAB</span>',
        auto: '<span class="ea-badge ea-badge-auto">AUTO</span>',
        exam: '<span class="ea-badge ea-badge-exam">EXAM</span>'
      }[ev.parsed?.type] || '';

      const bacBadge = ev.parsed?.year
        ? `<span class="ea-badge ea-badge-bac">${ev.parsed.year}</span>`
        : '';

      const moodleBadge = moodleMatch
        ? `<a href="${moodleMatch.url}" target="_blank" rel="noopener" class="ea-moodle-badge ea-moodle-badge-sm" title="Ouvrir le cours Moodle : ${escapeHtml(moodleMatch.name)}" onclick="event.stopPropagation();">Moodle ↗</a>`
        : '';

      const s = getCourseSetting(ev.courseName);
      const isDirectMoodle = Boolean(s?.directMoodle && moodleMatch);

      card.title = isDirectMoodle
        ? `Cliquer pour ouvrir sur Moodle (${moodleMatch.name})`
        : `${ev.displayName} (cliquer pour options)`;

      setCleanHTML(card, `
        <div class="ea-tg-event-time">${ev.timeText}</div>
        <div class="ea-tg-event-name" title="${ev.displayName}">${ev.displayName}</div>
        ${ev.parsed?.room ? `<div class="ea-tg-event-room" title="Salle ${ev.parsed.room}">${ev.parsed.room}</div>` : ''}
        ${ev.parsed?.prof ? `<div class="ea-tg-event-prof" title="${ev.parsed.prof}">${ev.parsed.prof}</div>` : ''}
        <div class="ea-tg-event-badges">
          ${bacBadge}
          ${typeBadge}
          ${moodleBadge}
        </div>
      `);

      card.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isDirectMoodle) {
          window.open(moodleMatch.url, '_blank');
        } else {
          openCourseQuickDialog(ev);
        }
      });
      dayCol.appendChild(card);
    });

    colsWrap.appendChild(dayCol);
  });

  body.appendChild(colsWrap);
  tg.appendChild(body);
  container.appendChild(tg);
}

// ── Modale d'action rapide sur un cours ──
function openCourseQuickDialog(ev) {
  let modal = document.getElementById('ea-modal');
  if (!modal) {
    modal = document.createElement('dialog');
    modal.id = 'ea-modal';
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.close(); });
  }

  const PASTEL_PALETTE = [
    '#93c5fd', '#c4b5fd', '#86efac', '#fdba74',
    '#f472b6', '#fde047', '#67e8f9', '#fca5a5',
    '#a5b4fc', '#d8b4fe', '#5eead4', '#fed7aa'
  ];

  const moodleMatch = findBestMoodleMatch(ev.courseName, ev.displayName);
  const curSetting = getCourseSetting(ev.courseName) || {};
  const isDirect = Boolean(curSetting.directMoodle);
  let selectedColor = ev.color;

  const moodleList = Object.values(moodleCourses || {}).sort((a, b) => a.name.localeCompare(b.name, 'fr'));

  setCleanHTML(modal, `
    <div class="ea-modal-box">
      <button class="ea-modal-close" id="ea-m-close">&times;</button>
      <div class="ea-modal-header" style="border-left: 4px solid ${ev.color};" id="ea-m-header">
        <div class="ea-modal-name">${escapeHtml(ev.displayName)}</div>
        <div class="ea-modal-sub">
          ${ev.parsed?.year ? `<span class="ea-badge ea-badge-bac">${escapeHtml(ev.parsed.year)}</span>` : ''}
          <span>${escapeHtml(ev.timeText)}</span>
          ${ev.parsed?.room ? `<span>${escapeHtml(ev.parsed.room)}</span>` : ''}
          ${ev.parsed?.prof ? `<span>${escapeHtml(ev.parsed.prof)}</span>` : ''}
        </div>
      </div>

      <!-- Section Intégration Moodle -->
      <div class="ea-modal-moodle-section">
        <div class="ea-moodle-section-title">Cours Moodle associé</div>
        ${moodleMatch ? `
          <div class="ea-moodle-detected">
            <div class="ea-moodle-detected-label">${moodleMatch.isManual ? 'Lien configuré manuellement :' : 'Détection automatique :'}</div>
            <div class="ea-moodle-detected-name">${escapeHtml(moodleMatch.name)}</div>
            <a href="${moodleMatch.url}" target="_blank" rel="noopener" class="ea-btn-moodle-open">Ouvrir le cours sur Moodle ↗</a>
          </div>
        ` : `
          <div class="ea-moodle-detected none">
            <span>Aucun cours Moodle détecté automatiquement pour le moment.</span>
          </div>
        `}
        <div class="ea-moodle-select-row">
          <label class="ea-modal-lbl" for="ea-m-moodle-select">Associer ou modifier le lien Moodle :</label>
          <select id="ea-m-moodle-select" class="ea-modal-select">
            <option value="auto" ${!curSetting.moodleUrl ? 'selected' : ''}>Détection automatique ${moodleMatch && !moodleMatch.isManual ? `(${escapeHtml(moodleMatch.name)})` : ''}</option>
            ${moodleList.map(mc => `
              <option value="${mc.url}" ${curSetting.moodleUrl === mc.url ? 'selected' : ''}>
                ${escapeHtml(mc.name)}
              </option>
            `).join('')}
            <option value="custom" ${curSetting.moodleUrl && !moodleList.some(m => m.url === curSetting.moodleUrl) ? 'selected' : ''}>Saisir une URL personnalisée…</option>
            <option value="none" ${curSetting.moodleUrl === '' ? 'selected' : ''}>Désactiver Moodle pour ce cours</option>
          </select>
          <input type="url" id="ea-m-moodle-custom-url" class="ea-modal-input" placeholder="https://moodle.henallux.be/course/view.php?id=..." value="${curSetting.moodleUrl || ''}">
        </div>
        <label class="ea-modal-check">
          <input type="checkbox" id="ea-m-direct-moodle" ${isDirect ? 'checked' : ''}>
          <span>Ouvrir directement Moodle au clic sur la carte dans l'agenda</span>
        </label>
      </div>

      <!-- Section Couleur Pastel -->
      <div class="ea-modal-body">
        <label class="ea-modal-lbl">Couleur pastel du cours :</label>
        <div class="ea-modal-palette">
          ${PASTEL_PALETTE.map(c => `
            <button type="button" class="ea-m-col-btn ${c.toLowerCase() === ev.color.toLowerCase() ? 'selected' : ''}" style="background:${c};" data-col="${c}" title="${c}"></button>
          `).join('')}
          <input type="color" id="ea-m-color-custom" value="${ev.color}" title="Couleur libre" class="ea-m-col-custom">
        </div>
      </div>

      <div class="ea-modal-actions">
        <button type="button" class="ea-modal-btn ea-btn-save" id="ea-m-save">Enregistrer</button>
        <button type="button" class="ea-modal-btn ea-btn-hide" id="ea-m-hide">Masquer ce cours</button>
      </div>
    </div>
  `);

  modal.querySelector('#ea-m-close').onclick = () => modal.close();

  const selectEl = modal.querySelector('#ea-m-moodle-select');
  const customUrlInput = modal.querySelector('#ea-m-moodle-custom-url');
  const directCb = modal.querySelector('#ea-m-direct-moodle');

  const toggleCustomInput = () => {
    customUrlInput.style.display = selectEl.value === 'custom' ? 'block' : 'none';
  };
  toggleCustomInput();
  selectEl.onchange = toggleCustomInput;

  modal.querySelectorAll('.ea-m-col-btn').forEach(btn => {
    btn.onclick = () => {
      modal.querySelectorAll('.ea-m-col-btn').forEach(b => b.classList.toggle('selected', b === btn));
      selectedColor = btn.dataset.col;
      const hdr = modal.querySelector('#ea-m-header');
      if (hdr) hdr.style.borderLeftColor = selectedColor;
    };
  });

  const customColorInput = modal.querySelector('#ea-m-color-custom');
  if (customColorInput) {
    customColorInput.onchange = (e) => {
      selectedColor = e.target.value;
      modal.querySelectorAll('.ea-m-col-btn').forEach(b => b.classList.remove('selected'));
      const hdr = modal.querySelector('#ea-m-header');
      if (hdr) hdr.style.borderLeftColor = selectedColor;
    };
  }

  modal.querySelector('#ea-m-save').onclick = () => {
    if (!courseSettings[ev.courseName]) courseSettings[ev.courseName] = {};
    courseSettings[ev.courseName].color = selectedColor;
    courseSettings[ev.courseName].directMoodle = directCb.checked;

    const val = selectEl.value;
    if (val === 'auto') {
      delete courseSettings[ev.courseName].moodleUrl;
      delete courseSettings[ev.courseName].moodleName;
    } else if (val === 'none') {
      courseSettings[ev.courseName].moodleUrl = '';
      courseSettings[ev.courseName].moodleName = '';
    } else if (val === 'custom') {
      const u = customUrlInput.value.trim();
      courseSettings[ev.courseName].moodleUrl = u;
      courseSettings[ev.courseName].moodleName = 'Lien personnalisé';
    } else {
      courseSettings[ev.courseName].moodleUrl = val;
      const selOpt = selectEl.options[selectEl.selectedIndex];
      courseSettings[ev.courseName].moodleName = selOpt ? selOpt.textContent.trim() : 'Cours Moodle';
    }

    const base = ev.courseName.replace(/\s*\[\s*BAC\s*[1-3]\s*\]/gi, '').trim();
    if (base !== ev.courseName) {
      if (!courseSettings[base]) courseSettings[base] = {};
      courseSettings[base].color = selectedColor;
      courseSettings[base].directMoodle = courseSettings[ev.courseName].directMoodle;
      courseSettings[base].moodleUrl = courseSettings[ev.courseName].moodleUrl;
      courseSettings[base].moodleName = courseSettings[ev.courseName].moodleName;
    }

    chrome.storage.local.set({ courseSettings }, () => {
      modal.close();
      renderCustomAgenda();
    });
  };

  modal.querySelector('#ea-m-hide').onclick = () => {
    if (!courseSettings[ev.courseName]) courseSettings[ev.courseName] = {};
    courseSettings[ev.courseName].visible = false;

    const base = ev.courseName.replace(/\s*\[\s*BAC\s*[1-3]\s*\]/gi, '').trim();
    if (base !== ev.courseName) {
      if (!courseSettings[base]) courseSettings[base] = {};
      courseSettings[base].visible = false;
    }

    chrome.storage.local.set({ courseSettings }, () => {
      modal.close();
      renderCustomAgenda();
    });
  };

  modal.showModal();
}

// ── Synchronisation Apple Calendar & Export .ics ──
let localSyncDebounce = null;
function triggerSilentLocalSync(events) {
  clearTimeout(localSyncDebounce);
  localSyncDebounce = setTimeout(() => {
    chrome.runtime.sendMessage({ action: 'sync_to_local_server', events }, () => {
      // Ignorer silencieusement si le serveur n'est pas allumé
      if (chrome.runtime.lastError) {}
    });
  }, 1200);
}

function generateClientICS(events) {
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
    const uid = `${ev.date}_${ev.sh}_${ev.sm}_${ev.eh}_${ev.em}_${encodeURIComponent(ev.courseName || '')}@henallux.be`;
    const [y, m, d] = ev.date.split('-');
    const dtStart = `${y}${m}${d}T${String(ev.sh || 0).padStart(2, '0')}${String(ev.sm || 0).padStart(2, '0')}00`;
    const dtEnd = `${y}${m}${d}T${String(ev.eh || 0).padStart(2, '0')}${String(ev.em || 0).padStart(2, '0')}00`;

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${now}`);
    lines.push(`DTSTART;TZID=Europe/Brussels:${dtStart}`);
    lines.push(`DTEND;TZID=Europe/Brussels:${dtEnd}`);
    lines.push(`SUMMARY:${(ev.displayName || ev.courseName || 'Cours').replace(/[,;\\]/g, ' ')}`);
    if (ev.parsed?.prof) lines.push(`DESCRIPTION:Enseignant: ${ev.parsed.prof.replace(/[,;\\]/g, ' ')}`);
    if (ev.parsed?.room) lines.push(`LOCATION:${ev.parsed.room.replace(/[,;\\]/g, ' ')}`);
    lines.push('STATUS:CONFIRMED');
    lines.push('END:VEVENT');
  });

  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

function downloadICS(events) {
  const ics = generateClientICS(events);
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'horaires-henallux.ics';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 500);
}

function openAppleCalendarModal() {
  let modal = document.getElementById('ea-cal-modal');
  if (!modal) {
    modal = document.createElement('dialog');
    modal.id = 'ea-cal-modal';
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.close(); });
  }

  const events = readEventsFromFC();

  chrome.runtime.sendMessage({ action: 'check_local_server_status' }, statusRes => {
    const isOnline = Boolean(statusRes?.ok);

    if (isOnline && events.length > 0) {
      chrome.runtime.sendMessage({ action: 'sync_to_local_server', events }, () => {
        if (chrome.runtime.lastError) {}
      });
    }

    setCleanHTML(modal, `
      <div class="ea-modal-box">
        <button class="ea-modal-close" id="ea-cal-close">&times;</button>
        <div class="ea-modal-header" style="border-left: 4px solid #2563eb;">
          <div class="ea-modal-name"> Synchronisation Apple Calendar</div>
          <div class="ea-modal-sub">
            <span>Horaire Hénallux en temps réel sur Mac, iPhone et iPad</span>
          </div>
        </div>

        <div class="ea-modal-body" style="padding-top: 14px;">
          <div class="ea-cal-status-badge ${isOnline ? 'online' : 'offline'}">
            ${isOnline 
              ? '🟢 Serveur local HTTPS sécurisé (port 8766)' 
              : '⚪ Serveur local hors ligne'}
          </div>

          ${isOnline ? `
            <div style="font-size: 13px; line-height: 1.5; margin: 12px 0;">
              Votre serveur local HTTPS est actif avec un certificat SSL approuvé.
            </div>

            <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 12px;">
              <button type="button" class="ea-modal-btn ea-btn-save" id="ea-cal-subscribe-btn" style="background:#2563eb; text-align:center; justify-content:center; padding: 10px 16px; font-size: 13px;">
                 S'abonner dans Calendrier Apple
              </button>

              <div style="display: flex; gap: 8px; align-items: center; background: rgba(0,0,0,0.06); padding: 8px 12px; border-radius: 8px;">
                <input type="text" id="ea-cal-url-input" readonly value="https://localhost:8766/calendar.ics" style="flex:1; background:transparent; border:none; font-family:monospace; font-size:12px; color:inherit; outline:none;">
                <button type="button" id="ea-cal-copy-btn" class="ea-btn" style="padding:4px 8px; font-size:11px;">Copier</button>
              </div>

              <div style="font-size: 12px; background: rgba(59, 130, 246, 0.12); border: 1px solid rgba(59, 130, 246, 0.3); padding: 8px 12px; border-radius: 6px; margin-top: 6px; line-height: 1.45;">
                💡 <strong>Astuce :</strong><br>
                Dans la fenêtre Calendrier, réglez <strong>Emplacement : Sur mon Mac</strong>.
              </div>
            </div>
          ` : `
            <div style="font-size: 13px; line-height: 1.5; margin: 12px 0;">
              Le mini-serveur d'arrière-plan n'est pas encore démarré sur votre Mac.<br>
              Pour l'activer automatiquement au démarrage :
            </div>
            <div style="background: rgba(0,0,0,0.08); padding: 8px 12px; border-radius: 8px; font-family: monospace; font-size: 12px; margin-bottom: 12px;">
              ./server/install-service.sh
            </div>
            <div style="font-size: 12.5px; margin-bottom: 8px;">
              Vous pouvez aussi télécharger directement le fichier .ics sans serveur :
            </div>
          `}

          <div style="margin-top: 16px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 14px; display: flex; justify-content: flex-end; gap: 10px;">
            <button type="button" class="ea-modal-btn" id="ea-cal-download-btn" style="background: ${isOnline ? '#475569' : '#2563eb'}; color: white;">
              📥 Télécharger le fichier .ics
            </button>
          </div>
        </div>
      </div>
    `);

    modal.querySelector('#ea-cal-close').onclick = () => modal.close();

    const subBtn = modal.querySelector('#ea-cal-subscribe-btn');
    if (subBtn) {
      subBtn.onclick = () => {
        window.location.href = 'webcal://localhost:8766/calendar.ics';
      };
    }

    const copyBtn = modal.querySelector('#ea-cal-copy-btn');
    if (copyBtn) {
      copyBtn.onclick = () => {
        const inp = modal.querySelector('#ea-cal-url-input');
        if (inp) {
          navigator.clipboard.writeText(inp.value);
          copyBtn.textContent = 'Copié !';
          setTimeout(() => { copyBtn.textContent = 'Copier'; }, 2000);
        }
      };
    }

    const dlBtn = modal.querySelector('#ea-cal-download-btn');
    if (dlBtn) {
      dlBtn.onclick = () => {
        downloadICS(events);
      };
    }

    modal.showModal();
  });
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

// ══════════════════════════════════════════════════
//  STYLES GLOBAUX & THEMES (CLAIR & SOMBRE)
// ══════════════════════════════════════════════════

function injectGlobalStyles() {
  let st = document.getElementById('enhancer-global-styles');
  if (!st) {
    st = document.createElement('style');
    st.id = 'enhancer-global-styles';
    document.head.appendChild(st);
  }

  document.body.classList.remove('enhancer-dark', 'enhancer-light');
  document.body.classList.add(portalTheme === 'dark' ? 'enhancer-dark' : 'enhancer-light');

  const isDark = portalTheme === 'dark';

  let css = `
    body {
      background-color: ${isDark ? '#0f172a' : '#f8fafc'} !important;
      color: ${isDark ? '#f8fafc' : '#0f172a'} !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif !important;
      -webkit-font-smoothing: antialiased;
    }

    footer, #footer, #page-footer, .footer, .page-footer {
      display: none !important;
    }
  `;

  if (isPortal) {
    css += getPortalCSS(isDark);
  } else if (isMoodle) {
    css += getMoodleCSS(isDark);
  }

  st.textContent = css;
}

function getPortalCSS(isDark) {
  return `
    /* ══════════════════════════════════════════════════
       PORTAIL HENALLUX — THÈME UNI, ÉPURÉ & MODERNE
       ══════════════════════════════════════════════════ */

    /* Supprimer les balises <hr> au-dessus de Liens et Horaires */
    hr, hr.my-4, hr.my-5, .separator {
      display: none !important;
    }

    /* ── BARRE DE NAVIGATION (MÊME COULEUR QUE LE FOND, SANS BLANC CONTRASTÉ) ── */
    nav,
    nav.fixed-top,
    .navbar,
    #page-header,
    header,
    nav > ul,
    nav ul,
    nav > ul:last-of-type,
    nav > ul:last-child,
    nav ul li,
    nav li,
    nav li:last-child,
    #menu-desktop,
    #menu-desktop li,
    #menu-desktop > li:last-child,
    nav li:has(details),
    nav details {
      background-color: transparent !important;
      background: transparent !important;
      box-shadow: none !important;
    }

    nav.fixed-top, .navbar, #page-header, header {
      background-color: ${isDark ? '#0f172a' : '#f8fafc'} !important;
      border-bottom: 1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0'} !important;
      box-shadow: none !important;
    }
    #menu-desktop li a,
    #logo-mobile li a,
    #menu-mobile li a,
    nav a,
    .navbar a {
      color: ${isDark ? '#cbd5e1' : '#334155'} !important;
      font-weight: 600 !important;
      font-size: 13.5px !important;
      transition: background-color 0.15s, color 0.15s !important;
      border-radius: 6px !important;
      padding: 6px 12px !important;
    }
    #menu-desktop li a:hover,
    #menu-mobile li a:hover,
    nav a:hover,
    .navbar a:hover {
      color: ${isDark ? '#ffffff' : '#0f172a'} !important;
      background-color: ${isDark ? '#1e293b' : '#f1f5f9'} !important;
    }

    /* ── REFONTE COMPLÈTE DES MENUS DÉROULANTS (USER DROPDOWN CENTRÉ) ── */
    nav details,
    details[role="list"],
    details.dropdown {
      position: relative !important;
      display: inline-block !important;
      margin: 0 !important;
      padding: 0 !important;
      border: none !important;
    }

    nav details summary,
    nav details[open] summary,
    details.dropdown summary,
    details.dropdown[open] summary,
    details[role="list"] summary,
    details[role="list"][open] summary {
      background: ${isDark ? '#1e293b' : '#ffffff'} !important;
      color: ${isDark ? '#f8fafc' : '#0f172a'} !important;
      border: 1px solid ${isDark ? 'rgba(255, 255, 255, 0.12)' : '#e2e8f0'} !important;
      border-radius: 8px !important;
      padding: 6px 14px !important;
      font-weight: 600 !important;
      font-size: 13.5px !important;
      cursor: pointer !important;
      outline: none !important;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04) !important;
      transition: all 0.15s ease !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      text-align: center !important;
      gap: 6px !important;
      list-style: none !important;
      user-select: none !important;
      height: auto !important;
    }
    nav details summary::-webkit-details-marker,
    details[role="list"] summary::-webkit-details-marker {
      display: none !important;
    }
    nav details summary:hover,
    nav details[open] summary:hover,
    details.dropdown summary:hover,
    details.dropdown[open] summary:hover {
      background: ${isDark ? '#334155' : '#f1f5f9'} !important;
      border-color: ${isDark ? '#475569' : '#cbd5e1'} !important;
      color: ${isDark ? '#ffffff' : '#0f172a'} !important;
    }

    /* Boîte du menu déroulant (Alignée à droite pour ne pas déborder) */
    nav details ul,
    nav details[role="list"] ul,
    details.dropdown ul,
    details[role="list"] ul {
      background-color: ${isDark ? '#1e293b' : '#ffffff'} !important;
      border: 1px solid ${isDark ? 'rgba(255, 255, 255, 0.1)' : '#e2e8f0'} !important;
      border-radius: 12px !important;
      box-shadow: 0 10px 30px rgba(0, 0, 0, ${isDark ? '0.4' : '0.12'}), 0 4px 6px rgba(0, 0, 0, 0.04) !important;
      padding: 6px !important;
      margin-top: 8px !important;
      min-width: 200px !important;
      position: absolute !important;
      right: 0 !important;
      left: auto !important;
      transform: none !important;
      overflow: hidden !important;
      z-index: 9999 !important;
      list-style: none !important;
      text-align: left !important;
    }

    /* Éléments de la liste déroulante */
    nav details ul li,
    details[role="list"] ul li,
    details.dropdown ul li {
      background: transparent !important;
      padding: 0 !important;
      margin: 0 !important;
      border: none !important;
      list-style: none !important;
      text-align: left !important;
      width: 100% !important;
    }

    nav details ul li a,
    details[role="list"] ul li a,
    details.dropdown ul li a {
      background: transparent !important;
      color: ${isDark ? '#cbd5e1' : '#334155'} !important;
      border-radius: 8px !important;
      padding: 8px 14px !important;
      font-weight: 600 !important;
      font-size: 13px !important;
      display: flex !important;
      align-items: center !important;
      justify-content: flex-start !important;
      text-align: left !important;
      gap: 8px !important;
      text-decoration: none !important;
      transition: background-color 0.15s, color 0.15s !important;
      border: none !important;
      width: 100% !important;
      box-sizing: border-box !important;
    }

    nav details ul li a:hover,
    details[role="list"] ul li a:hover,
    details.dropdown ul li a:hover,
    nav details ul li a:focus,
    details[role="list"] ul li a:focus {
      background-color: ${isDark ? '#334155' : '#f1f5f9'} !important;
      color: ${isDark ? '#ffffff' : '#0f172a'} !important;
    }

    /* Lien déconnexion */
    nav details ul li a[href*="logout"],
    nav details ul li:last-child a {
      color: ${isDark ? '#f87171' : '#dc2626'} !important;
      border-top: 1px solid ${isDark ? 'rgba(255, 255, 255, 0.06)' : '#f1f5f9'} !important;
      border-radius: 0 0 8px 8px !important;
      margin-top: 4px !important;
      justify-content: flex-start !important;
      text-align: left !important;
    }
    nav details ul li a[href*="logout"]:hover,
    nav details ul li:last-child a:hover {
      background-color: ${isDark ? 'rgba(239, 68, 68, 0.15)' : '#fee2e2'} !important;
      color: ${isDark ? '#fca5a5' : '#b91c1c'} !important;
    }

    /* ── TITRES & CONTENEUR PRINCIPAL ── */
    main.container, .container {
      max-width: 1140px !important;
      background-color: transparent !important;
    }
    h1, h2, h3, .heading-title-tools h1 {
      color: ${isDark ? '#f8fafc' : '#0f172a'} !important;
      font-weight: 700 !important;
      letter-spacing: -0.3px !important;
    }

    /* ── SECTION VALVES (ANNONCES PASTEL — BORDURES UNIFORMES) ── */
    .heading-filters-main button, .heading-filters-secondary button, .heading-filters button {
      border-radius: 6px !important;
      font-weight: 600 !important;
      padding: 6px 12px !important;
      font-size: 12px !important;
      cursor: pointer !important;
      transition: all 0.15s !important;
      background-color: ${isDark ? '#1e293b' : '#ffffff'} !important;
      border: 1px solid ${isDark ? '#334155' : '#e2e8f0'} !important;
      color: ${isDark ? '#cbd5e1' : '#475569'} !important;
    }
    .heading-filters-main button:hover, .heading-filters-secondary button:hover, .heading-filters button:hover {
      background-color: ${isDark ? '#334155' : '#f1f5f9'} !important;
      color: ${isDark ? '#ffffff' : '#0f172a'} !important;
    }

    article.announcement button, .announcement button {
      border-radius: 10px !important;
      padding: 12px 16px !important;
      font-weight: 600 !important;
      font-size: 13.5px !important;
      box-shadow: none !important;
      text-align: left !important;
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      transition: border-color 0.15s, transform 0.15s, background-color 0.15s !important;
    }
    article.announcement button.announcement--high {
      background-color: ${isDark ? '#331c23' : '#fff1f2'} !important;
      border: 1.5px solid ${isDark ? '#6b2737' : '#fecdd3'} !important;
      color: ${isDark ? '#fda4af' : '#9f1239'} !important;
    }
    article.announcement button.announcement--normal {
      background-color: ${isDark ? '#17283c' : '#f0f9ff'} !important;
      border: 1.5px solid ${isDark ? '#254a6e' : '#bae6fd'} !important;
      color: ${isDark ? '#7dd3fc' : '#0369a1'} !important;
    }
    article.announcement button:hover, .announcement button:hover {
      transform: translateY(-1px) !important;
    }
    article.announcement button.announcement--high:hover {
      background-color: ${isDark ? '#3d202a' : '#ffe4e6'} !important;
      border-color: ${isDark ? '#9f1239' : '#fca5a5'} !important;
      color: ${isDark ? '#fda4af' : '#9f1239'} !important;
    }
    article.announcement button.announcement--normal:hover {
      background-color: ${isDark ? '#1d3550' : '#e0f2fe'} !important;
      border-color: ${isDark ? '#0284c7' : '#7dd3fc'} !important;
      color: ${isDark ? '#7dd3fc' : '#0369a1'} !important;
    }

    /* ── SECTION LIENS (BOUTONS DE FILTRES PASTEL UNIS) ── */
    button.bookmark--pedagogic {
      background-color: ${isDark ? '#261e38' : '#ede9fe'} !important;
      color: ${isDark ? '#ddd6fe' : '#6d28d9'} !important;
      border: 1px solid ${isDark ? '#4c3e75' : '#ddd6fe'} !important;
      border-radius: 6px !important;
      font-weight: 600 !important;
      padding: 6px 12px !important;
      font-size: 12px !important;
    }
    button.bookmark--infos {
      background-color: ${isDark ? '#17283c' : '#e0f2fe'} !important;
      color: ${isDark ? '#bae6fd' : '#0369a1'} !important;
      border: 1px solid ${isDark ? '#254a6e' : '#bae6fd'} !important;
      border-radius: 6px !important;
      font-weight: 600 !important;
      padding: 6px 12px !important;
      font-size: 12px !important;
    }
    button.bookmark--tools {
      background-color: ${isDark ? '#172d24' : '#dcfce7'} !important;
      color: ${isDark ? '#bbf7d0' : '#15803d'} !important;
      border: 1px solid ${isDark ? '#245640' : '#bbf7d0'} !important;
      border-radius: 6px !important;
      font-weight: 600 !important;
      padding: 6px 12px !important;
      font-size: 12px !important;
    }
    button.bookmark--department {
      background-color: ${isDark ? '#33241b' : '#ffedd5'} !important;
      color: ${isDark ? '#fed7aa' : '#c2410c'} !important;
      border: 1px solid ${isDark ? '#633e28' : '#fed7aa'} !important;
      border-radius: 6px !important;
      font-weight: 600 !important;
      padding: 6px 12px !important;
      font-size: 12px !important;
    }
    button.bookmark--cloud {
      background-color: ${isDark ? '#152c2c' : '#ccfbf1'} !important;
      color: ${isDark ? '#99f6e4' : '#0f766e'} !important;
      border: 1px solid ${isDark ? '#235454' : '#99f6e4'} !important;
      border-radius: 6px !important;
      font-weight: 600 !important;
      padding: 6px 12px !important;
      font-size: 12px !important;
    }

    /* ── TUILES BOOKMARKS INDIVIDUELLES (BORDURES UNIFORMES 1.5PX) ── */
    .bookmark, article.bookmark {
      border-radius: 12px !important;
      padding: 16px !important;
      transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s, background-color 0.15s !important;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04) !important;
      position: relative !important;
    }
    .bookmark:hover, article.bookmark:hover {
      transform: translateY(-2px) !important;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08) !important;
    }

    .bookmark--pedagogic, article.bookmark--pedagogic {
      background-color: ${isDark ? '#231e3d' : '#f5f3ff'} !important;
      border: 1.5px solid ${isDark ? '#4c3e75' : '#ddd6fe'} !important;
    }
    .bookmark--pedagogic:hover, article.bookmark--pedagogic:hover {
      background-color: ${isDark ? '#2e264f' : '#ede9fe'} !important;
      border-color: ${isDark ? '#6b579e' : '#c4b5fd'} !important;
    }

    .bookmark--infos, article.bookmark--infos {
      background-color: ${isDark ? '#17283c' : '#f0f9ff'} !important;
      border: 1.5px solid ${isDark ? '#254a6e' : '#bae6fd'} !important;
    }
    .bookmark--infos:hover, article.bookmark--infos:hover {
      background-color: ${isDark ? '#1d3550' : '#e0f2fe'} !important;
      border-color: ${isDark ? '#38bdf8' : '#7dd3fc'} !important;
    }

    .bookmark--tools, article.bookmark--tools {
      background-color: ${isDark ? '#172d24' : '#f0fdf4'} !important;
      border: 1.5px solid ${isDark ? '#245640' : '#bbf7d0'} !important;
    }
    .bookmark--tools:hover, article.bookmark--tools:hover {
      background-color: ${isDark ? '#1d3b2f' : '#dcfce7'} !important;
      border-color: ${isDark ? '#4ade80' : '#86efac'} !important;
    }

    .bookmark--department, article.bookmark--department {
      background-color: ${isDark ? '#33241b' : '#fff7ed'} !important;
      border: 1.5px solid ${isDark ? '#633e28' : '#fed7aa'} !important;
    }
    .bookmark--department:hover, article.bookmark--department:hover {
      background-color: ${isDark ? '#422e23' : '#ffedd5'} !important;
      border-color: ${isDark ? '#fb923c' : '#fdba74'} !important;
    }

    .bookmark--cloud, article.bookmark--cloud {
      background-color: ${isDark ? '#152c2c' : '#f0fdfa'} !important;
      border: 1.5px solid ${isDark ? '#235454' : '#99f6e4'} !important;
    }
    .bookmark--cloud:hover, article.bookmark--cloud:hover {
      background-color: ${isDark ? '#1d3a3a' : '#ccfbf1'} !important;
      border-color: ${isDark ? '#2dd4bf' : '#5eead4'} !important;
    }

    .bookmark:hover .bookmark-title, article.bookmark:hover .bookmark-title,
    .bookmark:hover a, article.bookmark:hover a {
      color: ${isDark ? '#f8fafc' : '#0f172a'} !important;
    }

    .bookmark-title {
      color: ${isDark ? '#f8fafc' : '#0f172a'} !important;
      font-weight: 700 !important;
      font-size: 14.5px !important;
      text-decoration: none !important;
      line-height: 1.35 !important;
      display: block !important;
    }
    .bookmark-actions {
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      margin-top: 14px !important;
    }
    .bookmark-actions a i {
      color: ${isDark ? '#94a3b8' : '#64748b'} !important;
      font-size: 16px !important;
      transition: color 0.15s !important;
    }
    .bookmark-actions a:hover i {
      color: ${isDark ? '#ffffff' : '#0f172a'} !important;
    }
    .bookmark-actions a i.bi-heart-fill, .bookmark-actions a:has(.bi-heart-fill) i {
      color: #ef4444 !important;
    }

    /* ══════════════════════════════════════════════════
       2. AGENDA (BARRE D'OUTILS & VUES — PASTEL UNI)
       ══════════════════════════════════════════════════ */
    #enhancer-agenda {
      max-width: 1140px;
      margin: 20px auto 40px auto;
      padding: 0 16px;
      font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif;
    }

    .ea-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 16px;
      flex-wrap: wrap;
      padding: 10px 16px;
      border-radius: 10px;
      background-color: ${isDark ? '#1e293b' : '#ffffff'};
      border: 1px solid ${isDark ? '#334155' : '#e2e8f0'};
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
    }

    .ea-nav { display: flex; align-items: center; gap: 6px; }
    .ea-btn {
      padding: 6px 12px;
      border-radius: 6px;
      font-weight: 600;
      font-size: 12.5px;
      cursor: pointer;
      transition: all 0.15s ease;
      background-color: ${isDark ? '#0f172a' : '#f8fafc'};
      border: 1px solid ${isDark ? '#334155' : '#e2e8f0'};
      color: ${isDark ? '#cbd5e1' : '#334155'};
    }
    .ea-btn:hover {
      background-color: ${isDark ? '#334155' : '#e2e8f0'};
      color: ${isDark ? '#ffffff' : '#0f172a'};
    }
    .ea-btn-today {
      background-color: ${isDark ? 'rgba(196, 181, 253, 0.25)' : '#ede9fe'} !important;
      color: ${isDark ? '#ddd6fe' : '#6d28d9'} !important;
      border: 1px solid ${isDark ? 'rgba(196, 181, 253, 0.4)' : '#ddd6fe'} !important;
      font-weight: 700 !important;
    }
    .ea-btn-today:hover {
      background-color: ${isDark ? 'rgba(196, 181, 253, 0.35)' : '#ddd6fe'} !important;
      color: ${isDark ? '#ffffff' : '#5b21b6'} !important;
    }

    .ea-title {
      font-size: 15px;
      font-weight: 700;
      letter-spacing: -0.2px;
      color: ${isDark ? '#f8fafc' : '#0f172a'};
    }

    .ea-bacs, .ea-views {
      display: flex;
      gap: 3px;
      padding: 3px;
      border-radius: 8px;
      background-color: ${isDark ? '#0f172a' : '#f1f5f9'};
    }
    .ea-bac-btn, .ea-vbtn {
      background: transparent;
      border: none;
      color: ${isDark ? '#94a3b8' : '#64748b'};
      padding: 5px 11px;
      font-size: 11.5px;
      font-weight: 600;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .ea-bac-btn:hover, .ea-vbtn:hover {
      color: ${isDark ? '#ffffff' : '#0f172a'};
    }
    .ea-bac-btn.active[data-bac="all"] {
      background-color: ${isDark ? '#334155' : '#ffffff'} !important;
      color: ${isDark ? '#ffffff' : '#0f172a'} !important;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08) !important;
    }
    .ea-bac-btn.active[data-bac="1"] {
      background-color: ${isDark ? '#17283c' : '#e0f2fe'} !important;
      color: ${isDark ? '#bae6fd' : '#0369a1'} !important;
      border: 1px solid ${isDark ? '#254a6e' : '#bae6fd'} !important;
    }
    .ea-bac-btn.active[data-bac="2"] {
      background-color: ${isDark ? '#261e38' : '#ede9fe'} !important;
      color: ${isDark ? '#ddd6fe' : '#6d28d9'} !important;
      border: 1px solid ${isDark ? '#4c3e75' : '#ddd6fe'} !important;
    }
    .ea-bac-btn.active[data-bac="3"] {
      background-color: ${isDark ? '#33241b' : '#ffedd5'} !important;
      color: ${isDark ? '#fed7aa' : '#c2410c'} !important;
      border: 1px solid ${isDark ? '#633e28' : '#fed7aa'} !important;
    }
    .ea-vbtn.active {
      background-color: ${isDark ? '#334155' : '#ffffff'} !important;
      color: ${isDark ? '#ffffff' : '#0f172a'} !important;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08) !important;
    }

    .ea-btn-apple {
      background-color: ${isDark ? 'rgba(59, 130, 246, 0.2)' : '#eff6ff'} !important;
      color: ${isDark ? '#93c5fd' : '#1d4ed8'} !important;
      border: 1px solid ${isDark ? 'rgba(59, 130, 246, 0.4)' : '#bfdbfe'} !important;
      font-weight: 600 !important;
      padding: 5px 12px !important;
      border-radius: 6px !important;
      transition: all 0.15s ease !important;
      cursor: pointer !important;
    }
    .ea-btn-apple:hover {
      background-color: ${isDark ? 'rgba(59, 130, 246, 0.35)' : '#dbeafe'} !important;
      color: ${isDark ? '#ffffff' : '#1e40af'} !important;
      transform: translateY(-1px) !important;
    }

    .ea-cal-status-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
    }
    .ea-cal-status-badge.online {
      background-color: ${isDark ? 'rgba(34, 197, 94, 0.15)' : '#dcfce7'};
      color: ${isDark ? '#4ade80' : '#15803d'};
      border: 1px solid ${isDark ? 'rgba(34, 197, 94, 0.3)' : '#bbf7d0'};
    }
    .ea-cal-status-badge.offline {
      background-color: ${isDark ? 'rgba(148, 163, 184, 0.15)' : '#f1f5f9'};
      color: ${isDark ? '#94a3b8' : '#64748b'};
      border: 1px solid ${isDark ? 'rgba(148, 163, 184, 0.3)' : '#cbd5e1'};
    }

    .ea-container { display: flex; flex-direction: column; gap: 14px; }
    .ea-empty {
      text-align: center;
      color: ${isDark ? '#94a3b8' : '#64748b'};
      font-size: 13px;
      padding: 48px 0;
    }

    /* ── VUE LISTE (PASTEL UNI) ── */
    .ea-day { margin-bottom: 14px; }
    .ea-day-head {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 14px;
      border-radius: 8px;
      margin-bottom: 8px;
      background-color: ${isDark ? '#1e293b' : '#ffffff'};
      border: 1px solid ${isDark ? '#334155' : '#e2e8f0'};
    }
    .ea-day.is-today .ea-day-head {
      border-color: ${isDark ? '#64748b' : '#cbd5e1'};
      background-color: ${isDark ? 'rgba(196, 181, 253, 0.08)' : '#faf8ff'} !important;
    }
    .ea-day-name {
      font-size: 14px;
      font-weight: 700;
      color: ${isDark ? '#f8fafc' : '#0f172a'};
    }
    .ea-day-date {
      font-size: 12px;
      color: ${isDark ? '#94a3b8' : '#64748b'};
      margin-left: auto;
      font-weight: 500;
    }
    .ea-today-badge {
      font-size: 9.5px;
      font-weight: 700;
      background-color: ${isDark ? 'rgba(16, 185, 129, 0.2)' : '#dcfce7'};
      color: ${isDark ? '#6ee7b7' : '#15803d'};
      border: 1px solid ${isDark ? 'rgba(16, 185, 129, 0.35)' : '#bbf7d0'};
      padding: 2px 7px;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    .ea-day-events { display: flex; flex-direction: column; gap: 6px; }

    /* CARTES LISTE — COULEUR PASTEL VISIBLE EN MODE CLAIR & SOMBRE */
    .ea-card {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 10px 14px;
      border-radius: 8px;
      cursor: pointer;
      background-color: var(--card-pastel-bg, ${isDark ? '#1e293b' : '#f1f5f9'}) !important;
      border: 1.5px solid var(--card-pastel-border, ${isDark ? 'rgba(255,255,255,0.12)' : '#cbd5e1'}) !important;
      border-left: 5px solid var(--card-accent, #93c5fd) !important;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
      transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s, filter 0.15s;
    }
    .ea-card:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, ${isDark ? '0.35' : '0.08'});
      border-color: var(--card-accent, #93c5fd) !important;
      filter: brightness(${isDark ? '1.12' : '1.03'});
    }
    .ea-time {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 11.5px;
      font-weight: 700;
      color: ${isDark ? '#f8fafc' : '#0f172a'} !important;
      background-color: ${isDark ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.7)'} !important;
      border: 1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)'} !important;
      padding: 3px 8px;
      border-radius: 6px;
      min-width: 90px;
      text-align: center;
    }
    .ea-info { flex: 1; min-width: 0; }
    .ea-name {
      font-size: 13px;
      font-weight: 700;
      color: ${isDark ? '#f8fafc' : '#0f172a'} !important;
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
      line-height: 1.35;
    }
    .ea-meta {
      font-size: 11.5px;
      color: ${isDark ? '#94a3b8' : '#475569'} !important;
      margin-top: 3px;
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      font-weight: 500;
    }

    /* BADGES PASTEL UNIS */
    .ea-badge {
      font-size: 9px;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 4px;
      background-color: ${isDark ? '#0f172a' : '#f1f5f9'};
      color: ${isDark ? '#cbd5e1' : '#475569'};
      border: 1px solid ${isDark ? '#334155' : '#e2e8f0'};
    }
    .ea-badge-bac {
      background-color: ${isDark ? '#261e38' : '#ede9fe'};
      color: ${isDark ? '#ddd6fe' : '#6d28d9'};
      border: 1px solid ${isDark ? '#4c3e75' : '#ddd6fe'};
      font-weight: 700;
    }
    .ea-badge-th {
      background-color: ${isDark ? '#17283c' : '#e0f2fe'};
      color: ${isDark ? '#bae6fd' : '#0369a1'};
      border: 1px solid ${isDark ? '#254a6e' : '#bae6fd'};
    }
    .ea-badge-lab {
      background-color: ${isDark ? '#33241b' : '#ffedd5'};
      color: ${isDark ? '#fed7aa' : '#c2410c'};
      border: 1px solid ${isDark ? '#633e28' : '#fed7aa'};
    }
    .ea-badge-auto {
      background-color: ${isDark ? '#172d24' : '#dcfce7'};
      color: ${isDark ? '#bbf7d0' : '#15803d'};
      border: 1px solid ${isDark ? '#245640' : '#bbf7d0'};
    }
    .ea-badge-exam {
      background-color: ${isDark ? '#331c23' : '#ffe4e6'};
      color: ${isDark ? '#fda4af' : '#be123c'};
      border: 1px solid ${isDark ? '#6b2737' : '#fecdd3'};
    }

    /* ══════════════════════════════════════════════════
       3. VUE SEMAINE — GRILLE HORAIRE PASTEL UNIE
       ══════════════════════════════════════════════════ */
    .ea-timegrid {
      background-color: ${isDark ? '#1e293b' : '#ffffff'};
      border: 1px solid ${isDark ? '#334155' : '#e2e8f0'};
      border-radius: 10px;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
    }
    .ea-tg-header-row {
      display: flex;
      background-color: ${isDark ? '#0f172a' : '#f8fafc'};
      border-bottom: 1px solid ${isDark ? '#334155' : '#e2e8f0'};
      position: sticky;
      top: 0;
      z-index: 20;
    }
    .ea-tg-corner {
      width: 55px;
      flex-shrink: 0;
      border-right: 1px solid ${isDark ? '#334155' : '#e2e8f0'};
    }
    .ea-tg-day-headers {
      display: flex;
      flex: 1;
    }
    .ea-tg-day-header {
      flex: 1;
      padding: 8px 4px;
      text-align: center;
      border-right: 1px solid ${isDark ? '#334155' : '#e2e8f0'};
    }
    .ea-tg-day-header:last-child {
      border-right: none;
    }
    .ea-tg-day-header.is-today {
      background-color: ${isDark ? '#172033' : '#f5f3ff'};
    }
    .ea-tg-day-name {
      font-size: 10.5px;
      font-weight: 600;
      color: ${isDark ? '#94a3b8' : '#64748b'};
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .ea-tg-day-num {
      font-size: 14px;
      font-weight: 700;
      color: ${isDark ? '#f8fafc' : '#0f172a'};
      margin-top: 2px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .ea-tg-day-header.is-today .ea-tg-day-num {
      background-color: #818cf8;
      color: #ffffff;
      border-radius: 50%;
      width: 22px;
      height: 22px;
    }

    .ea-tg-body {
      display: flex;
      position: relative;
      overflow-y: auto;
      max-height: 720px;
    }
    .ea-tg-times {
      width: 55px;
      flex-shrink: 0;
      position: relative;
      border-right: 1px solid ${isDark ? '#334155' : '#e2e8f0'};
      background-color: ${isDark ? '#0f172a' : '#f8fafc'};
    }
    .ea-tg-time-slot {
      position: absolute;
      left: 0;
      right: 6px;
      transform: translateY(-50%);
      text-align: right;
      font-size: 10.5px;
      font-weight: 500;
      color: ${isDark ? '#94a3b8' : '#64748b'};
      user-select: none;
    }
    .ea-tg-cols {
      display: flex;
      flex: 1;
      position: relative;
    }
    .ea-tg-col {
      flex: 1;
      position: relative;
      border-right: 1px solid ${isDark ? '#334155' : '#e2e8f0'};
      background-color: ${isDark ? '#1e293b' : '#ffffff'};
    }
    .ea-tg-col:last-child {
      border-right: none;
    }
    .ea-tg-col.is-today {
      background-color: ${isDark ? '#172033' : '#faf8ff'};
    }
    .ea-tg-gridline {
      position: absolute;
      left: 0;
      right: 0;
      height: 1px;
      background-color: ${isDark ? '#2d3748' : '#f1f5f9'};
      pointer-events: none;
    }
    .ea-tg-gridline-half {
      position: absolute;
      left: 0;
      right: 0;
      height: 1px;
      border-top: 1px dashed ${isDark ? '#1f2937' : '#f8fafc'};
      pointer-events: none;
    }
    .ea-tg-now-line {
      position: absolute;
      left: 0;
      right: 0;
      height: 2px;
      background-color: #ef4444;
      z-index: 15;
      pointer-events: none;
    }
    .ea-tg-now-line::before {
      content: '';
      position: absolute;
      left: -3px;
      top: -2.5px;
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background-color: #ef4444;
    }

    /* Cartes de cours dans la grille — COULEUR PASTEL VISIBLE EN MODE CLAIR & SOMBRE */
    .ea-tg-event {
      position: absolute;
      border-radius: 7px;
      padding: 5px 7px;
      cursor: pointer;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
      z-index: 5;
      display: flex;
      flex-direction: column;
      gap: 2px;
      background-color: var(--card-pastel-bg, ${isDark ? '#1e293b' : '#f1f5f9'}) !important;
      border: 1.5px solid var(--card-pastel-border, ${isDark ? 'rgba(255,255,255,0.12)' : '#cbd5e1'}) !important;
      border-left: 4px solid var(--card-accent, #93c5fd) !important;
      transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s, filter 0.15s;
    }
    .ea-tg-event:hover {
      z-index: 30;
      transform: scale(1.01);
      box-shadow: 0 4px 14px rgba(0, 0, 0, ${isDark ? '0.4' : '0.12'});
      border-color: var(--card-accent, #93c5fd) !important;
      filter: brightness(${isDark ? '1.12' : '1.03'});
    }
    .ea-tg-event-time {
      font-size: 9.5px;
      font-weight: 700;
      color: ${isDark ? '#cbd5e1' : '#1e293b'};
      line-height: 1.2;
    }
    .ea-tg-event-name {
      font-size: 11px;
      font-weight: 700;
      color: ${isDark ? '#f8fafc' : '#0f172a'} !important;
      line-height: 1.25;
      overflow: hidden;
      text-overflow: ellipsis;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }
    .ea-tg-event-room {
      font-size: 9.5px;
      color: ${isDark ? '#94a3b8' : '#334155'};
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .ea-tg-event-prof {
      font-size: 9px;
      color: ${isDark ? '#64748b' : '#475569'};
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-weight: 500;
    }
    .ea-tg-event-badges {
      display: flex;
      gap: 2px;
      margin-top: auto;
    }

    /* ── MODALE INTERACTIVE ÉPURÉE ── */
    #ea-modal {
      border: none;
      background: transparent;
      padding: 0;
      max-width: 400px;
      width: 90vw;
    }
    #ea-modal::backdrop {
      background: rgba(15, 23, 42, 0.4);
    }
    .ea-modal-box {
      background-color: ${isDark ? '#1e293b' : '#ffffff'};
      color: ${isDark ? '#f8fafc' : '#0f172a'};
      border: 1px solid ${isDark ? '#334155' : '#e2e8f0'};
      border-radius: 12px;
      padding: 18px;
      position: relative;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
    }
    .ea-modal-close {
      position: absolute;
      top: 14px;
      right: 14px;
      background-color: ${isDark ? '#0f172a' : '#f1f5f9'};
      border: 1px solid ${isDark ? '#334155' : '#e2e8f0'};
      color: ${isDark ? '#94a3b8' : '#64748b'};
      width: 26px;
      height: 26px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s;
    }
    .ea-modal-close:hover {
      background-color: ${isDark ? '#ef4444' : '#fee2e2'};
      color: ${isDark ? '#ffffff' : '#b91c1c'};
      border-color: transparent;
    }
    .ea-modal-header {
      padding-left: 10px;
      margin-bottom: 14px;
    }
    .ea-modal-name {
      font-size: 15px;
      font-weight: 700;
      line-height: 1.3;
      margin-bottom: 4px;
    }
    .ea-modal-sub {
      font-size: 11.5px;
      color: ${isDark ? '#94a3b8' : '#64748b'};
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    .ea-modal-body {
      margin-bottom: 16px;
      background-color: ${isDark ? '#0f172a' : '#f8fafc'};
      padding: 12px;
      border-radius: 8px;
      border: 1px solid ${isDark ? '#334155' : '#e2e8f0'};
    }
    .ea-modal-lbl {
      display: block;
      font-size: 11px;
      font-weight: 600;
      color: ${isDark ? '#cbd5e1' : '#475569'};
      margin-bottom: 8px;
    }
    .ea-modal-palette {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    .ea-m-col-btn {
      width: 24px;
      height: 24px;
      border-radius: 6px;
      border: 1px solid rgba(0, 0, 0, 0.1);
      cursor: pointer;
      transition: transform 0.15s;
    }
    .ea-m-col-btn:hover {
      transform: scale(1.15);
    }
    .ea-m-col-btn.selected {
      border: 2px solid ${isDark ? '#ffffff' : '#0f172a'};
      transform: scale(1.1);
    }
    .ea-m-col-custom {
      width: 24px;
      height: 24px;
      border-radius: 6px;
      border: 1px solid ${isDark ? '#334155' : '#cbd5e1'};
      cursor: pointer;
      background: transparent;
      padding: 0;
    }
    .ea-modal-actions {
      display: flex;
      gap: 8px;
    }
    .ea-modal-btn {
      flex: 1;
      padding: 8px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
      border: 1px solid transparent;
    }
    .ea-btn-hide {
      background-color: ${isDark ? '#334155' : '#f1f5f9'};
      color: ${isDark ? '#f8fafc' : '#475569'};
      border: 1px solid ${isDark ? '#475569' : '#e2e8f0'};
    }
    .ea-btn-hide:hover {
      background-color: #fee2e2;
      color: #b91c1c;
      border-color: #fca5a5;
    }
    .ea-btn-save {
      background-color: ${isDark ? '#4338ca' : '#4f46e5'} !important;
      color: #ffffff !important;
      border: 1px solid ${isDark ? '#4f46e5' : '#4338ca'} !important;
    }
    .ea-btn-save:hover {
      background-color: ${isDark ? '#3730a3' : '#4338ca'} !important;
    }

    /* ── BADGES & BOUTONS MOODLE SUR CARTES DE COURS ── */
    .ea-moodle-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      font-weight: 700;
      color: #ea580c !important;
      background-color: ${isDark ? '#382214' : '#fff7ed'} !important;
      border: 1px solid ${isDark ? '#7c3a1d' : '#fed7aa'} !important;
      border-radius: 6px;
      padding: 2px 8px;
      text-decoration: none !important;
      transition: all 0.15s ease;
      margin-left: auto;
      white-space: nowrap;
      cursor: pointer;
    }
    .ea-moodle-badge:hover {
      background-color: #ea580c !important;
      color: #ffffff !important;
      border-color: #ea580c !important;
      transform: scale(1.05);
      box-shadow: 0 2px 6px rgba(234, 88, 12, 0.25);
    }
    .ea-moodle-badge-sm {
      font-size: 9px;
      padding: 1px 5px;
      margin-left: 0;
    }
    .ea-card-gear {
      font-size: 13px;
      color: ${isDark ? '#94a3b8' : '#64748b'};
      padding: 4px;
      border-radius: 4px;
      cursor: pointer;
      opacity: 0.65;
      transition: opacity 0.15s, transform 0.15s;
      user-select: none;
    }
    .ea-card-gear:hover {
      opacity: 1;
      transform: rotate(35deg);
    }

    /* ── SECTION MODALE MOODLE & CONTRÔLES ── */
    .ea-modal-moodle-section {
      margin-bottom: 14px;
      background-color: ${isDark ? '#0f172a' : '#f8fafc'};
      padding: 12px;
      border-radius: 8px;
      border: 1px solid ${isDark ? '#334155' : '#e2e8f0'};
    }
    .ea-moodle-section-title {
      font-size: 12px;
      font-weight: 700;
      color: ${isDark ? '#f8fafc' : '#0f172a'};
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .ea-moodle-detected {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 8px 10px;
      background-color: ${isDark ? '#1e293b' : '#ffffff'};
      border: 1px solid ${isDark ? '#334155' : '#e2e8f0'};
      border-radius: 6px;
      margin-bottom: 10px;
    }
    .ea-moodle-detected.none {
      color: ${isDark ? '#94a3b8' : '#64748b'};
      font-size: 11.5px;
      font-style: italic;
    }
    .ea-moodle-detected-label {
      font-size: 10px;
      color: ${isDark ? '#94a3b8' : '#64748b'};
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .ea-moodle-detected-name {
      font-size: 12.5px;
      color: ${isDark ? '#f8fafc' : '#0f172a'};
      font-weight: 700;
      word-break: break-word;
    }
    .ea-btn-moodle-open {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      margin-top: 6px;
      padding: 6px 12px;
      border-radius: 6px;
      background-color: #ea580c !important;
      color: #ffffff !important;
      font-size: 12px;
      font-weight: 600;
      text-decoration: none !important;
      transition: background-color 0.15s, transform 0.15s;
      cursor: pointer;
    }
    .ea-btn-moodle-open:hover {
      background-color: #c2410c !important;
      transform: translateY(-1px);
    }
    .ea-moodle-select-row {
      margin-top: 6px;
    }
    .ea-modal-select, .ea-modal-input {
      width: 100%;
      box-sizing: border-box;
      padding: 7px 10px;
      border-radius: 6px;
      font-size: 12px;
      font-family: inherit;
      background-color: ${isDark ? '#1e293b' : '#ffffff'};
      color: ${isDark ? '#f8fafc' : '#0f172a'};
      border: 1px solid ${isDark ? '#334155' : '#cbd5e1'};
      margin-top: 5px;
      outline: none;
    }
    .ea-modal-select:focus, .ea-modal-input:focus {
      border-color: #818cf8;
    }
    .ea-modal-check {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 11.5px;
      font-weight: 500;
      color: ${isDark ? '#cbd5e1' : '#334155'};
      margin-top: 10px;
      cursor: pointer;
    }
    .ea-modal-check input {
      cursor: pointer;
    }
  `;
}

function getMoodleCSS(isDark) {
  return `
    /* ══════════════════════════════════════════════════
       MOODLE — BARRE DE RECHERCHE SUBLIME EN-DESSOUS
       ══════════════════════════════════════════════════ */
    #page-header .d-flex.align-items-center:has(h1),
    #page-header .d-flex:has(.header-actions-container),
    #page-header .d-flex:has(.simplesearchform),
    #page-header .d-flex:has(.input-group),
    #page-header .d-flex:has(input[placeholder*="cours" i]),
    .ea-moodle-header-col {
      display: flex !important;
      flex-direction: column !important;
      align-items: flex-start !important;
      justify-content: flex-start !important;
      flex-wrap: wrap !important;
      width: 100% !important;
    }

    #page-header .header-actions-container,
    #page-header .simplesearchform,
    #page-header form[action*="course/search.php"],
    #page-header form.simplesearchform,
    .ea-moodle-search-wrap {
      margin: 14px 0 16px 0 !important;
      padding: 0 !important;
      width: 100% !important;
      max-width: 440px !important;
      display: block !important;
      background: transparent !important;
      border: none !important;
      box-shadow: none !important;
    }

    /* Le conteneur unifié / capsule de la barre de recherche */
    #page-header .input-group,
    .ea-moodle-search-wrap .input-group,
    .ea-moodle-input-group {
      display: flex !important;
      flex-direction: row !important;
      align-items: center !important;
      flex-wrap: nowrap !important;
      width: 100% !important;
      max-width: 440px !important;
      height: 44px !important;
      min-height: 44px !important;
      background-color: ${isDark ? '#1e293b' : '#ffffff'} !important;
      border: none !important;
      border-radius: 10px !important;
      padding: 4px 5px 4px 14px !important;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06) !important;
      transition: box-shadow 0.15s !important;
      box-sizing: border-box !important;
      overflow: hidden !important;
      position: relative !important;
    }

    #page-header .input-group:focus-within,
    .ea-moodle-search-wrap .input-group:focus-within,
    .ea-moodle-input-group:focus-within {
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.22), 0 2px 8px rgba(0, 0, 0, 0.08) !important;
    }

    /* Le champ texte de saisie */
    #page-header .input-group input,
    #page-header .input-group .form-control,
    .ea-moodle-search-wrap input,
    .ea-moodle-input-group input {
      flex: 1 1 auto !important;
      width: 100% !important;
      height: 100% !important;
      min-width: 0 !important;
      background: transparent !important;
      border: none !important;
      outline: none !important;
      box-shadow: none !important;
      padding: 0 !important;
      margin: 0 !important;
      font-size: 13.5px !important;
      font-weight: 500 !important;
      color: ${isDark ? '#f8fafc' : '#0f172a'} !important;
      line-height: normal !important;
    }

    #page-header .input-group input::placeholder,
    .ea-moodle-search-wrap input::placeholder {
      color: ${isDark ? '#64748b' : '#94a3b8'} !important;
      opacity: 1 !important;
      font-size: 13.5px !important;
    }

    /* L'append / conteneur de bouton */
    #page-header .input-group-append,
    .ea-moodle-search-wrap .input-group-append,
    .ea-moodle-input-group .input-group-append {
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      margin: 0 !important;
      padding: 0 !important;
      flex-shrink: 0 !important;
      height: 100% !important;
    }

    /* Le bouton avec la loupe */
    #page-header .input-group .btn,
    #page-header .input-group button,
    .ea-moodle-search-wrap button,
    .ea-moodle-input-group button {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      height: 34px !important;
      min-width: 36px !important;
      padding: 0 12px !important;
      border-radius: 7px !important;
      background-color: #3b82f6 !important;
      border: none !important;
      color: #ffffff !important;
      font-size: 13px !important;
      cursor: pointer !important;
      transition: background-color 0.15s, transform 0.15s !important;
      box-shadow: none !important;
      margin: 0 !important;
    }

    #page-header .input-group .btn:hover,
    #page-header .input-group button:hover,
    .ea-moodle-search-wrap button:hover {
      background-color: #2563eb !important;
      transform: scale(1.02) !important;
    }

    #page-header .input-group .btn i,
    #page-header .input-group button i {
      color: #ffffff !important;
      font-size: 13px !important;
      margin: 0 !important;
    }

    #page-header .input-group .btn-clear,
    #page-header .input-group label.sr-only {
      display: none !important;
    }

    /* ══════════════════════════════════════════════════
       MOODLE — THÈME ÉPURÉ ET SANS ENCADREMENTS
       ══════════════════════════════════════════════════ */
    /* Fond & Structure Générale */
    body[id*="page-"],
    #page-wrapper,
    #page,
    #page-content {
      background-color: ${isDark ? '#0f172a' : '#f8fafc'} !important;
      color: ${isDark ? '#f8fafc' : '#0f172a'} !important;
      border: none !important;
    }

    /* Barre de Navigation Moodle */
    .navbar.fixed-top,
    nav.navbar,
    .navbar-bootswatch,
    #header.navbar {
      background-color: ${isDark ? '#0f172a' : '#f8fafc'} !important;
      border: none !important;
      border-bottom: 1px solid ${isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)'} !important;
      box-shadow: none !important;
      padding: 8px 16px !important;
    }

    .navbar .site-name,
    .navbar .navbar-brand {
      color: ${isDark ? '#f8fafc' : '#0f172a'} !important;
      font-weight: 700 !important;
      font-size: 16px !important;
      letter-spacing: -0.3px !important;
    }

    .navbar .nav-link,
    .navbar a.nav-link {
      color: ${isDark ? '#cbd5e1' : '#334155'} !important;
      font-weight: 600 !important;
      font-size: 13.5px !important;
      border-radius: 6px !important;
      padding: 6px 12px !important;
      transition: background-color 0.15s, color 0.15s !important;
      border: none !important;
    }

    .navbar .nav-link:hover,
    .navbar a.nav-link:hover {
      color: ${isDark ? '#ffffff' : '#0f172a'} !important;
      background-color: ${isDark ? '#1e293b' : '#f1f5f9'} !important;
    }

    [data-action="toggle-drawer"],
    .navbar button.btn {
      background-color: ${isDark ? '#1e293b' : '#ffffff'} !important;
      border: none !important;
      border-radius: 8px !important;
      color: ${isDark ? '#cbd5e1' : '#475569'} !important;
      padding: 6px 10px !important;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04) !important;
    }

    [data-action="toggle-drawer"]:hover,
    .navbar button.btn:hover {
      background-color: ${isDark ? '#334155' : '#f1f5f9'} !important;
      color: ${isDark ? '#ffffff' : '#0f172a'} !important;
    }

    /* Menu Latéral / Drawer */
    #nav-drawer,
    [data-region="drawer"],
    .drawer {
      background-color: ${isDark ? '#0f172a' : '#f8fafc'} !important;
      border: none !important;
      box-shadow: none !important;
    }

    #nav-drawer .list-group-item,
    [data-region="drawer"] .drawer-item,
    .draweritem {
      background-color: transparent !important;
      color: ${isDark ? '#cbd5e1' : '#334155'} !important;
      font-weight: 500 !important;
      font-size: 13.5px !important;
      border-radius: 8px !important;
      margin: 3px 8px !important;
      border: none !important;
      transition: background-color 0.15s, color 0.15s !important;
    }

    #nav-drawer .list-group-item:hover,
    [data-region="drawer"] .drawer-item:hover {
      background-color: ${isDark ? '#1e293b' : '#f1f5f9'} !important;
      color: ${isDark ? '#ffffff' : '#0f172a'} !important;
    }

    #nav-drawer .list-group-item.active,
    [data-region="drawer"] .drawer-item.active,
    [data-region="drawer"] .drawer-item[aria-current="true"] {
      background-color: ${isDark ? '#261e38' : '#ede9fe'} !important;
      color: ${isDark ? '#ddd6fe' : '#6d28d9'} !important;
      border: none !important;
      font-weight: 700 !important;
    }

    /* En-tête Moodle */
    #page-header {
      background: transparent !important;
      border: none !important;
      padding-top: 14px !important;
      padding-bottom: 6px !important;
    }

    #page-header h1,
    .page-header-headings h1 {
      color: ${isDark ? '#f8fafc' : '#0f172a'} !important;
      font-weight: 700 !important;
      font-size: 24px !important;
      letter-spacing: -0.3px !important;
      border: none !important;
    }

    .breadcrumb {
      background-color: transparent !important;
      padding: 4px 0 10px 0 !important;
      margin: 0 !important;
      font-size: 12.5px !important;
      border: none !important;
    }

    .breadcrumb-item a {
      color: ${isDark ? '#94a3b8' : '#64748b'} !important;
      text-decoration: none !important;
      font-weight: 500 !important;
    }

    .breadcrumb-item a:hover {
      color: #3b82f6 !important;
    }

    .breadcrumb-item.active {
      color: ${isDark ? '#f8fafc' : '#0f172a'} !important;
      font-weight: 600 !important;
    }

    /* SUPPRESSION DU FOND BLANC SUR LA PAGE & CONTENEURS (SAUF DANS LES COURS) */
    #page.bg-white,
    #page-wrapper.bg-white,
    #page .bg-white:not(.course-card):not([data-region="card-deck"] .card):not(.dashboard-card):not(.section):not(.card-body),
    #page-wrapper .bg-white:not(.course-card):not([data-region="card-deck"] .card):not(.dashboard-card):not(.section):not(.card-body),
    #page-wrapper,
    #page,
    #page-content,
    #region-main-box,
    #region-main,
    .region-main,
    .block-region,
    .block,
    .block_myoverview,
    .block_myoverview .card,
    .block_myoverview .card-body,
    [data-region="myoverview"],
    .block_recentlyaccessedcourses,
    .block_recentlyaccessedcourses .card,
    .block_recentlyaccessedcourses .card-body,
    .card:not(.course-card):not([data-region="card-deck"] .card):not(.dashboard-card):not(.section) {
      background-color: transparent !important;
      background: transparent !important;
      border: none !important;
      border-top: none !important;
      border-bottom: none !important;
      border-left: none !important;
      border-right: none !important;
      box-shadow: none !important;
    }

    #region-main {
      padding: 0 !important;
    }

    .block_myoverview .card-body {
      padding-left: 0 !important;
      padding-right: 0 !important;
    }

    /* SUPPRESSION RADICALE DE TOUS LES ENCADREMENTS GRIS CLAIR (BOOTSTRAP & MOODLE) */
    .border,
    .border-top,
    .border-bottom,
    .border-left,
    .border-right,
    .border-secondary,
    .border-light,
    .border-0,
    .border-1,
    .card-header,
    .card-footer,
    .block .card-title,
    .card-title {
      border: none !important;
      border-top: none !important;
      border-bottom: none !important;
      border-left: none !important;
      border-right: none !important;
      box-shadow: none !important;
      background-color: transparent !important;
      color: ${isDark ? '#f8fafc' : '#0f172a'} !important;
    }

    /* CARTES DE COURS (CONSERVÉES EN BLANC AVEC OMBRE DOUCE ET SANS ENCADREMENT) */
    .dashboard-card,
    [data-region="card-deck"] .card,
    .block_recentlyaccessedcourses .card.course-card,
    .course-card {
      border-radius: 12px !important;
      overflow: hidden !important;
      transition: transform 0.15s ease, box-shadow 0.15s ease !important;
      border: none !important;
      border-top: none !important;
      border-bottom: none !important;
      border-left: none !important;
      border-right: none !important;
      background-color: ${isDark ? '#1e293b' : '#ffffff'} !important;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05) !important;
    }

    .dashboard-card .card-body,
    [data-region="card-deck"] .card .card-body,
    .course-card .card-body,
    .dashboard-card .card-footer,
    .course-card .card-footer {
      background-color: ${isDark ? '#1e293b' : '#ffffff'} !important;
      border: none !important;
      border-top: none !important;
    }

    .dashboard-card:hover,
    [data-region="card-deck"] .card:hover,
    .course-card:hover {
      transform: translateY(-2px) !important;
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.08) !important;
      border: none !important;
    }

    .dashboard-card .coursename,
    [data-region="card-deck"] .coursename,
    .block_recentlyaccessedcourses .coursename,
    .dashboard-card .coursename a {
      font-weight: 700 !important;
      font-size: 14px !important;
      color: ${isDark ? '#f8fafc' : '#0f172a'} !important;
      text-decoration: none !important;
      line-height: 1.35 !important;
    }

    .dashboard-card .coursename a:hover {
      color: #3b82f6 !important;
    }

    .dashboard-card-img,
    .card-img-top,
    .course-card .card-img-top {
      border-radius: 12px 12px 0 0 !important;
      border: none !important;
    }

    /* BARRE DE RECHERCHE DANS LA VUE D'ENSEMBLE (SANS BORDURE GRISE) */
    .block_myoverview .search-widget,
    .block_myoverview input.form-control,
    .block_myoverview input[data-action="search-input"],
    .block_myoverview [data-region="search-input-group"] input,
    [data-region="myoverview"] input.form-control,
    [data-region="myoverview"] input {
      border: none !important;
      outline: none !important;
      background-color: ${isDark ? '#1e293b' : '#ffffff'} !important;
      color: ${isDark ? '#f8fafc' : '#0f172a'} !important;
      border-radius: 8px !important;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04) !important;
      font-size: 13px !important;
      padding: 7px 14px !important;
      height: auto !important;
    }

    .block_myoverview [data-region="search-input-group"],
    .block_myoverview .input-group,
    .block_myoverview .input-group-prepend,
    .block_myoverview .input-group-append,
    .block_myoverview .input-group-text {
      border: none !important;
      background: transparent !important;
      box-shadow: none !important;
    }

    /* FILTRES ET BOUTONS DE LA VUE D'ENSEMBLE (SANS BORDURE GRISE) */
    .custom-select,
    select.form-control,
    .block_myoverview button.btn,
    .block_myoverview .btn-outline-secondary,
    .block_myoverview .dropdown-toggle,
    [data-region="myoverview"] button,
    [data-region="myoverview"] .btn {
      border-radius: 8px !important;
      border: none !important;
      background-color: ${isDark ? '#1e293b' : '#ffffff'} !important;
      color: ${isDark ? '#cbd5e1' : '#334155'} !important;
      font-weight: 600 !important;
      font-size: 12.5px !important;
      padding: 7px 14px !important;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04) !important;
      transition: background-color 0.15s, color 0.15s !important;
    }

    .block_myoverview .btn-outline-secondary:hover,
    .block_myoverview .dropdown-toggle:hover,
    .block_myoverview button.btn:hover,
    [data-region="myoverview"] button:hover {
      background-color: ${isDark ? '#334155' : '#f1f5f9'} !important;
      color: ${isDark ? '#ffffff' : '#0f172a'} !important;
      border: none !important;
    }

    /* Barres de progression */
    .progress {
      height: 6px !important;
      border-radius: 6px !important;
      background-color: ${isDark ? '#334155' : '#e2e8f0'} !important;
      border: none !important;
    }

    .progress-bar {
      background-color: #818cf8 !important;
      border-radius: 6px !important;
      border: none !important;
    }

    /* Menu Déroulant Utilisateur Moodle */
    .usermenu .dropdown-menu,
    .dropdown-menu {
      background-color: ${isDark ? '#1e293b' : '#ffffff'} !important;
      border: none !important;
      border-radius: 12px !important;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.12) !important;
      padding: 6px !important;
    }

    .dropdown-item {
      color: ${isDark ? '#cbd5e1' : '#334155'} !important;
      font-weight: 600 !important;
      font-size: 13px !important;
      border-radius: 8px !important;
      padding: 8px 14px !important;
      transition: background-color 0.15s, color 0.15s !important;
      border: none !important;
    }

    .dropdown-item:hover {
      background-color: ${isDark ? '#334155' : '#f1f5f9'} !important;
      color: ${isDark ? '#ffffff' : '#0f172a'} !important;
    }

    /* Sections et Activités au sein des cours sans encadrement */
    .course-content ul.topics li.section,
    .course-content ul.weeks li.section,
    .course-content li.section.main {
      background-color: ${isDark ? '#1e293b' : '#ffffff'} !important;
      border: none !important;
      border-radius: 12px !important;
      padding: 18px !important;
      margin-bottom: 16px !important;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04) !important;
    }

    .sectionname,
    .section-title {
      font-weight: 700 !important;
      font-size: 16px !important;
      color: ${isDark ? '#f8fafc' : '#0f172a'} !important;
      margin-bottom: 12px !important;
      border: none !important;
    }

    .activityinstance,
    .activity {
      border-radius: 8px !important;
      padding: 6px 10px !important;
      transition: background-color 0.15s !important;
      border: none !important;
    }

    .activityinstance:hover,
    .activity:hover {
      background-color: ${isDark ? '#334155' : '#f1f5f9'} !important;
    }

    .activityinstance a {
      color: ${isDark ? '#cbd5e1' : '#334155'} !important;
      font-weight: 600 !important;
      text-decoration: none !important;
      border: none !important;
    }

    .activityinstance a:hover {
      color: #3b82f6 !important;
    }
  `;
}
