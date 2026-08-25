---
north-star:
  服务用户: FDE（前线部署工程师）+ 企业主——升级/重装桌面端后，首诊数据与企业基线必须完好（企业数据安全底线）
  服务场景: 企业用户安装 v1 → 使用产生数据（首诊报告/哨兵基线，SQLite）→ 升级到 v2（覆盖安装）→ 打开应用数据仍在，无需重新诊断/重新采集
  模块终态: 升级/重装桌面端后 data/synova.db 物理完好（表/内容/md5 前后一致）；数据目录与安装目录物理隔离（mac ~/Library/Application Support/ / win %APPDATA%，不随安装包删除）；db 损坏与多实例写入有显式保护（degraded 提示 + 单实例锁）
  对齐北星: PRODUCT-BRIEF §二（直接用户=FDE）+ §六 P0（诊断报告质量依赖真实使用数据——数据丢了诊断就断了）；施工图 DOC-0114 §3.1（data/synova.db L5 存储 = 🟢 死守领域资产）
  完成标准: 入口=升级实测脚本 scripts/desktop/upgrade-data-verify.sh（装 v1 → 产生数据 → 升级 v2 → 数据断言）；处理=SQLite 表/md5/行数前后对比；结果=数据断言一致（evidence 落盘）+ 数据目录隔离契约文档化（runbook）+ 单实例锁保护生效
  当前进度: 验证点 1-7 uncommitted。机制已设计并实测在库：electron/main.cjs:130 dbPath=app.getPath('userData')/data/synova.db、backend-spawn.cjs:107 env.SYNOVA_DB_PATH 注入、src/config.ts:90-91 只读消费、GS-01 有静态 grep 断言（electron-userdata-dbpath）。缺：升级实测脚本（装两版 → 数据断言）、数据目录/升级语义契约文档、单实例锁（多实例写同一 db 保护）、db 损坏显式降级验证
---

<!--
  SYNOVA-IMPL-DSH-D528: L1-C 升级/重装不丢数据（验证点 1-7）
  状态: dev doc | 2026-08-25 | 优先级 P1 | slice: L1-C
  权威: 派单-L1切片C-D527-D528-20260825.md §D528（5 必答题）+ K3 切片 A 审计（C2 M7 / P2-2）+ D510 F1 + 切片 A mac-install-verify.sh（模式对齐）
  依赖: 切片 A（feat/slice-a-d517-d519，K3 CONDITIONAL PASS）合入 main——安装包产物（dmg/zip）+ mac-install-verify.sh 基建；与切片 B 审计并行（派单 §写集约束）
  并行: 本 spec 与 D527 spec 并行出；编码阶段 D528 可与切片 B 审计并行（派单），等切片 A 合入后启动
  基线声明: 当前工作区 = feat/d505-impl @9cb09dbb（D504 基线），切片 A/B 实现均未合入 main。编码阶段前置（铁律 0-3）: git fetch --all && git pull --ff-only，确认切片 A 已合 main 后**重新核验行号**（防 D524 M7 漂移）；本 spec 引用的行号以当前分支实测为准，切片 A 合入后（main.cjs/backend-spawn.cjs/build-synova.cjs 均被切片 A 改过）行号必漂移
-->

# D528: L1-C 升级/重装不丢数据（1-7）

> 一句话问题: 数据目录重定向机制（userData + SYNOVA_DB_PATH）已设计并在库，但**"升级/重装后数据完好"没有任何物理实测**——没有装两版 → 数据断言的可复现脚本，没有数据目录隔离与安装包升级语义的契约文档，且多实例写同一 db 无保护（main.cjs 无 requestSingleInstanceLock）。企业数据安全底线（验证点 1-7）不能靠静态 grep 断言（GS-01 electron-userdata-dbpath 只是 grep 配置）交差。

## 1. Authority Doc Verification

- **派单**: `docs/synova/coordination/派单-L1切片C-D527-D528-20260825.md` §D528（5 必答题 + 验收）
  > 「升级实测：装 v1 → 产生数据（首诊/哨兵基线）→ 升级 v2（覆盖安装）→ 数据完好断言（SQLite 内容/表/md5 前后一致）——物理可复现脚本」「验证脚本：`scripts/desktop/upgrade-data-verify.sh`（装两版 → 数据断言）——可执行、可复现、幂等」「边界与降级：db 损坏处理（不静默，degraded 提示）+ 多实例写同一 db 的保护」
- **产品北星**: `.claude/PRODUCT-BRIEF.md` §二（直接用户=FDE）+ §六 P0（真实使用数据是诊断质量的根基——升级丢数据 = 诊断断档）
- **施工图**: `docs/synova/research/DSH迁移施工图-20260820/DSH迁移施工图-20260820.md` §3.1（`data/synova.db` L5 存储 = 🟢 死守领域资产；`electron/` = 🟢 品牌表层）+ 铁律 0-4（数据资产备份——真实库物理防线）
- **K3 切片 A 审计**: `.wt-sliceB-specs/docs/synova/audit-reports/2026-08-25-D517-D519.md`——**C2 P1-1（M7 漂移）**: 文档契约与实现必须一致（本 spec 基线声明强制编码前重新核验）；**P2-2**: 产物指纹/时间戳落 evidence 而非仅 task-state；**G3**: prod 后端从未物理可跑教训——本 D 的"升级实测"必须是物理装包断言，禁静态 grep 冒充
- **切片 A 交付**: `electron/backend-spawn.cjs` prod 契约（切片 A 分支实测：buildCommand prod = `process.execPath + dist/backend.mjs` + `ELECTRON_RUN_AS_NODE=1` 注入——合入后以此为准，非本分支 `node dist/src/index.js`）+ `scripts/desktop/mac-install-verify.sh`（D519，四断言 + evidence 落盘模式，本 D 脚本对齐其风格）+ `build-synova.cjs`（D517/D518 修订版：dmg+zip 双 target + 构建链契约注释）
- **GS-01**: `scripts/golden-scenarios/GS-01-first-diagnosis/run.sh` :129-134 electron-dbpath-check（静态 grep：main.cjs 含 SYNOVA_DB_PATH + getPath('userData') + config.ts 含 SYNOVA_DB_PATH）——**本 D 把"数据目录契约"从静态 grep 升级为物理实测**
- **铁律**: AGENTS.md 铁律 0-2（接线验收）/ 0-4（数据备份——禁 cp 数据库）/ 4 / 24+31（异常 log + degraded）/ 47/48（契约+非空壳测试）

## 2. Problem Statement

验证点 1-7「升级/重装不丢数据」当前 uncommitted。机制已在库（userData 重定向），但三块缺口:

1. **零物理实测**: 全仓无"装 v1 → 产生数据 → 升级 v2 → 断言数据完好"的可复现脚本。GS-01 的 electron-userdata-dbpath 断言是**静态 grep**（run.sh:129-134 grep main.cjs/config.ts 文本），证明不了"升级后 SQLite 物理完好"（D510 F1 红线：grep 配置 ≠ 实测）。
2. **契约无文档**: 数据目录隔离原理（为什么升级不清数据）、userData 在 mac/win 的物理位置、electron-builder NSIS/dmg 的升级路径（覆盖安装 vs 卸载重装，哪些清数据哪些不清）——全部无文档，K3 无法复核（DS10 教训：审计员要能物理复现）。
3. **无多实例保护**: `electron/main.cjs` 无 `app.requestSingleInstanceLock()`——双开应用（用户连点两次图标）会启动两个后端进程写同一 SQLite（SQLite 有锁但写入竞争/损坏风险真实存在）；db 损坏的降级链路（healthz 失败 → ensureBackend degraded → offline 页）存在但无显式验证。

## 3. Q0-Q4

**Q0 拼图**: L1 交互层桌面端（electron/）+ L5 存储（data/synova.db，SQLite）。已有机制（main.cjs:130 dbPath + backend-spawn.cjs:107 SYNOVA_DB_PATH + config.ts:90 只读消费）已设计。本任务 = 升级实测脚本 + 契约文档 + 单实例锁 + 降级验证。**零 src/ 改动**（L5 存储层只读消费已就绪）。
**Q1 调研**: 业界 = electron-builder 升级语义标准做法（NSIS perUser 安装目录 + AppData 数据目录隔离，卸载默认**不删** userData 除非 `deleteAppDataOnUninstall: true`；macOS dmg 拖拽安装，升级 = 替换 .app，`~/Library/Application Support/` 数据不动）；Electron 多实例标准做法 = `app.requestSingleInstanceLock()`（二次启动触发 second-instance 事件聚焦已有窗口）；Anthropic 基线 = 机器可验契约（升级前后 SQLite md5/表/行数断言是物理事实）+ fail-closed（db 损坏必须 degraded 可见，不静默）；memory 教训 = K3 切片 A C2（M7 文档漂移——文档契约以实测为准）+ D510 F1（禁 grep 冒充实测）+ P2-2（指纹落盘）+ 切片 A G3（prod 后端从未物理可跑）。**参考: electron-builder 官方文档（NSIS/dmg 升级语义）+ Anthropic（物理断言/fail-closed）+ 第一性原理（数据在 userData 物理隔离目录，安装包只动 .app/安装目录，两者不相交即数据安全）+ 结论: 升级实测脚本（装两版断言 SQLite）+ 契约文档（隔离原理 + 升级语义）+ requestSingleInstanceLock + healthz 降级链路验证。**
**Q2 范围**: 做什么——upgrade-data-verify.sh（核心实测）、runbook（隔离契约 + 升级语义）、main.cjs 单实例锁、脚本契约测试、task-state 回填。不做什么——src/（L5 存储只读消费已就绪，零改动）、scripts/audit/、SQLite 损坏修复逻辑（只做 degraded 提示，修复/备份是既有铁律 0-4 backup-db.sh 职责）、自动更新（publish 注释态 descope）、数据目录自定义 UI（保持 env 注入机制）、改 GS-01（D527 领地，本 D 只把静态断言升级为 runbook 指引）。
**Q3 验收**: 入口=upgrade-data-verify.sh（切片 A 产物 + userData）；处理=装 v1 → 造数据 → 装 v2 → SQLite 断言（表/md5/行数）；结果=断言一致 evidence 落盘 + runbook 文档化 + 单实例锁拒绝二次启动。
**Q4 契约与测试**: 见 §7。

## 4. Current State（2026-08-25 实测，feat/d505-impl @9cb09dbb）

> 基线声明：当前分支不含切片 A/B 实现。以下行号为当前分支实测；切片 A 合入后 main.cjs/backend-spawn.cjs/build-synova.cjs 行号必漂移（D518 改过 main.cjs/backend-spawn.cjs，D517 改过 build-synova.cjs）——编码阶段重新核验（§1 基线声明）。

### 4.1 数据目录机制（已在库，逐文件实测）

- `electron/main.cjs:130` — `dbPath: isProdBoot ? path.join(app.getPath('userData'), 'data', 'synova.db') : undefined`（prod 模式 userData 数据目录）。✅ 派单声称属实。
- `electron/backend-spawn.cjs:107` — `env.SYNOVA_DB_PATH = dbPath;`（:106-108，prod 时注入）。✅ 派单声称属实。
- `src/config.ts:90-91` — `const dbPath = process.env.SYNOVA_DB_PATH || (dataDir ? ... : './data/synova.db')`（只读消费，:88-91）。✅ 派单声称属实。
- `src/routes/healthz.ts` — `GET /api/healthz`（backend-spawn probeOnce 探活目标；**HTTP 200 = 服务健康**——响应体业务级 degraded 字段另表首启未初始化，503 = down；K3 切片 A A3 实测语义）。
- **切片 A 实测 userData 物理位置**: `~/Library/Application Support/synova-agent/`（mac-install-verify.sh 实测，userData 目录名与 productName 不一致——以实测为准；win 对应 `%APPDATA%\synova-agent\` 待 D523 验证）。

### 4.2 安装包配置（build-synova.cjs 81 行，当前分支）

- win: `nsis`（oneClick:false + allowToChangeInstallationDirectory:true + createDesktopShortcut + createStartMenuShortcut，:50-63）——**当前分支无 deleteAppDataOnUninstall 配置**（默认 false = 卸载不清 userData ✅）。
- mac: `dmg [x64, arm64]`（:65-68）——当前分支仅 dmg；切片 A D517 合入后为 dmg+zip 双 target。
- publish 自动更新: 注释态（:75-80，Phase 2 descope）。
- 切片 A 修订（合入后生效，编码以实测为准）: build-backend.sh esbuild bundle 契约 + extraResources 原生模块映射 + 构建链三步契约注释（K3 审计 §二）。

### 4.3 多实例与降级现状

- `electron/main.cjs` — **无 `app.requestSingleInstanceLock()`**（grep 实测零结果）：双开 → 两个 BrowserWindow + 两个后端 spawn 尝试写同一 db（backend-spawn 有探活 reused 路径防双 spawn，但窗口双开会触发两次 ensureBackend 竞态）。
- db 损坏降级链路（现状，未显式验证）: db 损坏 → 服务启动失败 → ensureBackend probeUntil 失败 → `{ started:false, degraded:true, error }`（backend-spawn.cjs:148）→ main.cjs:133-135 console.error + :103-108 offline 页（degraded 提示）。链路存在但**无测试/无实测**。
- `tests/electron/auto-update.test.ts`（4 用例）: AppState save/restore 纯函数测试——与升级数据无关。

### 4.4 GS-01 数据目录断言（静态，需升级为物理）

- `run.sh:129-134` electron-dbpath-check: `grep -q "SYNOVA_DB_PATH" main.cjs && grep -q "getPath('userData')" main.cjs && grep -q "SYNOVA_DB_PATH" config.ts` → 静态 grep，非物理实测（D510 F1）。
- `expect.json` electron-userdata-dbpath 断言（:121-133）。

## 5. What We Build

### 5.1 写集 (2 修改 + 3 新建)
| 文件 | 操作 | 说明 |
|------|:---:|------|
| scripts/desktop/upgrade-data-verify.sh | 新建 | **升级实测核心脚本**（派单必答 1/4）：契约头（@input/@output/@degraded）+ `set -uo pipefail` + step/die/preflight_fail + evidence 落盘（参照 mac-install-verify.sh 模式，D510 F1 红线）。流程：①前置检查（切片 A 产物 release/*.dmg 存在 + hdiutil + sqlite3 可用，缺失 exit 2）；②装 v1（挂载 dmg → cp /Applications 或模拟路径）+ 注入 SYNOVA_DB_PATH 指向临时 userData（**不污染真实 userData**，铁律 0-4 真实库只读）；③造数据（起服务 → 写一条哨兵基线/首诊记录 → sqlite3 记录表清单+行数+md5）；④升级 v2（重新挂载安装替换 .app，**保留 userData 目录**）；⑤数据断言：`sqlite3 .tables` 前后一致 + 关键表行数一致 + db 文件 md5 一致 + `PRAGMA integrity_check` = ok；⑥落 evidence（表清单/行数/md5/断言原文）→ ⑦清理（卸载/删临时目录，幂等）。`--dry-run` 只打印不断言 |
| tests/electron/upgrade-data-verify.test.ts | 新建 | 脚本契约测试（≥8 用例，铁律 48 非空壳，参照切片 A mac-install-verify.test.ts 模式）：读脚本断言关键契约（①契约头含 @input/@output/@degraded；②set -uo pipefail 不用 -e；③含 --dry-run/幂等/清理回收；④sqlite3 断言命令（integrity_check/.tables/行数/md5）；⑤evidence 落盘路径；⑥真实 userData 保护（临时目录注入）；⑦exit 0/1/2 语义注释；⑧不触碰真实库（无 cp data/synova.db）） |
| electron/main.cjs | 修改 | **单实例锁**（派单必答 5 多实例保护）：`app.whenReady` 前 `const gotLock = app.requestSingleInstanceLock(); if (!gotLock) { app.quit(); } else { app.on('second-instance', () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } }); }`——二次启动聚焦已有窗口而非开新实例写同一 db。**注意**：main.cjs 被切片 A D518 改过，编码在合入后基线上改；若切片 A 合入版已含锁（实测确认），则本 D 零改动仅验证 |
| docs/synova/runbooks/upgrade-data-retention.md | 新建 | **数据目录隔离契约 + 升级语义文档**（派单必答 2/3）：①userData 物理位置（mac `~/Library/Application Support/synova-agent/` 实测 / win `%APPDATA%\synova-agent\` 待 D523 确认）+ data/synova.db 与 logs/；②隔离原理：数据在 userData（系统数据目录），安装包只写 .app/安装目录——两者物理不相交，升级（替换 .app）不触碰 userData → 数据安全；③安装包升级语义：mac dmg 拖拽/替换安装（数据在 ~/Library/Application Support 不动）；win NSIS 覆盖安装（同版本/更高版本保留 AppData；卸载默认不删 userData，除非 deleteAppDataOnUninstall:true——当前配置未设，默认保留 ✅）；卸载重装（删 .app/卸载器跑完再装）数据仍保留；**哪些会清数据**：手动删 userData 目录 / 重装系统 / deleteAppDataOnUninstall 配置；④升级实测步骤（对齐 upgrade-data-verify.sh）+ K3 复核路径 |
| build-synova.cjs | 修改（条件性） | **NSIS 升级语义确认/补强**（派单必答 3）：如实测确认 NSIS 覆盖安装保留 AppData（预期：默认行为保留，无需改）→ **零改动仅文档化**；如实测发现升级清数据 → 补配置（如确认删除卸载器清 userData 的选项：NSIS 卸载器默认不删 userData，若需显式保护可加 nsis 段说明）——编码阶段先跑 upgrade-data-verify.sh 实测再定，spec 不预设改动 |

> 共享资源声明（S-7/S-8）：`scripts/desktop/` 与 D527 共享目录但文件不同（本 D 新建 upgrade-data-verify.sh，D527 新建 first-diagnosis-timing.sh，零交集）；`electron/main.cjs` 为切片 A（D518 已改）+ 切片 B（D522 只验证不改）+ 本 D（单实例锁）共享资源——编码阶段**串行依赖**：等切片 A/B 合入后本 D 才改，改动前重新核验现状（防覆盖他人改动）；`build-synova.cjs` 为切片 A（D517 主改）领地，本 D 条件性触碰。D527/D528 写集零交集，可并行编码（派单）。

## 6. What We Don't Do

| 不做 | 原因 |
|------|------|
| 改 src/ 任何文件（含 src/config.ts） | 派单红线；L5 存储只读消费已就绪（config.ts:90-91 实测），零改动 |
| 改 scripts/audit/ | K3 专属（审计红线，违反=事故） |
| SQLite 损坏修复/恢复逻辑 | 铁律 0-4 backup-db.sh 已有备份链；本 D 只做"损坏 → degraded 提示"的验证（链路已有） |
| 自动更新（electron-updater/publish） | build-synova.cjs publish 注释态（Phase 2 descope，派单 §D528 未要求） |
| 数据目录自定义 UI（设置页改路径） | 保持 env 注入机制（backend-spawn.cjs:107），不做 UI |
| 改 GS-01（run.sh/expect.json） | D527 领地；本 D 只把数据目录静态断言指引到 runbook 实测路径 |
| 卸载器删除 userData 的配置改动（deleteAppDataOnUninstall） | 当前未配置（默认保留 ✅）——若实测确认默认行为满足，零改动 |
| 多实例时"第二个实例做只读"的复杂语义 | 标准做法是 requestSingleInstanceLock 拒绝二次实例（Electron 官方模式），不做降级只读 |

## 7. Test Requirements

**契约（铁律 47，先于实现定义）**——升级数据契约：

```
upgrade-data-verify.sh 契约:
  @input  [--dry-run]（只打印不断言） [--installer <v2 dmg 路径>]（默认 release/ 最新 dmg）
          [--user-data <临时 userData 目录>]（默认 mktemp -d，绝不触碰真实 ~/Library/Application Support/synova-agent）
  @output exit 0 = 数据断言全过（v1/v2 表清单+行数+md5+integrity_check 一致）
          exit 1 = 任一断言失败（evidence 记录失败步，不静默——铁律 24）
          exit 2 = 前置缺失（无 dmg / 缺 hdiutil / 缺 sqlite3）——degraded
          evidence/upgrade-data-<date>/ 下断言原文落盘
  @degraded — 任何失败路径 echo "[upgrade-verify] 失败步骤: <step>: <原因>" + evidence 落盘
  @幂等 — 二次运行走清理路径 exit 0（cleanup 幂等）；--dry-run 无副作用

requestSingleInstanceLock 契约（main.cjs）:
  @behavior 二次启动 → app.quit() + 已有窗口 focus（second-instance 事件）
  @degraded — lock API 异常（罕见）→ 不阻断首实例正常启动（try/catch + log）
```

| 层 | 用例 | 覆盖 | red 前提（改造前） |
|:---|------|------|------|
| L1 单元 | upgrade-data-verify.test.ts: 脚本含 sqlite3 integrity_check + .tables + 行数 + md5 断言命令 | 正常 | 脚本不存在 → 全红 |
| L1 单元 | 脚本含 --dry-run 分支 + 幂等清理（cleanup 幂等） | 边界 | 同上 |
| L1 单元 | 脚本含临时 userData 注入（--user-data / mktemp）且无 `cp data/synova.db`（真实库保护，铁律 0-4） | 边界/红线 | 同上 |
| L1 单元 | 脚本 exit 0/1/2 语义注释 + evidence 落盘路径 | 正常 | 同上 |
| L2a 接线 | 升级实测（切片 A 产物 + LLM 或哨兵数据）: 装 v1 → 造数据（sqlite3 INSERT 哨兵基线/首诊）→ 升级 v2 → `PRAGMA integrity_check`=ok + 表清单/行数/md5 一致 | 正常全链 | 当前无实测路径（GS-01 静态 grep） |
| L2b 降级 | db 损坏 → 服务 healthz 503/起不来 → ensureBackend degraded=true → main.cjs offline 页 + console.error（链路验证：损坏 db 文件注入临时 userData → 起服务 → 断言 degraded） | 降级 | 链路存在但无验证 |
| L2b 降级 | 缺 sqlite3/hdiutil → exit 2 + 显式提示（不静默） | 降级 | 脚本新建 |
| L2c 边界 | 二次启动应用 → 第二实例退出 + 已有窗口聚焦（requestSingleInstanceLock 断言；Mac 实测或测试注入） | 边界 | main.cjs 无锁 |
| L2c 边界 | 卸载重装路径（非覆盖安装）→ 数据仍保留（文档化 + 实测断言） | 边界 | 无文档 |

**verify 命令（物理，非 grep）**:
```bash
npx vitest run tests/electron/upgrade-data-verify.test.ts          # DS1 脚本契约全绿
bash scripts/desktop/upgrade-data-verify.sh --dry-run               # DS5 契约（幂等、无副作用）
bash scripts/desktop/upgrade-data-verify.sh                         # DS2 升级实测（切片 A 产物在库时；evidence 落盘）
npx vitest run tests/electron/                                      # 回归（现有 3 文件 + 新增不破）
```

## 8. Wiring Verification

| 新/改产物 | 生产调用点（实测方法） |
|--------|------|
| upgrade-data-verify.sh | `grep -n "upgrade-data-verify" docs/synova/runbooks/upgrade-data-retention.md` → runbook 引用（K3 1-8 复核路径）；执行产物落 evidence（`ls evidence/upgrade-data-*/`） |
| main.cjs requestSingleInstanceLock | `grep -n "requestSingleInstanceLock\|second-instance" electron/main.cjs` → whenReady 前真实调用（生产调用点；切片 A 合入后重新核验） |
| SYNOVA_DB_PATH 链路（验证） | `grep -n "SYNOVA_DB_PATH" electron/main.cjs electron/backend-spawn.cjs src/config.ts` → main.cjs:130 注入 → backend-spawn.cjs:107 env → config.ts:90 消费（既有链路，本 D 实测验证 + 文档化） |
| runbook | 派单 §D528 验收引用 + K3 复核（1-8 审计员独立重跑依赖 runbook） |

## 9. Architecture Layer

L1 交互层（Electron 桌面端 main.cjs 单实例锁）+ L5 存储（data/synova.db 数据完整性断言）。**边界说明**：upgrade-data-verify.sh 是工程验证脚本（非运行时代码，L1 之外）；main.cjs 单实例锁是 Electron 主进程基建（L1，不触 L2-L5 import）；数据断言通过 sqlite3 CLI 读 userData 库（不 import 任何层）。零跨层违规。

## 10. Completion Standard

1. **DS1**: `npx vitest run tests/electron/upgrade-data-verify.test.ts` 全绿（≥8 用例；red 已证——脚本不存在全红）
2. **DS2**: 升级实测 evidence——装 v1 → 造数据 → 升级 v2 → SQLite 断言一致（表清单 + 关键表行数 + db md5 + `PRAGMA integrity_check`=ok 前后对比；断言原文落 `evidence/upgrade-data-<date>/`，P2-2 指纹落盘）
3. **DS3**: 数据目录隔离契约文档化——runbook 含 userData 物理位置（mac 实测 `~/Library/Application Support/synova-agent/`）+ 隔离原理（数据在 userData，安装包只动 .app，物理不相交）+ 升级语义（dmg 替换安装 / NSIS 覆盖安装保留 AppData / 卸载重装保留）
4. **DS4**: 安装包升级语义文档化——哪些路径清数据哪些不清（手动删 userData / 重装系统 / deleteAppDataOnUninstall 未配置=卸载保留 ✅）；build-synova.cjs 如实测需补配置则补（条件性）
5. **DS5**: 验证脚本可执行——`--dry-run` exit 0 + 幂等（二次运行走清理路径）+ 真实 userData 零触碰（临时目录注入，grep 无 `cp data/synova.db`）
6. **DS6**: 多实例保护——二次启动拒绝新实例 + 已有窗口聚焦（requestSingleInstanceLock 断言）；backend-spawn reused 路径（端口互斥安全网）回归确认
7. **DS7**: db 损坏降级——损坏 db → healthz 不可用 → ensureBackend degraded=true + offline 页 + log（实测断言，不静默——铁律 24/31）
8. **DS8**: 写集外零文件改动（`git diff --name-only` 对账 = 写集 5 文件）；src/ 与 scripts/audit/ 零触碰；task-state/D528.json 回填（spec + impl evidence + `"slice": "L1-C"`）

> 交付声明覆盖 DS1-DS8 逐项标注 ✅/⏸/❌+理由，禁重编号/静默缺项（S-10）。⏸ 项（如切片 A 未合入导致 DS2/DS6 无法跑）须显式标注前置依赖，不伪造实测（派单 §给 dev-doc 的交付要求 3）。

## 11. Auth Doc References

- docs/synova/coordination/派单-L1切片C-D527-D528-20260825.md（§D528 5 必答题 + 验收 + 1-8）
- .claude/PRODUCT-BRIEF.md（§二 / §六 P0）
- docs/synova/research/DSH迁移施工图-20260820/DSH迁移施工图-20260820.md（§3.1 L5 存储 🟢 / electron 🟢）
- .wt-sliceB-specs/docs/synova/audit-reports/2026-08-25-D517-D519.md（K3 切片 A：C2 M7 / P2-2 / G3）
- /Users/wane/synova-wt-sliceA-impl/scripts/desktop/mac-install-verify.sh（D519 实测脚本模式，只读参考；切片 A 合入后路径为 scripts/desktop/mac-install-verify.sh）
- electron/main.cjs（130 行实测）/ electron/backend-spawn.cjs（107 行实测）/ src/config.ts（90-91 行实测）/ build-synova.cjs（81 行实测）
- scripts/golden-scenarios/GS-01-first-diagnosis/run.sh（:129-134 静态断言现状）
- AGENTS.md（铁律 0-2/0-4/4/24/31/47/48）

## 12. 必答题 3 补充——安装包升级语义事实表（编码照此文档化，实测为准）

```
electron-builder 升级语义（NSIS / dmg）:

macOS dmg（当前 build-synova.cjs:65-68）:
  · 安装方式: 挂载 dmg → 拖拽/复制 SynovaAgent.app 到 /Applications
  · 升级: 覆盖替换 /Applications/SynovaAgent.app（同版本/新版本均覆盖）
  · 数据: ~/Library/Application Support/synova-agent/ 不在 .app 内 → 替换不动数据 ✅
  · 卸载重装: 删 .app 再装 → 数据仍在 ~/Library/Application Support ✅
  · 会清数据: 手动删 userData 目录 / 重装系统

Windows NSIS（当前 build-synova.cjs:50-63）:
  · 安装方式: NSIS 安装器（oneClick:false + allowToChangeInstallationDirectory:true）
  · 升级: 运行更高版本安装器 → 覆盖安装 → 保留 %APPDATA%\synova-agent\ ✅（默认）
  · 卸载: 卸载器默认不删 userData（deleteAppDataOnUninstall 未配置 = false）→ 卸载后重装数据仍在 ✅
  · 会清数据: deleteAppDataOnUninstall:true（未配置）/ 手动删 %APPDATA%\synova-agent / 重装系统

验证: 以上为 electron-builder 默认语义，upgrade-data-verify.sh 实测确认（mac 侧切片 A 产物可实测；
      win 侧待切片 B D523 后补测，本 D 文档先行标注"待 win 实测确认"——诚实声明）。
```

## 13. 自检清单（dev-doc 侧，K3 可核）

- [x] 派单 5 必答题逐条覆盖（①升级实测=写集 upgrade-data-verify.sh+DS2 ②数据目录契约=runbook+DS3 ③安装包升级语义=§12 事实表+DS4 ④验证脚本=写集+DS5 ⑤边界降级=单实例锁+db 损坏链路+DS6/DS7）
- [x] 现状全部实测（main.cjs:130/backend-spawn.cjs:107/config.ts:90-91/build-synova.cjs 全文/GS-01 run.sh:129-134/auto-update.test.ts/mac-install-verify.sh 模式 逐文件 read+grep，零凭记忆）
- [x] 基线声明 + 依赖（切片 A 合入）显式；防 D524 M7 漂移（编码前重新核验行号；切片 A 合入后 main.cjs/backend-spawn.cjs/build-synova.cjs 必漂移）
- [x] 共享资源标注（main.cjs 与切片 A/B 共享——串行依赖；scripts/desktop 与 D527 目录共享文件独立；S-7/S-8）
- [x] Done 标准 = 物理命令断言（vitest/升级实测/evidence 落盘），零 grep 冒充（D510 F1；GS-01 静态断言升级为物理实测）
- [x] 决策参考记录（§3 Q1：物理实测优先/标准单实例锁/最小机制——参考系 electron-builder 官方 + Anthropic + 第一性原理）
- [x] 不碰 src/（§6 红线）；不碰 scripts/audit/；build-synova.cjs 条件性触碰（实测先于改动）
- [x] gatekeeper ALL PASS（C1-C6，5 条目写集提取）
