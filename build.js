#!/usr/bin/env node

/**
 * ══════════════════════════════════════════════════════════════
 *  Script Node.js de build XPI pour Firefox Add-ons (AMO)
 *  Usage : node build.js
 * ══════════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = __dirname;
const extDir = path.join(rootDir, 'extention');
const distDir = path.join(rootDir, 'dist');
const manifestPath = path.join(extDir, 'manifest.json');

if (!fs.existsSync(manifestPath)) {
  console.error(`❌ Erreur : manifest.json introuvable dans ${extDir}`);
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const version = manifest.version || '1.0.0';
const xpiName = `best-timetabler-v${version}.xpi`;
const zipName = `best-timetabler-v${version}.zip`;
const xpiPath = path.join(distDir, xpiName);
const zipPath = path.join(distDir, zipName);
const latestPath = path.join(distDir, 'best-timetabler-latest.xpi');

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

console.log(`📦 Création du paquet Best Timetabler v${version}...`);

// Suppression des anciens paquets
[xpiPath, zipPath, latestPath].forEach(f => {
  if (fs.existsSync(f)) fs.unlinkSync(f);
});

// Nettoyage des .DS_Store
try {
  execSync(`find "${extDir}" -name ".DS_Store" -delete 2>/dev/null || true`);
} catch (e) {}

// Empaquetage avec zip
try {
  const zipCmd = `cd "${extDir}" && zip -r -FS -q "${xpiPath}" . -x "*.DS_Store*" "*__MACOSX*" "*.git*" "*.swp" "*~" "Thumbs.db"`;
  execSync(zipCmd, { stdio: 'inherit' });

  // Créer une copie .zip et latest.xpi
  fs.copyFileSync(xpiPath, zipPath);
  fs.copyFileSync(xpiPath, latestPath);

  const stats = fs.statSync(xpiPath);
  const sizeKb = (stats.size / 1024).toFixed(1);

  console.log('\n✅ Paquet XPI généré avec succès !');
  console.log('──────────────────────────────────────────────');
  console.log(`📁 Fichier .xpi : ${xpiPath} (${sizeKb} KB)`);
  console.log(`📁 Fichier .zip : ${zipPath}`);
  console.log(`📁 Lien latest  : ${latestPath}`);
  console.log('──────────────────────────────────────────────\n');

  console.log('📋 Contenu du fichier .xpi :');
  execSync(`unzip -l "${xpiPath}"`, { stdio: 'inherit' });

  console.log('\n🚀 Pour publier sur Mozilla Add-ons (AMO) :');
  console.log('   1. Rendez-vous sur : https://addons.mozilla.org/fr/developers/addon/submit/upload-listed');
  console.log(`   2. Uploadez le fichier : dist/${xpiName}`);
  console.log('   3. Mozilla validera automatiquement l\'extension.\n');

} catch (err) {
  console.error('❌ Erreur lors de la compression :', err.message);
  process.exit(1);
}
