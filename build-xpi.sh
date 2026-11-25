#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════
#  Script de création du paquet .xpi pour Mozilla Firefox (AMO)
# ══════════════════════════════════════════════════════════════

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXT_DIR="${SCRIPT_DIR}/extention"
DIST_DIR="${SCRIPT_DIR}/dist"

if [ ! -d "${EXT_DIR}" ]; then
  echo "❌ Erreur : Dossier 'extention' introuvable dans ${SCRIPT_DIR}"
  exit 1
fi

if [ ! -f "${EXT_DIR}/manifest.json" ]; then
  echo "❌ Erreur : manifest.json introuvable dans ${EXT_DIR}"
  exit 1
fi

# 1. Récupération de la version depuis manifest.json
VERSION=$(node -e "console.log(require('${EXT_DIR}/manifest.json').version || '1.0.0')")
XPI_NAME="best-timetabler-v${VERSION}.xpi"
ZIP_NAME="best-timetabler-v${VERSION}.zip"

echo "📦 Préparation du paquet Best Timetabler v${VERSION}..."

# 2. Création du dossier dist
mkdir -p "${DIST_DIR}"
rm -f "${DIST_DIR}/${XPI_NAME}" "${DIST_DIR}/${ZIP_NAME}" "${DIST_DIR}/best-timetabler-latest.xpi"

# 3. Nettoyage des fichiers temporaires / .DS_Store
find "${EXT_DIR}" -name ".DS_Store" -delete 2>/dev/null || true

# 4. Création de l'archive .xpi (zip sans compression bizarre, manifest.json à la racine)
cd "${EXT_DIR}"
zip -r -FS -q "${DIST_DIR}/${XPI_NAME}" . \
  -x "*.DS_Store*" \
  -x "*__MACOSX*" \
  -x "*.git*" \
  -x "*.swp" \
  -x "*~" \
  -x "Thumbs.db"

# 5. Création d'une copie .zip (compatible Chrome / Edge) et d'un alias latest.xpi
cp "${DIST_DIR}/${XPI_NAME}" "${DIST_DIR}/${ZIP_NAME}"
cp "${DIST_DIR}/${XPI_NAME}" "${DIST_DIR}/best-timetabler-latest.xpi"

FILE_SIZE=$(du -h "${DIST_DIR}/${XPI_NAME}" | cut -f1)

echo ""
echo "✅ Paquet XPI généré avec succès !"
echo "──────────────────────────────────────────────"
echo "📁 Fichier .xpi : ${DIST_DIR}/${XPI_NAME} (${FILE_SIZE})"
echo "📁 Fichier .zip : ${DIST_DIR}/${ZIP_NAME}"
echo "📁 Lien latest  : ${DIST_DIR}/best-timetabler-latest.xpi"
echo "──────────────────────────────────────────────"
echo ""
echo "📋 Contenu de l'archive :"
unzip -l "${DIST_DIR}/${XPI_NAME}"
echo ""
echo "🚀 Pour publier sur Firefox Add-ons (AMO) :"
echo "   1. Rendez-vous sur : https://addons.mozilla.org/fr/developers/addon/submit/upload-listed"
echo "   2. Uploadez le fichier : dist/${XPI_NAME}"
echo "   3. Mozilla validera automatiquement le manifest et le contenu."
