#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
mkdirSync('artifacts/mougle-v1.2', { recursive: true });
const schema = readFileSync('shared/schema.ts', 'utf8');
const tables = [...schema.matchAll(/pgTable\(\s*["']([^"']+)["']/g)].map((m) => m[1]);
writeFileSync('artifacts/mougle-v1.2/db-schema-readonly-inspection.json', JSON.stringify({ inspectedAt: new Date().toISOString(), source: 'shared/schema.ts', tables }, null, 2));
console.log(`Readonly schema inspection complete: ${tables.length} tables`);
