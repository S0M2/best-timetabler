# 🎓 Best Timetabler (Portail & Moodle Henallux)

Extension pour navigateur et serveur local de synchronisation de calendrier (iCalendar / Webcal) pour les étudiants de l'**HENALLUX**.

---

## 📁 Structure du Projet

```text
portail-henallux/
├── extention/                  # Code source de l'extension WebExtension (Firefox / Chromium)
│   ├── manifest.json           # Manifest v2 (AMO compatible)
│   ├── background.js           # Service d'arrière-plan (proxy de synchronisation)
│   ├── content.js              # Script d'injection, customisation UI et export
│   ├── popup.html / popup.js   # Interface utilisateur du popup
│   ├── styles.css              # Thème clair/sombre, couleurs pastel et retouches CSS
│   └── icons/                  # Icônes de l'extension
├── server/                     # Serveur local de synchronisation de calendrier
│   ├── server.js               # Serveur Node.js natif (zéro dépendance, HTTP & HTTPS)
│   ├── install-service.sh      # Script d'installation automatique pour macOS (LaunchAgent)
│   ├── uninstall-service.sh    # Script de désinstallation macOS
│   ├── start-windows.bat       # Script de démarrage rapide pour Windows
│   └── README.md               # Guide complet d'installation et de configuration calendrier
├── build.js                    # Script de packaging automatique du paquet .xpi et .zip
├── build-xpi.sh                # Script bash d'empaquetage AMO
└── .gitignore                  # Fichiers ignorés (certificats SSL locaux, logs, données personnelles)
```

---

## ✨ Fonctionnalités Principales

### 1. Extension Navigateur (`extention/`)
- **Sélection des cours** : Cochez/décochez les cours que vous souhaitez voir dans votre agenda et sur Moodle.
- **Tri par année (BAC 1, BAC 2, BAC 3)** : Vos cours sont automatiquement analysés et classés par promotion avec des filtres rapides `Tous`, `BAC 1`, `BAC 2`, `BAC 3`.
- **Couleurs pastel et mode sombre** : Thème sombre moderne avec teintes pastel lisibles et contrastées.
- **Export & Synchronisation Apple Calendar** : Export ICS direct ou synchronisation automatique avec le serveur local.

### 2. Serveur Local Webcal (`server/`)
- **Ultra-léger** : Moins de 20 Mo de RAM et ~25 Ko d'espace disque.
- **Zéro dépendance externe** : Fonctionne directement avec Node.js natif.
- **Rétention 6 mois** : Nettoyage et purge automatique des cours de plus de 6 mois.
- **Support Apple Calendar & ATS** : Support HTTPS natif avec certificats SSL locaux auto-générés.

---

## 🚀 Démarrage Rapide

### 1. Installer l'extension
1. Ouvrez `about:debugging` (Firefox) ou `chrome://extensions/` (Chrome / Brave / Edge).
2. Chargez le dossier `extention/`.

### 2. Lancer le serveur de calendrier
Consultez le guide dédié dans [`server/README.md`](./server/README.md) pour les instructions détaillées selon votre OS :
- **macOS** : `./server/install-service.sh`
- **Windows** : `./server/start-windows.bat`
- **Linux** : `node server/server.js` (ou service systemd)

---

## 📦 Build AMO / Extension

Pour générer le paquet `.xpi` prêt pour Firefox Add-ons :
```bash
node build.js
```
Le fichier sera généré dans le dossier `dist/`.
