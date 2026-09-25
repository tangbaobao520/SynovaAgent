/**
 * p7-acceptance.mts — P7 验收三条：在**真实生产库副本**上跑迁移并逐条断言
 *
 * 用法: tsx p7-acceptance.mts --db=<副本路径>
 * 输出: 每条判据 PASS/FAIL + 迁移前后 schema 对照 + exit 0/1
 *
 * 契约（铁律 47）:
 *   @input  — --db=<sqlite 路径>（**必须是 /tmp 副本**；本脚本硬守卫拒绝 data/synova.db）
 *   @output — stdout 逐条判据 + schema 前后对照；exit 0 = 三条全过；1 = 任一条不过；2 = 输入缺失
 *   @degraded — 无（缺输入即 exit 2，不静默当绿）
 */
import Database from 'better-sqlite3';
import { resolve as resolvePath } from 'path';

const argv = process.argv.slice(2);
const dbPath = (argv.find((a) => a.startsWith('--db=')) || '').slice(5);
if (!dbPath) {
  console.error('p7-acceptance: need --db=<path>（/tmp 副本）');
  process.exit(2);
}
const abs = resolvePath(dbPath);
if (/(^|\/)data\/synova\.db$/.test(abs)) {
  console.error(`p7-acceptance: 拒绝在生产库上运行（reconcileSchema 会写）: ${abs}`);
  process.exit(2);
}

const { SqliteGraphStore } = await import(`${process.cwd()}/src/adapters/sqlite-graph-store.ts`);

const db = new Database(abs);
const schemaOf = (): string =>
  ((db.prepare("SELECT sql FROM sqlite_master WHERE name='graph_triples'").get() as { sql?: string } | undefined)?.sql ?? '(缺表)')
    .replace(/\s+/g, ' ')
    .trim();

console.log('# ── 迁移前 graph_triples（生产副本实际结构）──');
console.log(schemaOf().slice(0, 200));

const fails: string[] = [];
const ok = (m: string) => console.log(`PASS  ${m}`);
const bad = (m: string) => { console.log(`FAIL  ${m}`); fails.push(m); };

// 构造 store → 触发 reconcileSchema（即生产启动路径）
const store = new SqliteGraphStore(db as never);

console.log('\n# ── 迁移后 graph_triples（canonical）──');
const after = schemaOf();
console.log(after.slice(0, 200));

// (a) SELECT props FROM graph_triples 成功
try {
  db.prepare('SELECT props FROM graph_triples').all();
  ok('(a) `SELECT props FROM graph_triples` 成功');
} catch (e) {
  bad(`(a) SELECT props 失败: ${e instanceof Error ? e.message : String(e)}`);
}

// (b) queryEdges 不再报 no such column: props
const edgesBefore = store.queryEdges(undefined, undefined, undefined, 'default');
const cols = db.pragma('table_info(graph_triples)') as Array<{ name: string; type: string }>;
const hasProps = cols.some((c) => c.name === 'props');
const idIsText = (cols.find((c) => c.name === 'id')?.type ?? '').toUpperCase() === 'TEXT';
hasProps && idIsText
  ? ok(`(b) queryEdges 无报错（返回 ${edgesBefore.length} 行）；props=${hasProps} id=TEXT=${idIsText}`)
  : bad(`(b) 结构未回 canonical: props=${hasProps} idIsText=${idIsText}`);

// (c) createEdge 写路径读写全通（TEXT id 写入 TEXT 主键）
try {
  const a = store.createNode('P7Probe', { name: 'p7-a' }, 'default');
  const b = store.createNode('P7Probe', { name: 'p7-b' }, 'default');
  const eid = store.createEdge('P7_REBUILD_PROBE', a, b, 1.5, { probe: true }, 'default');
  const got = store.queryEdges('P7_REBUILD_PROBE', a, b, 'default');
  got.length === 1 && got[0].id === eid && got[0].weight === 1.5
    ? ok(`(c) createEdge 读写全通（id=${eid.slice(0, 20)}…, props=${JSON.stringify(got[0].props)}）`)
    : bad(`(c) 写后读回不一致: ${JSON.stringify(got)}`);
} catch (e) {
  bad(`(c) createEdge 失败: ${e instanceof Error ? e.message : String(e)}`);
}

db.close();
console.log(`\n=== P7 ACCEPTANCE: ${fails.length === 0 ? 'ALL PASS' : 'FAILED (' + fails.length + ')'} ===`);
process.exit(fails.length === 0 ? 0 : 1);
