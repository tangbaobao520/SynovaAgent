# Task Brief: D858 — D854/CT-70 审计条件闭环（canary 覆盖语义物理展开 + 绿腿告警可见 + 证据包标准化）

> 生成: 2026-09-21 | 任务卡: task-state/D858.json | 工作树: `.synova-wt-d858` | 分支: `gate/d858-canary-glob`
> 基线: `origin/main cc4e4166`（含已入库的 K3 报告 `docs/synova/audit-reports/2026-09-20-K3-D854.md`）
> 小队固化件 M3：队内结论只写「自验」，独立审计由队外 K3 另做（禁自我审计）。
> 卡面日期 20260920（派单件 `docs/synova/coordination/派单-D858-CT70审计条件闭环-20260920.md`），物理执行日 20260921。

## 项目身份（每次重读 — 源自 CLAUDE.md §项目身份）

SynovaAgent 是一个驻扎企业的 AI 诊断系统。诊断是手段，增长才是目的。
本任务**不碰产品运行时**（零 `src/`）：修的是**控制塔门禁脚本的对账语义**——让 "CI 绿" 不再可能是被注释文本骗来的绿。

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
- 纵向五层（L1-L5）：不涉及，本卡写集零 `src/`、零 `packages/`。
- 横向 Monorepo 包：不涉及。
- **治理层（scripts/control-tower/，施工图 §100 行归属"DSH verify-* 门禁 + hooks 包族"的 🟡 层移植落点）**：本卡只改 canary 对账脚本与其配对测试，不改门禁架构。
- 所属系统：CI 门禁基建（不是 GA 诊断、不是哨兵、不是桌面端）。

### b) 文件审计（开工物理核行，禁凭记忆 — 全部为本 session 实测）

| # | 卡面/审计声称 | 实测命令与输出 | 结论 |
|---|---|---|---|
| 1 | canary 脚本靠字面 grep 收清单，不认 glob | `grep -n "test\.sh" scripts/control-tower/check-canary-drift.sh` → L35 `LISTED=$(grep -oE 'tests/[A-Za-z0-9_/.-]+\.test\.sh' "$CI_YML" \| sort -u)`（`*` 不在字符类内 → glob 行零命中） | ✓ 属实 |
| 2 | 基线条数（K3 报 41→43） | `bash scripts/control-tower/check-canary-drift.sh`（main）→ `测试文件总数: 729 | canary 清单: 41 项`，`⚠ 漂移: 71 个 .test.sh`，exit 0 | ✓ 41 / 729 / 71 |
| 3 | `ci.yml` 在 main 上不含 tests/project | `git show origin/main:.github/workflows/ci.yml \| grep -c tests/project` → `0` | ✓ 故 ci.yml 归 CT-70（PR #682） |
| 4 | PR #682 的 ci.yml 形态（glob + 注释声明 2 条） | `git show fix/d854-ct70-project-tests-ci:.github/workflows/ci.yml` → 非注释行字面路径 **41** 条；注释行命中 **2** 条（gen-project-board / pr-queue-scan）；L284 `PROJECT_TESTS=(tests/project/*.test.sh)`；L304 `bash scripts/control-tower/check-canary-drift.sh \|\| true` | ✓ 基线 41+2(注释)=43 与 K3 一致（**基线口径**）；**覆盖语义确由注释文本承载（P1）**。补正（自验实测，2026-09-21）：`tests/project/*.test.sh` 物理展开 = **3** 个（含 main `cb1bbcaf`#683 引入的 `calc-progress-panel.test.sh`）→ 新脚本正确期望 = 清单 **44** / 漂移 **68**；F12 期望值须由物理展开数推导，禁写死 |
| 5 | 告警可见性载体 | ci.yml（main）L275-277 注释 + L277 调用；`|| true` 吞退出码；PR #682 L291 `> /tmp/ct-out-project.log 2>&1`、L295 仅失败时 `cat` | ✓ K3 §5 P2 属实（绿腿吞 ⚠） |
| 6 | 本卡写集四路径存在性 | `scripts/control-tower/check-canary-drift.sh`（83 行，可执行）/ `tests/control-tower/check-canary-drift.test.sh`（76 行）/ `task-state/D858.json` / 本 brief | ✓ 全部存在 |
| 7 | 权威件已入库 main | `git ls-tree -r --name-only main \| grep audit-reports/2026-09-20-K3-D854.md` → 命中（PR #686 已合，squash `cc4e4166`） | ✓ 前置解除（派单 §〇-d 要求） |
| 8 | 写集与他卡重叠 | 全 169 个 worktree 扫 `check-canary-drift.sh` / `check-canary-drift.test.sh` 未提交改动 → **0 命中**；近 3 天全部分支 `git diff --name-only main...<b>` 扫本卡两文件 → 仅 `chore/d858-closure` 动 `task-state/D858.json` | ✓ 单写者 |
| 9 | 匿名取 job 日志（K3 403 的那条） | `curl -s -o /dev/null -w "%{http_code}" https://api.github.com/repos/tangboobao520.../actions/jobs/<id>/logs` → **403**；同仓库 **check-runs API（200）** 与 **check-runs/<id>/annotations（200，返回 warning/failure 正文）** 匿名可用；`raw.githubusercontent.com` 匿名 200 | ✓ L4-3 可行通道存在（见 Q2/证据包标准） |

### c) 决策
已有覆盖 → 复用（不新建脚本、不新建门禁组；只把"覆盖真相"的来源从**文本 grep** 换成**可执行结构 + 文件系统物理展开**）。
无覆盖 → 无（本卡不引入新机制种类）。
冲突 → 无（写集单写者；`ci.yml` 归 CT-70，本卡不碰）。

## Q1: 调研 — 决策链 + 执行约束

### a) 参考系（铁律 0-2 / 铁律 7）
- 铁律 0-2（spec → test → impl → wire → review → merge）：先写契约与夹具断言，再写实现；最后验"机制被真实调用"。
- 铁律 24/31（降级不静默）：来源缺失仍显式跳过（既有语义保持）。
- 铁律 47/48（契约优先、测试非空壳）：契约见下；夹具含正常/降级/边界三路径 + 新增反证夹具。
- memory/台账教训：`AUDIT-FINDINGS-LEDGER.md` CT-70（tests/project 零 CI 接线＝假绿）、CT-73（写入真实仓库 + 环境敏感假红）、D526（红态无防线感知）、D525（synova-commit 测试红态漏网）。
- **卡面禁令**：禁用 grep 型静态判据当验收（L3 实测 3/5=60%）；**覆盖判定必须来自物理展开**。

### b) Q1c 决策参考系（D333 四步，收敛结论）
① 第一性原理：告警与覆盖结论只有在"可执行结构 + 文件系统"上成立才可信；注释是给人读的声明，不是事实源。
② Anthropic 工程基线：CI 的 fail-closed 必须由**可执行项**承载（负向测试/显式 exit code），声明与实现不一致即失败。
③ 开源实证：GitHub Actions 生态对 glob 覆盖的通行做法是"runner 侧真实展开"（matrix/`nullglob`），不存在"读注释算覆盖"的语义。
④ 收敛检查：不引入新工具、不引依赖、不改 ci.yml；只改 1 个脚本 + 1 个测试 → 最小 blast radius。

### c) DSH 借鉴核查（派单强制三步，cto-handover §〇b）
1. **施工图四色**：`docs/synova/research/DSH迁移施工图-20260820/DSH迁移施工图-20260820.md` §100 行把 `scripts/`（含 control-tower）标为 **🟡 层移植落点**（DSH 侧对应物 = `verify-*` 门禁族 + hooks 包族）；§47/§159 同为 🟡；§328 R6 = 治理层独立排期，不随运行时迁移动门禁。
2. **借鉴边界**：**无代码级借鉴**——本卡修的是 Synova 自有 CI canary 对账语义（ci.yml 密封清单 vs 仓库测试文件），DSH 无对应实现；🟡 的"层移植"属 Stage 3 逐组改写，不在本卡。**红线保持**：不 `npm install @deepseek-ai/dsh`、不 copy DSH 代码。
3. **源码参考**：无（不适用，故不给 file:line——本卡零 DSH 依赖）。**记录原因而非猜测**。

## Q2: 范围 — 正确的最简方案

做什么:
- scripts/control-tower/check-canary-drift.sh — 覆盖语义改造：可执行结构（字面清单 + glob 物理展开）承载覆盖；注释仅作"声明"参与一致性校验；假覆盖 → 报红（exit 1）+ `::error`；告警/摘要写 `$GITHUB_STEP_SUMMARY` 独立通道；保留既有 `::warning` 与既有输出格式。
- tests/control-tower/check-canary-drift.test.sh — 既有断言全保留 + 新增夹具（glob 物理展开 / 注释一致性报红 / 独立通道 / 注释不产生覆盖）。
- task-state/D858.json — 状态与写集登记（队长维护）。
- task-state/D862.json — 后续小卡登记（ci.yml 两处缺陷排期，本卡不实施）。
- .claude/task-briefs/2026-09-21-D858-canary-glob-coverage.md — 本文件（当日 brief + 规格）。
- memory/notes/proposed/2026-09-21-D858-canary-glob-physical-coverage.md — 决策沉淀（铁律 49）。
- docs/synova/coordination/派单-D858-CT70审计条件闭环-20260920.md — 派单件入库（卡面引用可解析）。
- docs/synova/coordination/D858-开工前冲突扫描-20260921.md — M1 冲突扫描原始输出。
- docs/synova/coordination/D858-证据包标准件-匿名取CI证据-20260921.md — L4-3 标准件。
- docs/synova/coordination/收口-D858-canary-glob-20260921.md — M6 收口三件（diff/自验结论/遗留清单）。
- docs/synova/product-lines/evidence/D858-evidence-20260921.md — 证据索引（P1/L4-1/P2/回归/L4-3 逐项）。
- docs/synova/product-lines/evidence/D858-verify-20260921.md — 队内自验结论（独立验证者产出，队长落库）。
- docs/synova/product-lines/evidence/D858-ci-35529862520-ctgate-{ubuntu,windows}.log.txt — CI 归档片段（P2 绿腿可见证据，run 35529862520 双腿 success）。

不做什么（含文件路径，硬边界）:
- 不改 .github/workflows/ci.yml（CT-70/PR #682 与 #657 在飞，单写者规则；`|| true` 吞退出码 + 成功路径回捞 ⚠ → D862 排期）
- 不改 tests/project/gen-project-board.test.sh（#682 写集；其绿腿 ⚠ 回捞随 D862）
- 不改 scripts/audit/audit-check.py（审计红线，K3 专属）
- 不改 src/server.ts（本卡零产品代码）
- 不改 packages/engine-core/package.json（本卡零引擎代码）

范围外说明（非文件排除项，供人读）：整个 `scripts/audit/**` 目录与 src/packages 全域均不在本卡写集；canary 脚本的**漂移告警不阻断**语义（exit 0）保持不变（避免误伤存量 71 条），只对**假覆盖**新增 fail-closed。

## 写集

| 文件 | 类型 |
|---|---|
| `scripts/control-tower/check-canary-drift.sh` | task |
| `tests/control-tower/check-canary-drift.test.sh` | task |
| `task-state/D858.json` | task |
| `task-state/D862.json` | task |
| `.claude/task-briefs/2026-09-21-D858-canary-glob-coverage.md` | task |
| `memory/notes/proposed/2026-09-21-D858-canary-glob-physical-coverage.md` | task |
| `docs/synova/coordination/派单-D858-CT70审计条件闭环-20260920.md` | task |
| `docs/synova/coordination/D858-开工前冲突扫描-20260921.md` | task |
| `docs/synova/coordination/D858-证据包标准件-匿名取CI证据-20260921.md` | task |
| `docs/synova/coordination/收口-D858-canary-glob-20260921.md` | task |
| `docs/synova/coordination/审计提请-D858-K3-复审判-20260921.md` | task |
| `docs/synova/coordination/AUDIT-FINDINGS-LEDGER.md` | task |
| `docs/synova/product-lines/evidence/D858-evidence-20260921.md` | task |
| `docs/synova/product-lines/evidence/D858-verify-20260921.md` | task |
| `docs/synova/product-lines/evidence/D858-ci-35529862520-ctgate-ubuntu.log.txt` | builtin（CI 运行产物归档） |
| `docs/synova/product-lines/evidence/D858-ci-35529862520-ctgate-windows.log.txt` | builtin（CI 运行产物归档） |

## Q3: 验收 — 入口 → 交互 → 结果

- **入口**：`bash scripts/control-tower/check-canary-drift.sh`（CI 里由 CT Gate job 调用，PR #682 合入后同一调用点）。注入缝：`SYNO_TESTS_DIR` / `SYNO_CI_YML` / `GITHUB_STEP_SUMMARY`。
- **交互**：脚本解析 ci.yml →（a）剔注释取可执行项（字面 + glob）→（b）glob 按文件系统物理展开 →（c）与仓库测试文件全集对账 →（d）注释声明 vs 物理覆盖一致性 →（e）输出漂移/幽灵/假覆盖 + `::warning`/`::error` + step summary。
- **结果**：① 覆盖真相可追溯到可执行结构与真实文件；② 假覆盖报红（exit 1）且注解可见；③ 告警在**绿腿**可见（独立通道，stdout 被重定向也不丢）；④ 既有 41 条/71 条漂移判定不变。

## 契约（铁律 47，先契约后实现）

```
@input  — 无参。注入缝：SYNO_TESTS_DIR（默认 $ROOT/tests）、
          SYNO_CI_YML（默认 $ROOT/.github/workflows/ci.yml）、
          GITHUB_STEP_SUMMARY（CI 独立通道；未设 → 不写，本地零副作用）
@output — (a) 漂移清单（仓库有、可执行覆盖未含的 .test.sh）
          (b) 幽灵清单项（覆盖集合含、文件不存在）
          (c) 假覆盖清单（注释声明的测试路径/glob 未被物理覆盖）— D858/K3 P1+L4-1
          (d) ::warning（漂移/幽灵）/ ::error（假覆盖）注解 → CI annotations 面板
          (e) GITHUB_STEP_SUMMARY markdown 摘要（绿腿可见，不依赖 stdout）— K3 P2
@exit   — 0 = 无假覆盖（漂移/幽灵仅告警；来源缺失显式跳过——存量语义不变，防误伤）
          1 = 假覆盖（注释声明未被物理覆盖）→ 报红（fail-closed，新增）
@degraded — ci.yml / 测试目录缺失 → 显式 ⚠ 提示 + exit 0（既有语义保持，铁律 11 显式不静默）
@error  — 不新增错误码；解析失败不得静默（走显式提示路径）
```

### 覆盖语义规范（P1 / L4-1 判定口径，逐条可测）

- **S1 唯一覆盖来源**：仅**非注释行**（`^[[:space:]]*#` 之外）的可执行项计入覆盖：
  - S1a 字面量测试路径（`tests/.../x.test.sh`）；
  - S1b glob 模式（如 `tests/project/*.test.sh`、`tests/**/*.test.sh`）→ **按文件系统物理展开**，每个真实命中文件计入覆盖（`nullglob`；零命中不得当"已覆盖"）。
  - S1c 注释行**不产生覆盖**；行尾 `#` 之后的内容按注释处理（防行尾注释注入覆盖）。
- **S2 假覆盖（exit 1）**：注释行中声明的测试路径/glob → DECLARED；若 DECLARED 任一条不在物理覆盖集合（S1）内 → 假覆盖 → `::error title=canary-fake-coverage::...` + exit 1。
- **S3 漂移（仅告警）**：仓库 `.test.sh` 不在物理覆盖集合内 → 点名 + `::warning`，exit 0（存量 71 条不阻断）。
- **S4 幽灵（仅告警）**：覆盖集合中的路径在文件系统不存在 → 点名 + `::warning`，exit 0。
- **S5 独立通道（P2）**：`GITHUB_STEP_SUMMARY` 非空可写时，把漂移/幽灵/假覆盖摘要以 markdown 追加进去；stdout 被重定向（`> /dev/null` 或 CI 的 `> /tmp/xxx.log`）时摘要仍完整。
- **S6 跨平台**：仅用 bash + POSIX 工具；不依赖 GNU-only sed 扩展（BSD sed 无 `\+` → 用 `-E`）；中文紧贴变量用 `${VAR}`；`grep -c` 配 `tr -d '\n\r'` 防 "0\n0"。

## 夹具矩阵（tests/control-tower/check-canary-drift.test.sh，先红后绿两次原始输出）

| # | 夹具 | 期望 |
|---|---|---|
| F1 正常 | 沙箱 yml 有 1 条字面 + 1 个漂移项 gamma | 点名 gamma + `::warning` + exit 0（既有断言保留） |
| F2 通过 | 清单补齐 gamma | 「零漂移」+ exit 0（既有） |
| F3 边界 | 清单含已删文件 beta | 幽灵项点名 beta（既有） |
| F4 降级 | `SYNO_CI_YML` 指向不存在文件 | 显式「跳过」+ exit 0（既有） |
| F5 真机 | 本仓库真实 ci.yml | exit 0；漂移曝光或零漂移（既有） |
| **F6 P1-glob 物理展开** | 沙箱 yml：`PROJECT_TESTS=(tests/project/*.test.sh)` + tests/project 下 2 个 .test.sh | 二者**不出现在漂移清单**；假覆盖 0；exit 0 |
| **F7 P1 反证（先红）** | 删掉 F6 的 glob 行（模拟接入被回退），**注释仍声明那 2 条** | 假覆盖报红：`::error title=canary-fake-coverage` + **exit 1** |
| **F8 L4-1 注释声明 > 物理展开** | 注释声明 2 条，glob 仅展开 1 条 | exit 1 + 点名未覆盖的那条 |
| **F9 注释不产生覆盖** | 仅注释声明路径、无可执行项 | 该文件既进漂移（S3）又进假覆盖（S2）→ exit 1 |
| **F10 P2 独立通道** | `GITHUB_STEP_SUMMARY=$TMPD/sum.md`，stdout 重定向 `>/dev/null` | summary 文件含漂移/假覆盖文本（证明不依赖 stdout） |
| **F11 回归（基线 vs 闭环后）** | main 真实 ci.yml | 清单 41 项、漂移 71 条、exit 0 —— 与基线**逐字相同** |
| **F12 #682 预演** | `git show fix/d854-ct70-project-tests-ci:.github/workflows/ci.yml` 作为输入的临时副本 + 真实 tests/ | 清单 **41 + N**（N = `ls tests/project/*.test.sh \| wc -l` 的物理展开数，**2026-09-21 实测 N=3**）、假覆盖 0、exit 0、漂移 = 112 − 清单数（**68**）。**禁止把 43/69 写死**——43/69 是基线（注释当覆盖）的数字：`calc-progress-panel.test.sh` 由 main `cb1bbcaf`（#683）引入后，注释只声明 2 条，基线漏计该文件即 K3 P1 的假绿本体 |

## 架构层: 治理层（scripts/control-tower，非 L1-L5 运行时）

## Done 标准
- [ ] **P1**：glob 物理展开生效，覆盖语义不再由注释承载；F6/F7 先红后绿两次原始输出齐全（F7 必须 exit 1）。
- [ ] **L4-1**：F8/F9 夹具存在且报红（exit 1 + `::error`）。
- [ ] **P2**：F10 证明告警走独立通道（stdout 重定向仍可见）；**并**给一次真实 CI 绿腿运行的可见性证据（run/job id + 匿名可核命令输出 + 归档日志片段）。
- [ ] **L4-3**：证据包标准件成文（匿名/无 token 取 job 级告警/失败文本的**一条命令** + 示例输出 + sha256）。
- [ ] **回归**：F11 与基线逐字一致（`41` / `71` / exit 0）；F12 对 #682 ci.yml 预演绿（清单 = 41 + 物理展开数 N，**实测 N=3 → 44**；漂移 `68`；假覆盖 0）。
- [ ] 既有测试断言零删除；`bash tests/control-tower/check-canary-drift.test.sh` 全绿（结果行 `N 通过, 0 失败`）。
- [ ] 队内自验（非编码者）独立复核 + 反向验收（抽掉修复必须报红）两次原始输出。
- [ ] M6 三件（diff / 自验结论 / 遗留清单）**提交进仓库**并给路径；归属收口；交付附 `git ls-remote` 回执。
