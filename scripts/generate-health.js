#!/usr/bin/env node
/**
 * Generate health.json with version, commit hash, and timestamp
 * Runs after npm build to populate build/health.json
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const buildDir = path.join(__dirname, '..', 'build');
const healthPath = path.join(buildDir, 'health.json');

// Create build directory if it doesn't exist
if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir, { recursive: true });
}

// Read package.json for version
const pkgPath = path.join(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
const version = pkg.version || '0.0.0';

// Get current git commit SHA (short form)
let commit = 'unknown';
try {
  commit = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
} catch (e) {
  console.warn('Warning: Could not determine git commit hash');
}

// Generate health.json
const health = {
  ok: true,
  version,
  commit,
  timestamp: new Date().toISOString(),
};

// Write health.json
fs.writeFileSync(healthPath, JSON.stringify(health, null, 2) + '\n', 'utf-8');
console.log(`✓ Generated ${healthPath}`);
console.log(JSON.stringify(health, null, 2));
