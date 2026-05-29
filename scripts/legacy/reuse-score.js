#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
const file = process.argv[2];
if (!file || !existsSync(file)) {
  console.error('usage: node scripts/legacy/reuse-score.js <file>');
  process.exit(1);
}
const text = readFileSync(file, 'utf8');
const risk = /(truth_score|verified_knowledge|payout|wallet|secret|private_memory)/i.test(text) ? 0.35 : 0.7;
const size = text.length > 20000 ? 0.45 : 0.7;
console.log(JSON.stringify({ file, approximateReuseScore: Number(((risk + size) / 2).toFixed(2)) }, null, 2));
