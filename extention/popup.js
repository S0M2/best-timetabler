// ═══════════════════════════════════════════════════
//  BEST TIMETABLER — popup.js
//  Popup minimaliste : Sélection, Tri BAC & Couleurs
// ═══════════════════════════════════════════════════

// Palette de couleurs pastel douces, harmonieuses et distinctes
const PASTEL_COLORS = [
  '#93c5fd', // Bleu ciel pastel
  '#c4b5fd', // Lavande pastel
  '#86efac', // Menthe pastel
  '#fdba74', // Pêche pastel
  '#f472b6', // Rose pastel
  '#fde047', // Citron doux pastel
  '#67e8f9', // Cyan pastel
  '#fca5a5', // Corail pastel
  '#a5b4fc', // Pervenche pastel
  '#d8b4fe', // Orchidée pastel
  '#5eead4', // Turquoise pastel
  '#fed7aa', // Abricot pastel
  '#bbf7d0', // Sauge pastel
  '#e9d5ff', // Lilas pastel
  '#fbcfe8', // Guimauve pastel
  '#cbd5e1'  // Ardoise douce
];

let enabled = true;
let portalTheme = 'light';
let courseSettings = {};
let knownCourses = [];
let moodleCourses = {};
let activeBac = 'all';
let searchQuery = '';
let saveTimeout = null;

document.addEventListener('DOMContentLoaded', () => {
  initStorage();
  bindEvents();
});

// ── Storage & Initialization ──
function initStorage() {
  chrome.storage.local.get(['courseSettings', 'knownCourses', 'extensionEnabled', 'portalTheme', 'moodleCourses'], res => {
    if (chrome.runtime.lastError) return;
    courseSettings = res.courseSettings || {};
    knownCourses = res.knownCourses || [];
    moodleCourses = res.moodleCourses || {};
    enabled = res.extensionEnabled !== false;
    portalTheme = res.portalTheme || 'light';

    // Nettoyer les cours Moodle qui ont pu être enregistrés par erreur dans knownCourses
    if (moodleCourses && Object.keys(moodleCourses).length > 0) {
      const moodleNames = new Set();
      Object.values(moodleCourses).forEach(m => {
        if (m.name) {
          moodleNames.add(m.name.trim().toLowerCase());
          moodleNames.add(cleanDisplayName(m.name).toLowerCase());
        }
      });
      const prevLen = knownCourses.length;
      knownCourses = knownCourses.filter(c => {
        const cLower = c.trim().toLowerCase();
        const cClean = cleanDisplayName(c).toLowerCase();
        return !moodleNames.has(cLower) && !moodleNames.has(cClean);
      });
      if (knownCourses.length !== prevLen) {
        save(true);
      }
    }

    document.getElementById('masterToggle').checked = enabled;
    updateThemeBtn();

    // Assigner des couleurs automatiques distinctes aux cours qui n'en ont pas
    ensureDistinctColors();

    render();
    syncFromTab();
  });
}

function updateThemeBtn() {
  const btn = document.getElementById('themeToggle');
  if (!btn) return;
  btn.replaceChildren();

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');

  if (portalTheme === 'dark') {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z');
    svg.appendChild(path);
  } else {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', '12');
    circle.setAttribute('cy', '12');
    circle.setAttribute('r', '5');
    svg.appendChild(circle);

    const lines = [
      [12, 1, 12, 3], [12, 21, 12, 23], [4.22, 4.22, 5.64, 5.64],
      [18.36, 18.36, 19.78, 19.78], [1, 12, 3, 12], [21, 12, 23, 12],
      [4.22, 19.78, 5.64, 18.36], [18.36, 5.64, 19.78, 4.22]
    ];
    lines.forEach(([x1, y1, x2, y2]) => {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(x1));
      line.setAttribute('y1', String(y1));
      line.setAttribute('x2', String(x2));
      line.setAttribute('y2', String(y2));
      svg.appendChild(line);
    });
  }

  btn.appendChild(svg);
  btn.title = portalTheme === 'dark' ? 'Mode Sombre actif (cliquer pour Mode Clair)' : 'Mode Clair actif (cliquer pour Mode Sombre)';
}

function syncFromTab() {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (!tabs[0]?.id) return;
    const url = tabs[0].url || '';
    if (!url.includes('portail.henallux.be')) return; // PORTAIL UNIQUEMENT
    chrome.tabs.sendMessage(tabs[0].id, { action: 'get_courses' }, res => {
      if (chrome.runtime.lastError || !res?.courses) return;
      let added = false;
      res.courses.forEach(c => {
        if (!knownCourses.includes(c)) {
          knownCourses.push(c);
          added = true;
        }
      });
      if (added) {
        ensureDistinctColors();
        save(true);
        render();
      }
    });
  });
}

// ── Helpers de détection BAC & Normalisation ──
function getBac(courseName) {
  if (!courseName) return null;
  const m1 = courseName.match(/\[\s*BAC\s*([1-3])\s*\]/i);
  if (m1) return m1[1];
  const m2 = courseName.match(/\b(?:BAC|BLOC)\s*([1-3])\b/i);
  if (m2) return m2[1];
  const m3 = courseName.match(/(?:IE-)?[A-Z]{2,4}-([1-3])B\b/i);
  if (m3) return m3[1];
  const m4 = courseName.match(/(?:IE-)?[A-Z]{2,4}-B([1-3])\b/i);
  if (m4) return m4[1];
  return null;
}

function cleanDisplayName(name) {
  if (!name) return '';
  return name.replace(/\s*\[\s*BAC\s*[1-3]\s*\]/gi, '').trim();
}

function ensureDistinctColors() {
  let colorIdx = 0;
  knownCourses.forEach(name => {
    if (!courseSettings[name]) courseSettings[name] = {};
    if (!courseSettings[name].color) {
      courseSettings[name].color = PASTEL_COLORS[colorIdx % PASTEL_COLORS.length];
      colorIdx++;
    }
  });
}

// ── Événements UI ──
function bindEvents() {
  // Toggle thème Clair / Sombre
  document.getElementById('themeToggle')?.addEventListener('click', () => {
    portalTheme = portalTheme === 'light' ? 'dark' : 'light';
    updateThemeBtn();
    save();
  });

  // Toggle principal
  document.getElementById('masterToggle').addEventListener('change', e => {
    enabled = e.target.checked;
    save();
  });

  // Filtre BAC (Tous, BAC 1, BAC 2, BAC 3)
  document.querySelectorAll('.bac-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeBac = btn.dataset.bac;
      document.querySelectorAll('.bac-btn').forEach(b => b.classList.toggle('active', b === btn));
      render();
    });
  });

  // Recherche
  document.getElementById('searchInput').addEventListener('input', e => {
    searchQuery = e.target.value.toLowerCase().trim();
    render();
  });

  // Tout cocher
  document.getElementById('btnSelectAll').addEventListener('click', () => {
    getFilteredCourses().forEach(name => {
      if (!courseSettings[name]) courseSettings[name] = {};
      courseSettings[name].visible = true;
    });
    render();
    save();
  });

  // Tout décocher
  document.getElementById('btnDeselectAll').addEventListener('click', () => {
    getFilteredCourses().forEach(name => {
      if (!courseSettings[name]) courseSettings[name] = {};
      courseSettings[name].visible = false;
    });
    render();
    save();
  });

  // Redistribuer des couleurs pastel à chaque cours
  document.getElementById('btnAutoColors').addEventListener('click', () => {
    const list = getFilteredCourses();
    const targets = (list.length > 0 && activeBac !== 'all') ? list : knownCourses;
    targets.forEach((name, i) => {
      if (!courseSettings[name]) courseSettings[name] = {};
      courseSettings[name].color = PASTEL_COLORS[i % PASTEL_COLORS.length];
    });
    render();
    save();
  });

  // Abonnement Apple Calendar
  document.getElementById('btnAppleCal')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'check_local_server_status' }, res => {
      if (res?.ok) {
        chrome.tabs.create({ url: 'webcal://localhost:8766/calendar.ics' });
      } else {
        alert("Serveur local Best Timetabler non détecté.\n\nLancez le script ./server/install-service.sh sur votre Mac pour activer la synchronisation continue.");
      }
    });
  });
}

// ── Filtrage et Rendu de la Liste ──
function getFilteredCourses() {
  return knownCourses
    .filter(name => {
      const bac = getBac(name);
      if (activeBac !== 'all' && bac !== activeBac) return false;
      if (searchQuery && !name.toLowerCase().includes(searchQuery)) return false;
      return true;
    })
    .sort((a, b) => {
      // Tri par BAC (1, 2, 3, autre), puis alphabétique
      const bacA = getBac(a) || '9';
      const bacB = getBac(b) || '9';
      if (bacA !== bacB) return bacA.localeCompare(bacB);
      return cleanDisplayName(a).localeCompare(cleanDisplayName(b), 'fr');
    });
}

function render() {
  const container = document.getElementById('courseList');
  container.textContent = '';

  const filtered = getFilteredCourses();

  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = knownCourses.length === 0
      ? 'Ouvrez votre agenda sur le portail pour charger vos cours.'
      : 'Aucun cours ne correspond à votre filtre.';
    container.appendChild(empty);
    updateCount(0, 0);
    return;
  }

  let visibleCount = 0;

  filtered.forEach(name => {
    const s = courseSettings[name] || {};
    const isVisible = s.visible !== false;
    const color = s.color || PASTEL_COLORS[0];
    const bac = getBac(name);
    const displayName = cleanDisplayName(name);

    if (isVisible) visibleCount++;

    const item = document.createElement('div');
    item.className = `course-item${isVisible ? '' : ' disabled'}`;

    // 1. Checkbox
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'course-cb';
    cb.checked = isVisible;
    cb.title = isVisible ? 'Cours activé' : 'Cours masqué';
    cb.addEventListener('change', () => {
      if (!courseSettings[name]) courseSettings[name] = {};
      courseSettings[name].visible = cb.checked;
      item.classList.toggle('disabled', !cb.checked);
      updateCount(filtered.filter(n => courseSettings[n]?.visible !== false).length, filtered.length);
      save();
    });

    // 2. Swatch interactif (avec input color natif invisible)
    const swatchWrap = document.createElement('label');
    swatchWrap.className = 'swatch-wrap';
    swatchWrap.title = 'Changer la couleur';

    const colorPicker = document.createElement('input');
    colorPicker.type = 'color';
    colorPicker.className = 'swatch-input';
    colorPicker.value = color.startsWith('#') && color.length === 7 ? color : '#93c5fd';

    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.style.background = color;

    colorPicker.addEventListener('input', () => {
      const newCol = colorPicker.value;
      swatch.style.background = newCol;
      if (!courseSettings[name]) courseSettings[name] = {};
      courseSettings[name].color = newCol;
      save();
    });

    swatchWrap.append(colorPicker, swatch);

    // 3. Nom du cours
    const nameSpan = document.createElement('span');
    nameSpan.className = 'course-name';
    nameSpan.textContent = displayName;
    nameSpan.title = name;

    // 4. Lien Moodle (si configuré ou détecté)
    let moodleLink = null;
    const moodleTarget = s.moodleUrl || (moodleCourses[name]?.url);
    if (moodleTarget) {
      moodleLink = document.createElement('a');
      moodleLink.href = moodleTarget;
      moodleLink.target = '_blank';
      moodleLink.className = 'course-moodle-link';
      moodleLink.title = `Ouvrir ${s.moodleName || displayName} sur Moodle`;
      moodleLink.textContent = 'Moodle';
      moodleLink.onclick = (e) => e.stopPropagation();
    }

    // 5. Badge BAC
    const badge = document.createElement('span');
    badge.className = `course-badge ${bac ? 'badge-bac-' + bac : 'badge-bac-other'}`;
    badge.textContent = bac ? `BAC ${bac}` : 'Autre';

    // 6. Bouton de suppression
    const delBtn = document.createElement('button');
    delBtn.className = 'course-del-btn';
    delBtn.title = 'Supprimer ce cours de la liste';
    delBtn.textContent = '×';
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      knownCourses = knownCourses.filter(n => n !== name);
      delete courseSettings[name];
      save(true);
      render();
    });

    item.append(cb, swatchWrap, nameSpan);
    if (moodleLink) item.append(moodleLink);
    item.append(badge, delBtn);
    container.appendChild(item);
  });

  updateCount(visibleCount, filtered.length);
}

function updateCount(selected, total) {
  const countEl = document.getElementById('courseCount');
  if (countEl) countEl.textContent = `${selected}/${total} cours activés`;
}

// ── Sauvegarde automatique debounced ──
function save(silent = false) {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    chrome.storage.local.set({
      courseSettings,
      knownCourses,
      extensionEnabled: enabled,
      portalTheme
    }, () => {
      // Envoyer les réglages à l'onglet actif
      chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: 'apply_settings',
            settings: courseSettings,
            enabled,
            portalTheme
          });
        }
      });

      if (!silent) {
        const st = document.getElementById('saveStatus');
        if (st) {
          st.textContent = 'Sauvegardé';
          st.style.opacity = '1';
          setTimeout(() => { st.style.opacity = '0.7'; }, 1500);
        }
      }
    });
  }, 250);
}
