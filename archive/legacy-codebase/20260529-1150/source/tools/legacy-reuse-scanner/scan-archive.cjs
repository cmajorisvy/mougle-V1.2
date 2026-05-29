#!/usr/bin/env node
const fs = require('node:fs');
const manifest = process.argv[2] || 'archive/legacy-codebase/20260529-1124/manifests/reuse-candidates.json';
const query = (process.argv[3] || '').toLowerCase();
const rows = JSON.parse(fs.readFileSync(manifest, 'utf8'));
const filtered = query ? rows.filter((row) => JSON.stringify(row).toLowerCase().includes(query)) : rows;
console.log(JSON.stringify(filtered.slice(0, 100), null, 2));
