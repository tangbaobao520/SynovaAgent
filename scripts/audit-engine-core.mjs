import fs from 'fs';
import path from 'path';

const EC_SRC = 'packages/engine-core/src';

// All engine-core source files (non-test, non-d.ts)
function findFiles(dir, list = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory() && !e.name.startsWith('__') && e.name !== 'node_modules') {
      findFiles(full, list);
    } else if (e.name.endsWith('.ts') && !e.name.endsWith('.d.ts') && !e.name.endsWith('.test.ts')) {
      list.push(full);
    }
  }
  return list;
}

const ecFiles = findFiles(EC_SRC).map(f => f.replace(/\\/g, '/'));
console.log('Total engine-core source files:', ecFiles.length);

function getImportId(filePath) {
  let rel = path.relative(EC_SRC, filePath).replace(/\\/g, '/').replace(/\.ts$/, '');
  return rel;
}

const fileToId = {};
const fileByPath = {};
ecFiles.forEach(f => {
  const id = getImportId(f);
  fileToId[f] = id;
  fileByPath[id] = f;
});

// Directly imported by src/ (from grep results)
const directPaths = [
  'pipeline/diagnosis/graph-query',
  'pipeline/diagnosis/graph-store',
  'pipeline/diagnosis/entity-resolver-l2',
  'pipeline/collaboration-collector',
  'pipeline/diagnosis/doc-extractor',
  'pipeline/diagnosis/expert-pipeline',
  'pipeline/diagnosis/federal-reporter',
  'pipeline/diagnosis/gap-recorder',
  'pipeline/diagnosis/measurement-pipeline',
  'pipeline/diagnosis/report-builder',
  'pipeline/diagnosis/cpc',
  'pipeline/diagnosis/eob',
  'pipeline/diagnosis/financial-snapshot',
  'pipeline/diagnosis/gap-dynamics',
  'pipeline/diagnosis/hacd',
  'pipeline/diagnosis/hona',
  'pipeline/diagnosis/htm',
  'pipeline/diagnosis/key-person-risk',
  'pipeline/diagnosis/path-dependency',
  'pipeline/diagnosis/self-awareness',
  'pipeline/diagnosis/seven-powers',
  'pipeline/diagnosis/token-economics',
  'pipeline/diagnosis/types',
];

// From @synova/diagnosis-engine re-exports
const deReexportPaths = [
  'pipeline/diagnosis/diagnosis-orchestrator',
  'engine-context',
  'pipeline/diagnosis/ontology-adapter',
  'pipeline/diagnosis/fde-toolset',
  'pipeline/diagnosis/diagnosis-event-stream',
];

const directFromSrc = new Set([...directPaths, ...deReexportPaths]);

// Extract internal imports from a file (only to other engine-core files)
function extractInternalImports(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const imports = [];
  const regex = /from\s+['"](\.[^'"]+)['"]/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const importPath = match[1];
    const dir = path.dirname(filePath);
    const resolvedRes = path.resolve(dir, importPath);
    let relResolved = path.relative(EC_SRC, resolvedRes).replace(/\\/g, '/');
    // Check if this resolves to an engine-core file
    const asTs = path.join(EC_SRC, relResolved + '.ts');
    const asIndex = path.join(EC_SRC, relResolved, 'index.ts');
    if (fs.existsSync(asTs)) {
      imports.push(relResolved);
    } else if (fs.existsSync(asIndex)) {
      imports.push(relResolved + '/index');
    }
  }
  return imports;
}

// Build forward dependency map: file_id -> [files it imports internally]
const forwardDeps = {};
const internalImporters = {}; // file_id -> [files that import it internally]

ecFiles.forEach(f => {
  const id = fileToId[f];
  const imports = extractInternalImports(f);
  forwardDeps[id] = imports;
  imports.forEach(imp => {
    if (!internalImporters[imp]) internalImporters[imp] = [];
    internalImporters[imp].push(id);
  });
});

// BFS to find all reachable files from direct src/ imports
const reachable = new Set(directFromSrc);
const queue = [...directFromSrc];

while (queue.length > 0) {
  const current = queue.shift();
  const deps = forwardDeps[current] || [];
  deps.forEach(dep => {
    if (!reachable.has(dep)) {
      reachable.add(dep);
      queue.push(dep);
    }
  });
}

console.log('Direct from src:', directFromSrc.size);
console.log('Total reachable (incl. indirect):', reachable.size);
console.log('');

// Classify each file: ACTIVE / INDIRECT / DEAD
const results = [];
ecFiles.forEach(f => {
  const id = fileToId[f];
  let status;
  if (directFromSrc.has(id)) {
    status = 'ACTIVE';
  } else if (reachable.has(id)) {
    status = 'INDIRECT';
  } else {
    status = 'DEAD';
  }
  const internalCallers = (internalImporters[id] || []);
  const internalRefCount = internalCallers.length;
  results.push({ status, id, internalRefCount, internalCallers });
});

// Output results
for (const r of results.sort((a, b) => {
  const order = { ACTIVE: 0, INDIRECT: 1, DEAD: 2 };
  return order[a.status] - order[b.status] || a.id.localeCompare(b.id);
})) {
  const callers = r.internalCallers.length > 0 ? r.internalCallers.slice(0, 5).join(', ') : 'none';
  const suffix = r.internalCallers.length > 5 ? ` +${r.internalCallers.length - 5} more` : '';
  console.log(`${r.status} | ${r.id} | internal_refs=${r.internalRefCount} | callers=[${callers}${suffix}]`);
}

// Summary
const activeCount = results.filter(r => r.status === 'ACTIVE').length;
const indirectCount = results.filter(r => r.status === 'INDIRECT').length;
const deadCount = results.filter(r => r.status === 'DEAD').length;
console.log(`\n=== SUMMARY ===`);
console.log(`ACTIVE: ${activeCount}`);
console.log(`INDIRECT: ${indirectCount}`);
console.log(`DEAD: ${deadCount}`);
console.log(`TOTAL: ${results.length}`);
