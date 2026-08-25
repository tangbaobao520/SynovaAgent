---
north-star:
  服务用户: FDE（前线部署工程师）——不会装 Node、不想碰命令行，双击应用就能用
  服务场景: FDE 在自己电脑上双击 SynovaAgent 桌面端，后端服务自动拉起、健康检查通过、开窗即见首诊页，全程零命令行
  模块终态: 双击 → 后端自启（探活→spawn→轮询→健康）→ 开窗见首诊；退出 → 子进程树全回收、无孤儿（Mac + Win 双平台保证）
  对齐北星: PRODUCT-BRIEF §二（直接用户=FDE，缺系统诊断工具）+ §六 P0（没有"开窗即用"的桌面入口不能给 FDE 用）
  完成标准: 入口=双击应用（main.cjs whenReady → ensureBackend）；处理=五段链路（探活失败→spawn→轮询→健康）+ before-quit→stop() 回收；结果=首诊页可达 + 退出后子进程 pid 已死（进程断言，非 grep 冒充——D510 F1）
  当前进度: D504 已合 main（backend-spawn.cjs 五段骨架 + main.cjs 接线就绪）；缺 teardown 双平台保证（stop() 是朴素 child.kill('SIGTERM')，无进程组/taskkill 树/SIGTERM→SIGKILL 升级）+ 五段链路 teardown 集成测试（现有 8 测试无 teardown 断言）
---

<!--
  SYNOVA-IMPL-DSH-D522: L1-B 服务自启开窗即用（验证点 1-4）
  状态: dev doc | 2026-08-25 | 优先级 P1 | slice: L1-B
  权威: 派单-L1切片B §D522（5 必答题）+ 施工图 §3.1/§4/R1 + D510 F1 教训（物理验证，禁 grep 冒充）
  依赖: 无（backend-spawn.cjs + main.cjs 接线已在 main；D504 已合 ea89dee9）
  并行: 无（串行 D522→D523；D523 依赖切片 A D517 产物）
  借鉴红线（3 条，spec 硬约束）:
    ① 借鉴 = 读 DSH 代码思路 → 在 backend-spawn.cjs 自己实现；不 copy DSH 代码、不 npm install @deepseek-ai/dsh（Stage 3 前零 DSH 依赖，施工图 R1）
    ② 只借鉴 teardown（进程回收），不借鉴探活——DSH 探活用 Cordis fiber 生命周期，Synova 用 spawn+HTTP healthz，硬套会跑偏
    ③ Electron 壳自研，不借 DSH 壳（DSH 无 Electron——它是 Node 服务 + 浏览器 UI）
-->

# D522: L1-B 服务自启开窗即用（1-4）

> 一句话问题: 双击应用后后端能拉起、也能开窗，但**退出回收是朴素 `child.kill('SIGTERM')`**——Win 侧杀不掉子进程树留孤儿、优雅退出卡住永远挂起、spawn 没进进程组杀不掉孙进程。这三块缺口让"退出回收无孤儿"在 Win 侧没有保证，五段链路也缺 teardown 集成测试（现有 8 测试止于"spawn→healthy"，没有 stop 回收断言）。

## 1. Authority Doc Verification

- **派单**: `docs/synova/coordination/派单-L1切片B-D522-D523-20260824.md` §D522（5 必答题 + 验收 + DSH 借鉴清单）
- **施工图**: `docs/synova/research/DSH迁移施工图-20260820/DSH迁移施工图-20260820.md` §3.1 L77（electron/ 属 🟢 死守"品牌表层，继续投入自研"）+ §4 L157（安全边界 sandbox=长期借鉴不引代码）+ R1 L322（Stage 3 前零 DSH 代码依赖，借鉴理念自研）
- **产品北星**: `.claude/PRODUCT-BRIEF.md` §二（直接用户=FDE）+ §六 P0
- **审计教训**: D510 F1（禁止静态 grep 冒充实测——来源: 派单 §上一轮教训）+ D504 审计 F2（DS11 退出回收未闭环——本 D 补做）
- **铁律**: AGENTS.md 铁律 0-2（接线验收）/ 24（异常处理 log+degraded）/ 31（降级信号传播）/ 47/48（契约+非空壳测试）

## 2. Problem Statement

派单验证点 1-4「服务自启开窗即用」的**退出回收段**当前 uncommitted。缺口三块（与 DSH 已踩过并解决的坑一一对应）:

1. **Win 侧会留孤儿**——朴素 `child.kill('SIGTERM')` 杀不掉 Win 的子进程树。DSH 用 `taskkill /T /F` 解决（施工图 §4 安全边界范式）。
2. **无 SIGTERM→SIGKILL 升级**——优雅退出卡住（子进程忽略 SIGTERM）就永远挂起。DSH 用 `kill('SIGTERM') → setTimeout(graceMs) → kill('SIGKILL')` 解决。
3. **无进程组管理**——`spawn()` 没设 `detached`（POSIX），子进程留在 Electron 主进程的进程组里，`kill(-pid)` 无从谈起，杀不掉孙进程。DSH 用 `detached: platform !== "win32"` + `process.kill(-pid, sig)` 解决。

> **探活不借鉴**（红线 ②）: Synova 已有 `ensureBackend` 的 spawn+HTTP healthz 探活（backend-spawn.cjs L36-55），DSH 用 Cordis fiber 生命周期。两者模式不同，本 D 只借鉴 teardown，不碰探活。

## 3. Q0-Q4

**Q0 拼图**: L1 交互层桌面端。已有 electron/backend-spawn.cjs（服务自启核心，纯 Node 可无头单测）+ electron/main.cjs（whenReady 调用 + before-quit 回收）。本任务 = 补齐 backend-spawn.cjs 的 teardown 段 + 五段链路集成测试，不新增产品代码、不改 src/。

**Q1 调研**: 业界 = 跨平台子进程回收标准范式（POSIX 进程组 kill(-pgid)、Windows `taskkill /T /F`、SIGTERM→SIGKILL 优雅升级——参考 DSH `dsh-subprocess-local` 的 `signalTree`/`taskkillProcessTree`/`terminate` 实测实现，见下方借鉴清单）；Anthropic 基线 = 机器可验契约（子进程 pid 已死是物理断言，非 grep）+ fail-closed（teardown 幂等，缺 taskkill 二进制不破坏）；memory 教训 = D510 F1（声称实测实为静态 grep）+ D504 F2（退出回收声称闭环实未闭环）。**参考: DSH 跨平台进程回收范式 + Anthropic 机器可验 + 第一性原理（进程死没死 = `kill(pid,0)` 报 ESRCH，可物理断言）+ 结论: 三块缺口用 signalTree/taskkill/SIGKILL 升级三范式补齐，teardown 集成测试断言 pid 已死。**

**Q2 范围**: 做什么——backend-spawn.cjs 的 spawn 加 `detached`（POSIX 进程组）+ stop() 改为跨平台 signalTree 范式（Win taskkill /T /F，POSIX kill(-pid) 回退 child.kill）+ SIGTERM→SIGKILL 升级（grace 可注入）+ tests/electron/backend-spawn.test.ts 补 teardown 三路径测试。不做什么——不改 src/（首诊后端生产可用）、不改 main.cjs（接线已就绪，本 D 只验证不改）、不改探活逻辑（红线 ②）、不引 DSH 依赖（R1）、不改 build-synova.cjs（D517 领地）。

**Q3 验收**: 入口=双击应用（main.cjs L121 whenReady → L126 ensureBackend）；处理=五段链路 + before-quit（L186）→ stop() 回收；结果=首诊页可达 + 退出后 `kill(pid,0)` 报 ESRCH（子进程已死）。

**Q4 契约与测试**: 见 §7。

## 4. Current State（2026-08-25 实测，worktree @5d6f487d）

- `electron/backend-spawn.cjs`（156 行，纯 Node 模块，D504 交付）:
  - L117 `const c = spawn(cmd.bin, cmd.args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })`——**无 `detached`**，POSIX 下子进程留在主进程组。
  - L131-135 `stop()` 闭包——**朴素 `child.kill('SIGTERM')`**，无进程组/taskkill/SIGKILL 升级，无幂等（重复调用会二次 kill 已死 pid）。
  - L147 degraded 清理——同款朴素 `child.kill('SIGTERM')`。
  - L156 `module.exports = { ensureBackend, buildCommand, probeOnce }`——已导出 `buildCommand`/`probeOnce` 供测试直测（teardown 辅助函数照此导出）。
- `electron/main.cjs`（193 行）: L19 `require('./backend-spawn.cjs')` → L126-132 `ensureBackend({...})` → L133-135 degraded `console.error` → L186-192 `before-quit` → `backendHandle.stop()`。**接线已就绪**，本 D 不改。
- `tests/electron/backend-spawn.test.ts`（13KB，D504 8 用例）: 覆盖 reused/端口冲突、spawn→healthy、degraded（超限/ENOENT）、env 注入、双模式命令。**无 teardown 断言**（无"stop() 后 pid 已死"用例）。
- DSH 参考实现（借鉴范式，非 copy——路径为只读参考）:
  - `~/.nvm/versions/node/v24.19.0/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-subprocess-local/lib/index.js`
  - `signalTree(platform, pid, sig, child, taskkill)` L757-773: Win→taskkill(pid)；POSIX→`process.kill(-pid, sig)` 回退 `child.kill(sig)`。
  - `taskkillProcessTree(pid)` L742-750: `spawnSync("taskkill", ["/PID", pid, "/T", "/F"], {stdio:"ignore"})`，pid≤0 no-op（幂等）。
  - `linuxProcessGroupHasLiveMembers(pgid)` L322-338: 读 /proc/*/stat 判 pgrp 存活（zombie/dead 不计活成员）。
  - `detached: platform !== "win32"` L805（POSIX 子进程自建进程组）。
  - SIGTERM→SIGKILL 升级 L864-872: `kill("SIGTERM") → setTimeout(() => kill("SIGKILL"), graceMs)`；`terminateForHostExit` L873-875 直接 SIGKILL。

## 5. What We Build

### 5.1 写集 (2 修改 + 0 新建)
| 文件 | 操作 | 说明 |
|------|:---:|------|
| electron/backend-spawn.cjs | 修改 | ①spawnOnce 加 `detached: process.platform !== 'win32'`（POSIX 子进程自建进程组，`kill(-pid)` 可及孙进程）；②新增 `signalTree(platform, pid, sig, child, taskkill)` 与 `taskkillProcessTree(pid)` 两个辅助函数（借鉴 DSH 范式自研，非 copy）：Win 走 `spawnSync('taskkill', ['/PID', pid, '/T', '/F'], {stdio:'ignore'})`（pid≤0 no-op，缺 taskkill 二进制/非零状态不破坏幂等），POSIX 走 `process.kill(-pid, sig)` 失败回退 `child.kill(sig)`；③stop() 与 L147 degraded 清理统一改走 signalTree + SIGTERM→SIGKILL 升级（grace 可注入 `graceMs`，默认 5000ms，测试可缩短）；④stop() 幂等（`child.killed || pid≤0` 短路，重复调用无副作用）；⑤导出 signalTree/taskkillProcessTree 供测试直测 |
| tests/electron/backend-spawn.test.ts | 修改 | 补 teardown 三路径测试（正常/降级/边界）+ 五段链路 stop 回收断言（见 §7），断言子进程 pid 已死（`kill(pid,0)` 抛 ESRCH），非 grep 冒充 |

## 6. What We Don't Do

| 不做 | 原因 |
|------|------|
| 改 src/ 任何文件 | 派单红线——首诊后端生产可用 |
| 改 electron/main.cjs | 接线已就绪（L19/L126/L133-135/L186-192），本 D 只验证不改 |
| 改探活逻辑（probeOnce/probeUntil） | 红线 ②——探活不借鉴 DSH，Synova 用 spawn+healthz 模式 |
| 引入 DSH 依赖（npm install @deepseek-ai/dsh / copy DSH 代码） | 施工图 R1——Stage 3 前零 DSH 依赖，借鉴理念自研 |
| 改 electron/ 其余文件（preload.cjs/config.json） | D504 交付，本 D 不碰 |
| 改 build-synova.cjs | D517（切片 A）领地，本 D 不碰 |
| 做 Win 本机实测 | 验证点 1-2，D523 领地（本 D 只保证 backend-spawn 纯 Node 逻辑双平台正确，Win 实测由 D523 落） |

## 7. Test Requirements

**契约（铁律 47，先于实现定义）**: `ensureBackend` 五段链路不变（探活失败→spawn→轮询→健康→stop 回收），本 D 只增强 stop() 契约:

```
stop() 契约（teardown 增强后）:
  @input   — 无（闭包持有 child + pid + platform）
  @output  — 无（void）；副作用 = 子进程树终止
  @behavior — POSIX: signalTree(pid, 'SIGTERM') → graceMs 后 signalTree(pid, 'SIGKILL')；Win: taskkillProcessTree(pid)
  @idempotent — 重复调用无副作用（child.killed / pid≤0 短路）
  @degraded — taskkill 二进制缺失/非零状态 → log.warn + 继续（不抛、不静默，铁律 11/24）；teardown 失败不阻断应用退出
```

| 层 | 用例 | 覆盖 | red 前提 |
|:---|------|------|------|
| L1 单元 | stop() → SIGTERM → 子进程 pid 已死（`process.kill(pid,0)` 抛 ESRCH） | 正常路径 | 当前 stop() 只发 SIGTERM 无断言，改造后首绿 |
| L1 单元 | stop() 幂等——连续两次 stop() 不抛、无二次副作用 | 边界 | 当前无幂等保护，二次 kill 已死 pid 可能抛 |
| L1 单元 | SIGTERM→SIGKILL 升级——子进程忽略 SIGTERM（`node -e "process.on('SIGTERM',()=>{});setInterval(()=>{},1e3)"`）→ graceMs 后 pid 已死 | 降级/边界 | 当前无升级，忽略 SIGTERM 的子进程永远挂起 |
| L1 单元 | POSIX 进程组——spawn `detached` 后子进程再 spawn 孙进程（`node -e "require('child_process').spawn('sleep',['60']);setInterval(()=>{},1e3)"`）→ stop() 后孙进程 pid 也死 | 正常+进程组 | 当前无 detached，孙进程成孤儿 |
| L2b 降级 | Win taskkill 缺失（注入假 taskkill 返回非零/不存在）→ teardown 继续（幂等）+ log.warn，不抛 | 降级 | 当前无 taskkill 路径 |
| L2c 边界 | pid≤0 / child 已 killed → stop() no-op 不抛 | 边界 | 当前无短路保护 |
| L2a 接线 | 五段链路集成——起假后端（healthz 先 503 后 200）→ ensureBackend 返回 started+pid → stop() → 断言假后端进程已死 | 正常全链 | 当前测试止于 started=true，无 stop 回收 |

**verify 命令（物理，非 grep）**:
```bash
npx vitest run tests/electron/backend-spawn.test.ts   # 全部用例含 teardown 断言（pid 已死 = kill(pid,0) 抛 ESRCH）
```

## 8. Wiring Verification

| 新/改产物 | 生产调用点（实测方法） |
|--------|------|
| backend-spawn.cjs `stop()`（增强） | `grep -n "backendHandle.stop\|backendHandle && backendHandle.stop" electron/main.cjs` → L189 before-quit 真实调用（测试调用不计） |
| backend-spawn.cjs `ensureBackend` | `grep -n "ensureBackend" electron/main.cjs` → L19 require + L126 调用点（D504 已接线，本 D 验证不改） |
| degraded 分支 | main.cjs L133-135 `console.error('[electron] 后端自启 degraded —', ...)` 已存在；backend-spawn.cjs L146 `console.error('[backend-spawn] 后端自启降级 — ...')` 已存在（铁律 24 不静默） |
| 后端入口 | `src/index.ts`（dev: `npx tsx src/index.ts`；prod: `node dist/src/index.js`，backend-spawn.cjs L62-63 buildCommand 实测） |
| 首诊页 | `src/routes/diagnosis.ts`（派单 B 现状材料，生产可用 GS-01 已绿）——开窗后 loadURL 目标 |

## 9. Architecture Layer

L1 交互层（Electron 桌面端服务自启）。backend-spawn.cjs 是纯 Node 模块（不 require electron），跨平台进程回收属 L1 基建，零跨层——不 import 任何 L2-L5 层，只 spawn 后端（src/index.ts）并探活。

## 10. Completion Standard

1. **DS1**: `npx vitest run tests/electron/backend-spawn.test.ts` 全绿（含 teardown 三路径 + 五段链路 stop 回收断言；red 已证——改造前 stop() 用例失败）
2. **DS2**: stop() 后子进程 pid 已死物理证据——`process.kill(pid, 0)` 抛 ESRCH（测试断言，非 grep 冒充——D510 F1）
3. **DS3**: 无孤儿进程残留——POSIX 进程组用例断言孙进程 pid 也死（`kill(grandchildPid, 0)` 抛 ESRCH）
4. **DS4**: SIGTERM→SIGKILL 升级物理证据——忽略 SIGTERM 的子进程在 graceMs 后被 SIGKILL 杀死（测试断言）
5. **DS5**: WIRE CHECK 物理证明——`grep ensureBackend electron/main.cjs` 有 L19 + L126 调用点 + L186-192 before-quit 回收 + L133-135 degraded log（测试断言 wiring 真闭环，禁止只 grep 冒充——D510 F1 教训）
6. **DS6**: 写集外零文件改动（`git diff --name-only` 对账 = 写集 2 文件）；src/ 与 scripts/audit/ 零触碰；零 DSH 依赖（`grep -rn "@deepseek-ai/dsh" electron/ package.json` 零结果）
7. **DS7**: task-state/D522.json 回填 impl + evidence（DS1 测试输出 + DS2/DS3/DS4 断言原文）

> 交付声明覆盖 DS1-DS7 逐项标注 ✅/⏸/❌+理由，禁重编号/静默缺项（S-10）。

## 11. Auth Doc References

- docs/synova/coordination/派单-L1切片B-D522-D523-20260824.md（§D522 5 必答题 + DSH 借鉴清单）
- docs/synova/research/DSH迁移施工图-20260820/DSH迁移施工图-20260820.md（§3.1 L77 / §4 L157 / R1 L322）
- .claude/PRODUCT-BRIEF.md（§二 / §六 P0）
- docs/synova/audit-reports/2026-08-23-D504-D505.md（D504 基线，F2 退出回收未闭环）
- AGENTS.md（铁律 0-2/24/31/47/48）
- 借鉴范式参考（只读，非依赖）: `~/.nvm/versions/node/v24.19.0/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-subprocess-local/lib/index.js`（signalTree L757-773 / taskkillProcessTree L742-750 / linuxProcessGroupHasLiveMembers L322-338 / detached L805 / SIGTERM→SIGKILL L864-872）

## 12. 必答题 5 补充——teardown 范式骨架（借鉴自研，非 copy，编码照此思路）

```js
// electron/backend-spawn.cjs — 本 D 改动的 teardown 段（其余探活/轮询/重启逻辑保持现状不动）

/** Win 进程树终止（借鉴 DSH taskkillProcessTree 范式自研）: taskkill /T /F，幂等（pid<=0 no-op，缺二进制不破坏） */
function taskkillProcessTree(pid) {
  if (!pid || pid <= 0) return;
  try {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
  } catch (err) {
    console.warn(`[backend-spawn] taskkill 失败（幂等继续）: ${err.message}`);
  }
}

/** 跨平台信号树（借鉴 DSH signalTree 范式自研）: Win taskkill；POSIX kill(-pid) 回退 child.kill */
function signalTree(platform, pid, sig, child) {
  if (platform === 'win32') { taskkillProcessTree(pid); return; }
  if (!pid || pid <= 0) return;
  try { process.kill(-pid, sig); }           // 进程组信号（spawn detached 后子进程自建进程组）
  catch { try { child.kill(sig); } catch {} } // 组已消失 → 回退直接杀（幂等）
}

/** teardown: SIGTERM → graceMs → SIGKILL 升级（借鉴 DSH terminate 范式自研） */
function makeStop(platform, pid, child, graceMs = 5000) {
  let stopped = false;
  return () => {
    if (stopped || child.killed || !pid || pid <= 0) return; // 幂等短路
    stopped = true;
    signalTree(platform, pid, 'SIGTERM', child);
    const t = setTimeout(() => signalTree(platform, pid, 'SIGKILL', child), graceMs);
    if (t.unref) t.unref(); // 不阻塞应用退出
  };
}

// spawnOnce 加 detached（POSIX 进程组）:
//   const c = spawn(cmd.bin, cmd.args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'],
//                                        detached: process.platform !== 'win32' });

// stop 与 degraded 清理（L131-135 / L147）统一改走 makeStop(...)
// module.exports 追加: { ensureBackend, buildCommand, probeOnce, signalTree, taskkillProcessTree }
```

> **红线自检**: 以上是 Synova 自己的实现（读 DSH 思路后重写），非 copy DSH 代码、非 `npm install @deepseek-ai/dsh`。探活逻辑（probeOnce/probeUntil）零改动。

## 13. 自检清单（dev-doc 侧，K3 可核）

- [x] 派单 5 必答题逐条覆盖（①五段链路测试=§7 ②WIRE CHECK 物理证明=DS5 ③端口冲突安全网=§4 现状已有 reused 用例+本 D 保留 ④降级诚实=§4 L133-135/L146 已存在+§7 L2b ⑤退出回收借鉴=§12 teardown 骨架+DS2/DS3/DS4）
- [x] 现状全部实测（worktree @5d6f487d: backend-spawn.cjs L117/L131-135/L147/L156 + main.cjs L19/L126/L133-135/L186-192 + tests 现状逐文件 read）
- [x] DSH 借鉴点行号实测核对（signalTree L757-773 / taskkillProcessTree L742-750 / linuxProcessGroupHasLiveMembers L322-338 / detached L805 / SIGTERM→SIGKILL L864-872，均 read 原文核实，非派单转抄）
- [x] 借鉴红线 3 条写死（§头部注释 + §6 不做什么 + §12 红线自检）；探活不借鉴（红线 ②）
- [x] Done 标准 = 进程断言（kill(pid,0) 抛 ESRCH），零 grep 冒充（D510 F1）
- [x] 写集 2 条目（backend-spawn.cjs 修改 + backend-spawn.test.ts 修改）；不碰 src/、main.cjs、build-synova.cjs、scripts/audit/
- [x] 依赖声明: 无（backend-spawn.cjs + main.cjs 接线已在 main）
