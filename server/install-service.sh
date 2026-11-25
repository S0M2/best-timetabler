#!/bin/bash
# Best Timetabler — Installation du service macOS d'arrière-plan

PLIST_NAME="be.henallux.best-timetabler.plist"
TARGET_DIR="$HOME/Library/LaunchAgents"
TARGET_PLIST="$TARGET_DIR/$PLIST_NAME"
NODE_BIN="$(which node)"
SCRIPT_PATH="$(cd "$(dirname "$0")" && pwd)/server.js"
LOG_PATH="$(cd "$(dirname "$0")" && pwd)/server.log"

if [ -z "$NODE_BIN" ]; then
  NODE_BIN="/opt/homebrew/bin/node"
fi

mkdir -p "$TARGET_DIR"

# Décharger au cas où il existe déjà
launchctl unload "$TARGET_PLIST" 2>/dev/null

cat <<EOF > "$TARGET_PLIST"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>be.henallux.best-timetabler</string>
    <key>ProgramArguments</key>
    <array>
        <string>$NODE_BIN</string>
        <string>$SCRIPT_PATH</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$LOG_PATH</string>
    <key>StandardErrorPath</key>
    <string>$LOG_PATH</string>
</dict>
</plist>
EOF

# Assurer la présence des certificats SSL locaux
if [ ! -f "$(dirname "$0")/cert.pem" ]; then
  echo "Génération des certificats SSL..."
  node "$SCRIPT_PATH" --setup-only 2>/dev/null || true
fi

# Faire confiance au certificat sur macOS si nécessaire
if [ -f "$(dirname "$0")/cert.pem" ]; then
  security add-trusted-cert -d -r trustRoot -k "$HOME/Library/Keychains/login.keychain-db" "$(dirname "$0")/cert.pem" 2>/dev/null || true
fi

launchctl load "$TARGET_PLIST"

echo "✅ Service macOS Best Timetabler installé et démarré !"
echo "👉 URL HTTPS (Apple Calendar / macOS) : https://localhost:8766/calendar.ics"
echo "👉 URL HTTP  (Autres clients locaux) : http://localhost:8765/calendar.ics"
echo "👉 Status : https://localhost:8766/api/status"
