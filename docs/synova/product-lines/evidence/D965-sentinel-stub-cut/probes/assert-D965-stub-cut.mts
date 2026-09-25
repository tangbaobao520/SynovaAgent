/**
 * assert-D965-stub-cut.mts — D965 判别性夹具（改坏即红）
 *
 * 作者: sentinel-coder-a（与 probe-D965-sentinels.mts 分离：探针只测量，本件只判定）
 *
 * 判据（全部为**运行时**断言，非 grep 静态判据）:
 *   1. 金丝雀（CANARY，方言无关）: 3 个**未被本卡触碰**的哨兵必须在零数据图上
 *      产出与其基线**逐元素完全相等**的 finding id —— 证明"探针真的读到了 finding 流"，
 *      排除"因为什么都没加载所以判绿"的假绿。
 *   2. 禁用项（FORBIDDEN）: 2 个被裁撤的桩哨兵不得出现在加载集内，
 *      其编造 finding id 不得出现在 finding 流中。
 *   3. 无误伤（SURVIVORS）: 除被裁撤的 2 个哨兵外，findings 映射必须**逐元素相等**
 *      （多一条/少一条/改一个 id 都红）。
 *
 * 契约（铁律 47）:
 *   @input   --probe=/tmp/D965/probe-<label>.json（probe-D965-sentinels.mts 的产物）
 *   @output  stdout: 每条判据的 PASS/FAIL 明细 + 反例原始数据
 *   @exit    0 = 全绿；1 = 至少一条判据红（业务阻断）；2 = 输入缺失（fail-closed，不判绿）
 *   @degraded 无（缺输入即 exit 2，绝不静默当绿 —— 铁律 11/24）
 */
import { existsSync, readFileSync } from 'fs';

const argv = process.argv.slice(2);
const probePath = (argv.find((a) => a.startsWith('--probe=')) || '').slice(8);

if (!probePath || !existsSync(probePath)) {
  console.error(`assert: degraded — 探针产物缺失，fail-closed 不判绿: ${probePath || '(未提供 --probe=)'}`);
  process.exit(2);
}

type ProbeJson = {
  label: string;
  loadSentinels: { count: number; degraded: boolean; errors: string[] };
  findingsMap: Record<string, string[]>;
  rows: Array<{ name: string; threw: string | null; entryExists: boolean; unpackedLen: number; storeCallTotal: number }>;
};
const p = JSON.parse(readFileSync(probePath, 'utf-8')) as ProbeJson;

const failures: string[] = [];
const pass = (msg: string) => console.log(`PASS  ${msg}`);
const fail = (msg: string) => {
  console.log(`FAIL  ${msg}`);
  failures.push(msg);
};

console.log(`# assert-D965-stub-cut  probe=${probePath}  label=${p.label}`);
console.log(`# loadSentinels.count=${p.loadSentinels.count} degraded=${p.loadSentinels.degraded} errors=${JSON.stringify(p.loadSentinels.errors)}`);

// ── ① 金丝雀（方言无关：改用任何别的零数据方言，只要 finding 流可读，金丝雀就该在） ──
const CANARY: Record<string, string[]> = {
  'cash-runway': ['cr_runway_degraded', 'cr_overdue_degraded'],
  'business-model-coherence': ['i7-crit'],
  'channel-capacity': ['o6-nodata'],
};
for (const [name, expected] of Object.entries(CANARY)) {
  const actual = p.findingsMap[name];
  if (actual === undefined) {
    fail(`金丝雀缺失 [${name}]：该哨兵未产出任何 finding（探针可能什么都没读到 → 假绿）`);
  } else if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`金丝雀 id 漂移 [${name}]：期望 ${JSON.stringify(expected)} 实际 ${JSON.stringify(actual)}`);
  } else {
    pass(`金丝雀在 [${name}] -> ${JSON.stringify(actual)}`);
  }
}

// ── ② 禁用项：被裁撤的 2 个桩哨兵 ──
const CUT_SENTINELS = ['sentinel-forecast-accuracy', 'sentinel-pricing-strategy'];
const FORBIDDEN_IDS = ['forecast-mape', 'forecast-sample', 'forecast-timeseries', 'pricing-disc', 'pricing-below-mc'];
for (const s of CUT_SENTINELS) {
  if (p.rows.some((r) => r.name === s)) {
    fail(`裁撤未生效 [${s}]：仍出现在加载集（共 ${p.rows.length} 个哨兵）`);
  } else {
    pass(`已裁撤 [${s}]：不在加载集内`);
  }
}
const allIds = Object.values(p.findingsMap).flat();
const leaked = FORBIDDEN_IDS.filter((id) => allIds.includes(id));
if (leaked.length > 0) {
  fail(`编造 finding 泄漏：${JSON.stringify(leaked)}（出现在 ${JSON.stringify(
    Object.entries(p.findingsMap).filter(([, ids]) => ids.some((i) => FORBIDDEN_IDS.includes(i))).map(([n]) => n),
  )}）`);
} else {
  pass(`编造 finding 零残留：${JSON.stringify(FORBIDDEN_IDS)} 均不在流中（全流 ${allIds.length} 条）`);
}

// ── ③ 无误伤：除被裁撤者外逐元素相等 ──
const SURVIVORS: Record<string, string[]> = {
  'business-model-coherence': ['i7-crit'],
  'cash-runway': ['cr_runway_degraded', 'cr_overdue_degraded'],
  'channel-capacity': ['o6-nodata'],
  'competitive-moat': ['i3-nodata'],
  'competitive-position': ['e1-nodata'],
  'environment-rent-dependency': ['e5-rent-warn'],
  'incentive-alignment': ['o3-nodata'],
  'info-distortion': ['o7-nodata'],
  'knowledge-accessibility': ['o4-nodata'],
  'org-repairability': ['o8-nodata'],
  'power-rigidity': ['o9-nodata'],
  'routine-diffusion': ['o5-nodata'],
  'talent-density': ['o10-nodata'],
};
const actualKeys = Object.keys(p.findingsMap).sort();
const expectedKeys = Object.keys(SURVIVORS).sort();
if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
  fail(`有产出的哨兵集合变化（误伤）：多出 ${JSON.stringify(actualKeys.filter((k) => !expectedKeys.includes(k)))} / 缺失 ${JSON.stringify(expectedKeys.filter((k) => !actualKeys.includes(k)))}`);
} else {
  pass(`有产出的哨兵集合一致：${actualKeys.length} 个`);
}
for (const [name, expected] of Object.entries(SURVIVORS)) {
  const actual = p.findingsMap[name];
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`finding 误伤 [${name}]：期望 ${JSON.stringify(expected)} 实际 ${JSON.stringify(actual)}`);
  }
}

// ── ④ 桩哨兵本应"零 store 调用"——裁撤后该特征必须消失 ──
const zeroStore = p.rows.filter((r) => r.storeCallTotal === 0).map((r) => r.name);
console.log(`# 零 store 调用哨兵（裁撤后应为空）: ${JSON.stringify(zeroStore)}`);
if (zeroStore.length !== 0) fail(`裁撤后仍有哨兵零 store 调用（硬编码桩嫌疑）: ${JSON.stringify(zeroStore)}`);
else pass('零 store 调用哨兵 = 0（裁撤前为 2）');

// ── ⑤ threw == 0 ──
const threw = p.rows.filter((r) => r.threw);
if (threw.length !== 0) fail(`抛错哨兵 ≠ 0: ${JSON.stringify(threw.map((r) => [r.name, r.threw]))}`);
else pass(`抛错 = 0（共 ${p.rows.length} 个哨兵）`);

// ── 判定 ──
console.log(`\n=== ASSERT RESULT: ${failures.length === 0 ? 'GREEN' : 'RED'} (failures=${failures.length}) ===`);
for (const f of failures) console.log(`  - ${f}`);
process.exit(failures.length === 0 ? 0 : 1);
