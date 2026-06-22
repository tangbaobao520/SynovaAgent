#!/usr/bin/env node
/**
 * scripts/convert-frameworks.mjs — 机械转换：85 个 Framework → JSON 文件
 * v3.6 Batch 1 — 一次性使用
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const TS_FILE = join(ROOT, 'packages/engine-core/src/pipeline/phase-b/framework-library.ts');
const OUT_DIR = join(ROOT, 'extensions', 'frameworks');

const content = readFileSync(TS_FILE, 'utf-8');

// Strategy: find each framework object by matching 'id: '...'' pattern
// then extract from the preceding '{' to the matching '}'
const idPattern = /\bid:\s*'([^']+)'/g;
const frameworkPositions = [];
let match;
while ((match = idPattern.exec(content)) !== null) {
  frameworkPositions.push({ id: match[1], idEnd: match.index + match[0].length });
}
console.log(`Found ${frameworkPositions.length} framework IDs`);

const objects = [];
for (let i = 0; i < frameworkPositions.length; i++) {
  const { id, idEnd } = frameworkPositions[i];

  // Find the opening '{' before this id
  let start = idEnd;
  while (start > 0 && content[start] !== '{') start--;
  if (start === 0) { console.warn(`Could not find opening brace for ${id}`); continue; }

  // Find matching closing '}' by counting braces from start
  let depth = 0;
  let end = start;
  for (let j = start; j < content.length; j++) {
    if (content[j] === '{') depth++;
    if (content[j] === '}') { depth--; if (depth === 0) { end = j + 1; break; } }
  }

  const objText = content.substring(start, end);
  objects.push({ id, text: objText });

  // Extract category
  const catMatch = objText.match(/category:\s*'([^']+)'/);
  const category = catMatch ? catMatch[1] : 'unknown';
  objects[i].category = category;
}

console.log(`Extracted ${objects.length} objects`);

// Write each as JSON
const catCounts = {};
let written = 0;
for (const { id, text, category } of objects) {
  catCounts[category] = (catCounts[category] || 0) + 1;

  try {
    const json = tsObjToJson(text);
    if (!json) continue;

    // Add $id
    json.$id = `framework/${category}/${id}`;

    const dir = join(OUT_DIR, category);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${id}.json`), JSON.stringify(json, null, 2), 'utf-8');
    written++;
  } catch (err) {
    console.warn(`Failed ${id}: ${err.message.substring(0, 100)}`);
  }
}

console.log(`\nWritten ${written} JSON files`);
console.log('Categories:', JSON.stringify(catCounts, null, 2));
console.log(`Total: ${Object.values(catCounts).reduce((a, b) => a + b, 0)}`);

function tsObjToJson(text) {
  // Clean the TypeScript object literal into valid JSON
  let json = text;

  // Remove comments
  json = json.replace(/\/\/[^\n]*/g, '');
  json = json.replace(/\/\*[\s\S]*?\*\//g, '');

  // Handle strings: replace single-quoted with double-quoted
  // But be careful with apostrophes in strings
  // Strategy: find all single-quoted strings and replace them
  let result = '';
  let i = 0;
  let inDouble = false, inSingle = false, inTemplate = false;
  while (i < json.length) {
    const ch = json[i];
    if (inDouble) { result += ch; if (ch === '"' && json[i-1] !== '\\') inDouble = false; i++; continue; }
    if (inTemplate) { result += ch; if (ch === '`' && json[i-1] !== '\\') inTemplate = false; i++; continue; }
    if (inSingle) {
      if (ch === '\\') { result += ch + (json[i+1] || ''); i += 2; continue; }
      if (ch === "'") { result += '"'; inSingle = false; i++; continue; }
      result += ch === '"' ? '\\"' : ch;
      i++; continue;
    }
    if (ch === '"') { inDouble = true; result += ch; i++; continue; }
    if (ch === '`') { inTemplate = true; result += ch; i++; continue; }
    if (ch === "'") { inSingle = true; result += '"'; i++; continue; }
    result += ch;
    i++;
  }
  json = result;

  // Remove trailing commas
  json = json.replace(/,(\s*[}\]])/g, '$1');

  // Add quotes to unquoted keys: { key: -> { "key":
  json = json.replace(/([{,]\s*)([a-zA-Z_$][\w$]*)(\s*:)/g, '$1"$2"$3');

  // Remove TypeScript-specific syntax
  json = json.replace(/\s+as\s+const\b/g, '');
  json = json.replace(/\s+as\s+\w+\b/g, '');

  // Remove leading brace and trailing brace to parse just the object
  return JSON.parse(json);
}
