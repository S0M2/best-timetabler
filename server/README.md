# 📅 Best Timetabler — Serveur Local de Synchronisation iCalendar (Webcal)

Ce serveur local ultra-léger permet de synchroniser automatiquement l'emploi du temps de l'extension **Best Timetabler** avec votre application de calendrier préférée (**Apple Calendrier**, **Google Calendar**, **Outlook**, etc.).

---

## ⚡ 1. Spécifications : RAM, Espace Disque & Rétention

Le serveur a été conçu pour être **invisible et extrêmement frugal** sur votre système :

- **Mémoire Vive (RAM)** : **~18 à 25 Mo** seulement au repos (processus Node.js natif sans framework lourd).
- **Espace Disque** : **Moins de 50 Ko** en fonctionnement !
  - **Zéro dépendance externe** (`node_modules` inutile) : utilise uniquement les modules natifs de Node.js (`http`, `https`, `crypto`, `fs`).
  - Fichiers générés : `events.json` (~10 Ko) et `calendar.ics` (~12 Ko).
- **Rétention d'historique (Max 6 mois)** :
  - **Purge automatique** : les cours plus anciens que **6 mois** par rapport au jour actuel sont automatiquement supprimés.
  - La purge s'exécute automatiquement :
    1. Au démarrage du serveur.
    2. À chaque synchronisation envoyée par l'extension.
    3. Une fois toutes les 24 heures en tâche de fond.

---

## 💻 2. Installation sur n'importe quel PC

### Prérequis commun (Tous OS)
Assurez-vous d'avoir **Node.js** installé (version 16 ou supérieure recommandée) :
- Télécharger sur le site officiel : [nodejs.org](https://nodejs.org/) (prendre la version LTS).
- Pour vérifier dans un terminal / invite de commande :
  ```bash
  node -v
  ```

---

### 🍏 A. Installation sur macOS (Automatique en arrière-plan)

Sur macOS, Apple Calendar impose une connexion **HTTPS locale sécurisée**. Le script d'installation configure tout automatiquement (certificat SSL local + démarrage automatique au boot).

1. Ouvrez l'application **Terminal**.
2. Rendez-vous dans le dossier `server` :
   ```bash
   cd "/chemin/vers/portail-henallux/server"
   ```
3. Rendez le script exécutable et lancez-le :
   ```bash
   chmod +x install-service.sh uninstall-service.sh
   ./install-service.sh
   ```
4. Le service est désormais actif et redémarrera automatiquement même après un redémarrage du Mac !
   - **Pour désinstaller le service** : `./uninstall-service.sh`
   - **Pour consulter les logs** : `cat server.log`

---

### 🪟 B. Installation sur Windows

1. Rendez-vous dans le dossier `server`.
2. Double-cliquez sur `start-windows.bat`.
   - Une fenêtre s'ouvre et confirme le démarrage sur les ports `8765` (HTTP) et `8766` (HTTPS).
3. **Pour lancer le serveur automatiquement au démarrage de Windows (optionnel)** :
   - Appuyez sur `Touche Windows + R`.
   - Tapez `shell:startup` et validez (cela ouvre le dossier de démarrage).
   - Faites un clic droit > *Nouveau* > *Raccourci* vers le fichier `start-windows.bat`.

---

### 🐧 C. Installation sur Linux (systemd utilisateur)

1. Créez le dossier systemd utilisateur s'il n'existe pas :
   ```bash
   mkdir -p ~/.config/systemd/user
   ```
2. Créez le fichier de service `~/.config/systemd/user/best-timetabler.service` :
   ```ini
   [Unit]
   Description=Best Timetabler Local Calendar Server
   After=network.target

   [Service]
   Type=simple
   WorkingDirectory=/chemin/vers/portail-henallux/server
   ExecStart=/usr/bin/node server.js
   Restart=on-failure

   [Install]
   WantedBy=default.target
   ```
3. Activez et démarrez le service :
   ```bash
   systemctl --user daemon-reload
   systemctl --user enable --now best-timetabler
   ```

---

## 📲 3. Comment s'abonner dans Apple Calendrier (macOS)

1. Ouvrez l'application **Calendrier** sur votre Mac.
2. Dans la barre des menus en haut, cliquez sur **Fichier** > **Nouvel abonnement à un calendrier…** (ou raccourci `Option + Commande + S`).
3. Dans le champ URL, collez l'adresse suivante :
   ```text
   https://localhost:8766/calendar.ics
   ```
4. Cliquez sur **S'abonner**.
5. Dans la fenêtre de réglages qui s'ouvre :
   - **Nom** : *Emploi du temps Henallux* (ou le nom de votre choix).
   - **Emplacement** : **Sur mon Mac** *(⚠️ TRÈS IMPORTANT : ne choisissez pas "iCloud", car les serveurs Apple en ligne ne peuvent pas contacter votre ordinateur en localhost).*
   - **Actualiser** : Choisissez **Toutes les 15 minutes** ou **Toutes les heures**.
   - Cochez ou décochez les alertes selon votre préférence.
6. Cliquez sur **OK**. Vos cours apparaissent instantanément !

---

## 🔄 4. Comment fonctionne la synchronisation avec l'extension ?

1. Dès que vous naviguez sur votre portail Henallux, l'extension détecte vos cours.
2. En tâche de fond, l'extension envoie silencieusement la liste de vos cours à l'adresse locale `https://localhost:8766/api/sync` (ou `http://127.0.0.1:8765/api/sync`).
3. Le serveur :
   - Conserve vos cours à venir.
   - Purge les événements de plus de 6 mois.
   - Génère instantanément le flux `calendar.ics`.
4. Apple Calendrier interroge l'URL à intervalle régulier et met à jour votre emploi du temps sans aucune intervention manuelle.

---

## 🩺 5. Vérifier l'état et la santé du serveur

Vous pouvez à tout moment inspecter la santé du serveur et la consommation de mémoire en ouvrant cette adresse dans votre navigateur ou via curl :

👉 **[https://localhost:8766/api/status](https://localhost:8766/api/status)**

Exemple de réponse :
```json
{
  "status": "running",
  "eventsCount": 29,
  "retentionMonths": 6,
  "cutoffDate": "2026-05-25",
  "storage": {
    "eventsJsonKB": 10.5,
    "calendarIcsKB": 12.2,
    "totalKB": 22.7
  },
  "memory": {
    "rssMB": 18.4,
    "heapUsedMB": 5.6
  },
  "endpoints": {
    "http": "http://localhost:8765/calendar.ics",
    "https": "https://localhost:8766/calendar.ics",
    "webcal": "webcal://localhost:8766/calendar.ics"
  }
}
```
