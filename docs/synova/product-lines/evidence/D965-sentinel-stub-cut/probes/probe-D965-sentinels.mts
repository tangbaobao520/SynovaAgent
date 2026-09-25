/**
 * probe-D965-sentinels.mts — D965「裁撤 2 个硬编码桩」裁撤前/后对照探针
 *
 * 作者: sentinel-coder-a（自研，**不复用** sentinel-verifier 的 probe-sentinels.mts）
 *
 * 目的: 对 <cwd>/extensions/sentinels 下全部哨兵逐个执行
 *       check(store, teamId, traversal, thresholds)，按 loader 口径解包 findings，
 *       输出 **逐哨兵 finding-id 映射**，供裁撤前后逐元素 diff（证明 4 条编造 finding
 *       消失、且无其它 finding 被误伤）。
 *
 * 契约（铁律 47）:
 *   @input   --db=<path>   零数据 SQLite（**只读打开**，绝不写）；--label=<string>
 *            --cwd=<dir>   哨兵根所在仓库根（默认 process.cwd()）；探针只读该目录
 *   @output  stdout: 逐哨兵表 + SUMMARY + FINDINGS-BY-SENTINEL 块
 *            文件: /tmp/D965/probe-<label>.json（机器读，含 findingsMap）
 *   @exit    0 = 探针跑完（**不判业务对错**）；1 = 探针自身失败（环境/导入/DB）
 *   @degraded 无（探针失败即 exit 1，不静默当绿）
 *
 * 与 loader 的对齐点（逐条取自 src/sentinel/sentinel-loader.ts）:
 *   - 扫描口径    : loader L76-90（跳过 shared / `_` 前缀目录）
 *   - entryPoint  : loader L193 `join(dir, manifest.entryPoint || './aggregate.ts')`
 *   - exportKey   : loader L199 `mod[manifest.exportKey || 'default']`
 *   - manifest 注入: loader「'manifest' in obj 才注入」
 *   - thresholds  : loader L266 `resolveThresholds(manifest.name, teamId)`（两参）
 *   - 解包        : loader L287 `Array.isArray(raw) ? raw : (raw.findings ?? [])`
 *   - degraded    : loader L289 仅对象形态传播
 */
import { pathToFileURL } from 'url';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import Database from 'better-sqlite3';

const argv = process.argv.slice(2);
const arg = (name: string, dflt = ''): string =>
  (argv.find((a) => a.startsWith(`--${name}=`)) || `--${name}=${dflt}`).slice(name.length + 3);

const DB_PATH = arg('db');
const LABEL = arg('label', 'X');
const CWD = arg('cwd', process.cwd());

if (!DB_PATH) {
  console.error('probe: need --db=<path>');
  process.exit(1);
}
if (!existsSync(CWD)) {
  console.error(`probe: --cwd 不存在: ${CWD}`);
  process.exit(1);
}
process.chdir(CWD);

const { loadSentinels, resolveThresholds } = await import(`${CWD}/src/sentinel/sentinel-loader.ts`);
const { SqliteGraphStore } = await import(`${CWD}/src/adapters/sqlite-graph-store.ts`);
const { createGraphTraversal } = await import(`${CWD}/src/l4/graph-traversal.ts`);

// ── 零数据图 ──
// 注意: SqliteGraphStore 构造器会 reconcileSchema（写 schema_version）→ 只读句柄必然
// SQLITE_READONLY（实测）。故本探针必须在 **/tmp 快照副本** 上以可写方式打开；
// 下面做硬守卫：路径落在仓库 data/ 下或文件名是 synova.db 时直接拒绝，绝不写生产库。
import { resolve as resolvePath } from 'path';
const absDb = resolvePath(DB_PATH);
if (/(^|\/)data\/(synova\.db|.*\.db)$/.test(absDb) || absDb.endsWith('/data/synova.db')) {
  console.error(`probe: 拒绝在生产库上运行（reconcileSchema 会写）: ${absDb}；请用 /tmp 快照副本`);
  process.exit(1);
}
const db = new Database(absDb);
const realStore = new SqliteGraphStore(db as never);

/** 方法调用计数器（插桩：证明「谁真的查了 store」） */
function countingProxy(target: Record<string, unknown>, counts: Record<string, number>) {
  return new Proxy(target, {
    get(t, prop, recv) {
      const v = Reflect.get(t, prop, recv);
      if (typeof v === 'function' && typeof prop === 'string') {
        return (...args: unknown[]) => {
          counts[prop] = (counts[prop] || 0) + 1;
          return (v as (...a: unknown[]) => unknown).apply(t, args);
        };
      }
      return v;
    },
  });
}

const loadAll = loadSentinels();
const rows: Record<string, unknown>[] = [];
const findingsMap: Record<string, string[]> = {};
const STORE_KEYS = ['queryNodes', 'queryEdges', 'getNode', 'queryTriples', 'traverse'];

console.log(`# probe label=${LABEL}`);
console.log(`# cwd=${CWD}`);
console.log(`# db=${DB_PATH} (readonly)`);
console.log(
  `# loadSentinels: count=${loadAll.sentinels.length} degraded=${loadAll.degraded} errors=${JSON.stringify(loadAll.errors)}`,
);
console.log('# header: name | entryExists | rawArray | unpackLen | threw | storeCalls | ids');

for (const { manifest, dir } of loadAll.sentinels) {
  const entryPath = join(dir, manifest.entryPoint || './aggregate.ts');
  const counts: Record<string, number> = {};
  const rec: Record<string, unknown> = {
    name: manifest.name,
    entryPoint: manifest.entryPoint ?? null,
    exportKey: manifest.exportKey ?? null,
    entryExists: existsSync(entryPath),
  };

  let ids: string[] = [];
  let unpackedLen = 0;
  let threw: string | null = null;
  let rawIsArray: boolean | null = null;
  let evidenceLens: number[] = [];
  let degradedProp = false;

  try {
    const mod = await import(pathToFileURL(entryPath).href);
    const obj = mod[manifest.exportKey || 'default'] as Record<string, unknown> | undefined;
    rec.moduleLoaded = true;
    if (!obj || typeof obj.check !== 'function') {
      threw = `no check() on mod['${manifest.exportKey || 'default'}']`;
      rec.hasCheck = false;
    } else {
      rec.hasCheck = true;
      if ('manifest' in obj) obj.manifest = manifest; // loader 同款：只对声明了 manifest 字段的对象注入
      const storeProxy = countingProxy(realStore as unknown as Record<string, unknown>, counts);
      let traversal: unknown;
      try {
        traversal = createGraphTraversal(storeProxy as never);
      } catch (e) {
        rec.traversalBuildError = e instanceof Error ? e.message : String(e);
      }
      const { thresholds } = await resolveThresholds(manifest.name, 'probe-team');
      const raw = await (obj as { check: (...a: unknown[]) => unknown }).check(
        storeProxy,
        'probe-team',
        traversal,
        thresholds,
      );
      // ── loader L287-290 同款解包 ──
      rawIsArray = Array.isArray(raw);
      const unpackRaw = Array.isArray(raw) ? raw : ((raw as Record<string, unknown>)?.findings as unknown[]) ?? [];
      const unpacked: unknown[] = Array.isArray(unpackRaw) ? unpackRaw : [];
      degradedProp = !Array.isArray(raw) && (raw as Record<string, unknown>)?.degraded === true;
      unpackedLen = unpacked.length;
      ids = unpacked.map((f) => String((f as { id?: unknown })?.id));
      evidenceLens = unpacked.map((f) => {
        const ev = (f as { evidence?: unknown }).evidence;
        return Array.isArray(ev) ? ev.length : -1;
      });
    }
  } catch (e) {
    rec.moduleLoaded = false;
    threw = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  }

  rec.rawIsArray = rawIsArray;
  rec.unpackedLen = unpackedLen;
  rec.threw = threw;
  rec.ids = ids;
  rec.evidenceLens = evidenceLens;
  rec.degradedProp = degradedProp;
  rec.storeCounts = counts;
  rec.storeCallTotal = STORE_KEYS.reduce((s, k) => s + (counts[k] || 0), 0);
  rows.push(rec);

  const callStr = `qN=${counts.queryNodes || 0}/qE=${counts.queryEdges || 0}/getNode=${counts.getNode || 0}`;
  console.log(
    `${manifest.name} | ${rec.entryExists} | ${rawIsArray} | ${unpackedLen} | ${threw ? 'THREW:' + threw : 'no'} | ${callStr} | ${JSON.stringify(ids)}`,
  );

  if (ids.length > 0) findingsMap[manifest.name] = ids;
}

// ── 汇总 ──
const threwRows = rows.filter((r) => r.threw);
console.log('\n=== SUMMARY ' + LABEL + ' ===');
console.log('sentinels_total=' + rows.length);
console.log('threw_count=' + threwRows.length + (threwRows.length ? ' -> ' + JSON.stringify(threwRows.map((r) => [r.name, r.threw])) : ''));
console.log('entry_missing=' + JSON.stringify(rows.filter((r) => !r.entryExists).map((r) => r.name)));
console.log('module_import_failed=' + JSON.stringify(rows.filter((r) => r.moduleLoaded === false).map((r) => [r.name, r.threw])));
console.log('hasCheck_false=' + JSON.stringify(rows.filter((r) => r.hasCheck === false).map((r) => r.name)));
console.log('store_zero_call=' + JSON.stringify(rows.filter((r) => (r.storeCallTotal as number) === 0).map((r) => r.name)));
console.log('degraded_prop_true=' + JSON.stringify(rows.filter((r) => r.degradedProp === true).map((r) => r.name)));

console.log('\n=== FINDINGS-BY-SENTINEL ' + LABEL + ' (non-empty only, 逐元素可比) ===');
for (const [name, ids] of Object.entries(findingsMap)) console.log(`${name} -> ${JSON.stringify(ids)}`);
console.log('finding_producing_sentinels=' + Object.keys(findingsMap).length);
console.log('total_findings=' + Object.values(findingsMap).reduce((s, a) => s + a.length, 0));

mkdirSync('/tmp/D965', { recursive: true });
const out = `/tmp/D965/probe-${LABEL}.json`;
writeFileSync(
  out,
  JSON.stringify(
    {
      label: LABEL,
      cwd: CWD,
      dbPath: DB_PATH,
      loadSentinels: { count: loadAll.sentinels.length, degraded: loadAll.degraded, errors: loadAll.errors },
      findingsMap,
      rows,
    },
    null,
    2,
  ),
);
db.close();
console.log('json_written=' + out);
