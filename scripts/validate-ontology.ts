/**
 * scripts/validate-ontology.ts — 本体 Schema 验证脚本
 *
 * 验证:
 * 1. 所有 $id 唯一
 * 2. allowedFrom/To 引用的实体 ID 在 resource/activity/outcome 中存在
 * 3. 所有 JSON 文件解析合法
 */
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ONTOLOGY_DIR = join(process.cwd(), 'extensions', 'ontology');
const ENTITY_DIRS = ['resource', 'activity', 'outcome'];
const EDGE_DIR = 'edge-types';

let errors = 0;
let warnings = 0;

function logError(msg: string): void { console.error(`  ❌ ${msg}`); errors++; }
function logWarn(msg: string): void { console.warn(`  ⚠️  ${msg}`); warnings++; }

// 1. 扫描所有实体
const entityIds = new Set<string>();
const entityLabels = new Set<string>();
const allEntities: Array<{ $id: string; label: string }> = [];

for (const dir of ENTITY_DIRS) {
  const dirPath = join(ONTOLOGY_DIR, dir);
  if (!existsSync(dirPath)) { logError(`实体目录 ${dir}/ 不存在`); continue; }
  const files = readdirSync(dirPath).filter(f => f.endsWith('.json'));
  for (const file of files) {
    const content = readFileSync(join(dirPath, file), 'utf-8');
    try {
      const parsed = JSON.parse(content);
      if (entityIds.has(parsed.$id)) logError(`重复 $id: ${parsed.$id}`);
      entityIds.add(parsed.$id);
      entityLabels.add(parsed.label);
      allEntities.push(parsed);
    } catch { logError(`JSON 解析失败: ${dir}/${file}`); }
  }
  console.log(`  ${dir}/: ${files.length} files`);
}

console.log(`  Total entities: ${allEntities.length}`);

// 2. 扫描边
const edgeDir = join(ONTOLOGY_DIR, EDGE_DIR);
if (!existsSync(edgeDir)) { logError(`边目录 ${EDGE_DIR}/ 不存在`); process.exit(1); }

const edgeFiles = readdirSync(edgeDir).filter(f => f.endsWith('.json'));
const edgeIds = new Set<string>();

for (const file of edgeFiles) {
  try {
    const parsed = JSON.parse(readFileSync(join(edgeDir, file), 'utf-8'));
    if (edgeIds.has(parsed.$id)) logError(`重复 edge $id: ${parsed.$id}`);
    edgeIds.add(parsed.$id);

    // 验证 allowedFrom/To 引用
    for (const from of parsed.allowedFrom || []) {
      if (!entityIds.has(from)) logWarn(`边 ${parsed.$id} 引用未知实体 from: ${from}`);
    }
    for (const to of parsed.allowedTo || []) {
      if (!entityIds.has(to)) logWarn(`边 ${parsed.$id} 引用未知实体 to: ${to}`);
    }
  } catch { logError(`JSON 解析失败: edge-types/${file}`); }
}
console.log(`  edge-types/: ${edgeFiles.length} files`);

console.log(`\n✅ ${allEntities.length} entities + ${edgeFiles.length} edges — ${errors ? `${errors} errors, ` : ''}${warnings ? `${warnings} warnings` : 'all valid'}`);
process.exit(errors > 0 ? 1 : 0);
