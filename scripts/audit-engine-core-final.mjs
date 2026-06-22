import fs from 'fs';
import path from 'path';

const EC_SRC = 'packages/engine-core/src';

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

function getImportId(filePath) {
  return path.relative(EC_SRC, filePath).replace(/\\/g, '/').replace(/\.ts$/, '');
}

const fileToId = {};
const fileByPath = {};
ecFiles.forEach(f => {
  const id = getImportId(f);
  fileToId[f] = id;
  fileByPath[id] = f;
});

// ACTIVE: directly imported by src/ (via relative path or @synova/diagnosis-engine)
const directPaths = [
  // Via direct relative imports from src/
  'pipeline/diagnosis/graph-query',
  'pipeline/diagnosis/graph-store',
  'pipeline/diagnosis/entity-resolver-l2',
  'pipeline/collaboration-collector',
  'pipeline/diagnosis/doc-extractor',
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
  // Via @synova/diagnosis-engine
  'pipeline/diagnosis/diagnosis-orchestrator',
  'pipeline/diagnosis/diagnosis-event-stream',
  'pipeline/diagnosis/ontology-adapter',
  'pipeline/diagnosis/fde-toolset',
  'engine-context',
];

// Map direct paths to their src/ callers
const directCallers = {
  'engine-context': ['src/init/engine-context.ts (via @synova/diagnosis-engine)'],
  'pipeline/collaboration-collector': ['src/agent/sentinel-service.ts'],
  'pipeline/diagnosis/cpc': ['src/sentinel/adapters/cpc-sentinel.ts'],
  'pipeline/diagnosis/diagnosis-event-stream': ['src/adapters/engine-core-adapter.ts (via @synova/diagnosis-engine)'],
  'pipeline/diagnosis/diagnosis-orchestrator': ['src/adapters/engine-core-adapter.ts (via @synova/diagnosis-engine)'],
  'pipeline/diagnosis/doc-extractor': ['src/routes/diagnosis-upload-v2.ts'],
  'pipeline/diagnosis/entity-resolver-l2': ['src/l4/entity-resolver-l2.ts'],
  'pipeline/diagnosis/eob': ['src/sentinel/adapters/eob-sentinel.ts'],
  'pipeline/diagnosis/fde-toolset': ['src/adapters/engine-core-adapter.ts (via @synova/diagnosis-engine)'],
  'pipeline/diagnosis/federal-reporter': ['src/adapters/federal-adapter.ts'],
  'pipeline/diagnosis/financial-snapshot': ['src/sentinel/adapters/cash-flow-sentinel.ts'],
  'pipeline/diagnosis/gap-dynamics': ['src/sentinel/adapters/gap-dynamics-sentinel.ts'],
  'pipeline/diagnosis/gap-recorder': ['src/adapters/engine-core-adapter.ts'],
  'pipeline/diagnosis/graph-query': ['src/l4/diagnosis-graph-query.ts', 'src/l3/knowledge-agent.ts', 'src/mcp/tool-registration.ts'],
  'pipeline/diagnosis/graph-store': ['src/l4/engine-graph-store.ts', 'src/routes/ontology.ts', 'src/routes/agent-observer.ts +5 more (via @synova/diagnosis-engine)'],
  'pipeline/diagnosis/hacd': ['src/sentinel/adapters/hacd-sentinel.ts'],
  'pipeline/diagnosis/hona': ['src/sentinel/adapters/hona-sentinel.ts'],
  'pipeline/diagnosis/htm': ['src/sentinel/adapters/htm-sentinel.ts'],
  'pipeline/diagnosis/key-person-risk': ['src/sentinel/adapters/key-person-risk-sentinel.ts'],
  'pipeline/diagnosis/measurement-pipeline': ['src/routes/diagnosis-upload-v2.ts'],
  'pipeline/diagnosis/ontology-adapter': ['src/routes/ontology.ts, src/ingest/index.ts (via @synova/diagnosis-engine)'],
  'pipeline/diagnosis/path-dependency': ['src/sentinel/adapters/path-dependency-sentinel.ts'],
  'pipeline/diagnosis/report-builder': ['src/routes/diagnosis-upload-v2.ts'],
  'pipeline/diagnosis/self-awareness': ['src/sentinel/adapters/self-awareness-sentinel.ts'],
  'pipeline/diagnosis/seven-powers': ['src/sentinel/adapters/seven-powers-sentinel.ts'],
  'pipeline/diagnosis/token-economics': ['src/sentinel/adapters/token-economics-sentinel.ts'],
  'pipeline/diagnosis/types': ['src/types/engine-core-types.ts'],
};

// Extract internal imports
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

// Build forward deps
const forwardDeps = {};
const internalImporters = {};

ecFiles.forEach(f => {
  const id = fileToId[f];
  const imports = extractInternalImports(f);
  forwardDeps[id] = imports;
  imports.forEach(imp => {
    if (!internalImporters[imp]) internalImporters[imp] = [];
    internalImporters[imp].push(id);
  });
});

// BFS from direct to all reachable
const directSet = new Set(directPaths);
const reachable = new Set(directPaths);
const queue = [...directPaths];

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

// Classify
const results = [];
ecFiles.forEach(f => {
  const id = fileToId[f];
  let status;
  if (directSet.has(id)) {
    status = 'ACTIVE';
  } else if (reachable.has(id)) {
    status = 'INDIRECT';
  } else {
    status = 'DEAD';
  }

  const internalCallers = (internalImporters[id] || []);
  const internalRefCount = internalCallers.length;

  // Get src/ callers for ACTIVE, or internal callers for INDIRECT
  let callerList = '';
  if (status === 'ACTIVE') {
    callerList = (directCallers[id] || ['<direct src/ import>']).join('; ');
  } else if (status === 'INDIRECT') {
    callerList = internalCallers.slice(0, 5).join(', ');
    if (internalCallers.length > 5) callerList += ' +' + (internalCallers.length - 5) + ' more';
  } else {
    callerList = internalCallers.slice(0, 3).join(', ');
    if (internalCallers.length > 3) callerList += ' +' + (internalCallers.length - 3) + ' more';
  }

  results.push({ status, id, refCount: internalRefCount, callers: callerList });
});

// Sort: ACTIVE, INDIRECT, DEAD
const order = { ACTIVE: 0, INDIRECT: 1, DEAD: 2 };
results.sort((a, b) => order[a.status] - order[b.status] || a.id.localeCompare(b.id));

console.log('STATUS | FILE_PATH | INTERNAL_REFS | CALLERS');
console.log('-------|-----------|-------------|--------');
for (const r of results) {
  console.log(`${r.status} | ${r.id} | ${r.refCount} | ${r.callers || '(none)'}`);
}

// Summary
const active = results.filter(r => r.status === 'ACTIVE').length;
const indirect = results.filter(r => r.status === 'INDIRECT').length;
const dead = results.filter(r => r.status === 'DEAD').length;
console.log(`\n=== SUMMARY ===`);
console.log(`ACTIVE: ${active}, INDIRECT: ${indirect}, DEAD: ${dead}, TOTAL: ${results.length}`);

// Dead breakdown
console.log(`\n=== DEAD FILE BREAKDOWN BY DIRECTORY ===`);
const deadByDir = {};
results.filter(r => r.status === 'DEAD').forEach(r => {
  const dir = path.dirname(r.id);
  if (!deadByDir[dir]) deadByDir[dir] = [];
  deadByDir[dir].push(r.id);
});
for (const [dir, files] of Object.entries(deadByDir).sort()) {
  console.log(`  ${dir}/ (${files.length} files)`);
}
