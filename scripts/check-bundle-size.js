const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Targets live in config/bundle-baseline.json so this reporter and
// scripts/bundle-ratchet.js can never disagree about the goal (VER-02).
const config = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'config', 'bundle-baseline.json'), 'utf8')
);

const LABELS = {
  'dist/vninvestchart.iife.js': 'IIFE Bundle',
  'dist/index.js': 'ESM Bundle',
  'dist/index.cjs': 'CJS Bundle',
  'dist/iframe-host/host-entry.js': 'iframe-host ESM',
};

const BUNDLE_LIMITS = Object.entries(config.targets).map(([p, maxSizeKB]) => ({
  path: p,
  maxSizeKB,
  label: LABELS[p] || p,
}));

function getGzipSize(filePath) {
  const content = fs.readFileSync(filePath);
  return zlib.gzipSync(content).length;
}

function formatBytes(bytes) {
  return (bytes / 1024).toFixed(2) + ' KB';
}

console.log('📦 Bundle Size Check\n');

let hasErrors = false;

for (const bundle of BUNDLE_LIMITS) {
  const fullPath = path.join(__dirname, '..', bundle.path);
  
  if (!fs.existsSync(fullPath)) {
    console.log(`❌ ${bundle.label}: File not found at ${bundle.path}`);
    hasErrors = true;
    continue;
  }
  
  const rawSize = fs.statSync(fullPath).size;
  const gzipSize = getGzipSize(fullPath);
  const maxSize = bundle.maxSizeKB * 1024;
  
  const status = gzipSize <= maxSize ? '✅' : '❌';
  const sizeStr = `${formatBytes(gzipSize)} / ${bundle.maxSizeKB} KB`;
  
  console.log(`${status} ${bundle.label}: ${sizeStr} (raw: ${formatBytes(rawSize)})`);
  
  if (gzipSize > maxSize) {
    hasErrors = true;
  }
}

console.log('\n' + '='.repeat(50));
if (hasErrors) {
  console.log('❌ Bundle size check FAILED');
  process.exit(1);
} else {
  console.log('✅ All bundles within size limits');
  process.exit(0);
}