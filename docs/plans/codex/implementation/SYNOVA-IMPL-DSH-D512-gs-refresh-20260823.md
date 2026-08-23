---
north-star:
  服务用户: 创始人（看产品完成度仪表盘）+ CTO（部署轨验证层决策）——痛点：8 个 GS 场景证据全是 08-19~08-23 的，此后 main 已进 D505 哨兵自检/D508 减负/D504 electron 等——证据 stale（calc-progress A1: 证据日期后线 modules 有 git 变更 → 自动失效），产品完成度数字停在 08-17（4%，L1 桌面端 0/8）不反映现实
  服务场景: D504/D505/D508 合并后 → 全量重跑 8 个 GS 场景 → 新证据（带时间戳 + main sha）→ refresh-all.sh 重算 → product-progress.json 真实反映 26 线完成度（L1/L3 因 GS-01/08 绿而上调）→ 过时 todos（T-8-01 类）被消化
  模块终态: 部署轨验证层收官——run-all.sh 全量入口（按依赖排序、支持 --skip）；证据带 main sha（A1 失效可精确归因）；GS-02/04 诚实 RED 记录（不假装绿）；progress.json 与代码现实一致；CI（push main）自动跑 GS
  对齐北星: PRODUCT-BRIEF §六 P0（真实数据流/报告质量验证）+ 派单"部署轨优先（Track A 永不被阻塞）"——GS 场景绿 = 验收点证据 = 产品完成度真实；A1 证据失效机制（calc-progress.py EVIDENCE_TTL_DAYS=14）保证数字不撒谎
  完成标准: ①8 场景当前 main 全重跑，证据带时间戳 + main sha（GS-01 等 D510 合并后或前后各一次，spec 声明）②product-progress.json 重算，26 线完成度真实反映（L1/L3 因 GS-01/08 绿而上调）③过时 todos（T-8-01 类）被重算消化或显式保留理由④GS-02/04 诚实 RED 记录（不假装绿）
  当前进度: 8 场景 evidence 全有但 GS-02/04 = fail（派单"全部有 pass 证据"不实——实测 GS-02 demand-shift critical 未触发 / GS-04 hr-upload 映射错位）；GS-07 README 说"契约级 RED 2/3"但 evidence verdict=pass（README 与证据不一致）；run-all.sh 不存在；product-progress.yml 已有 push main 触发 A1/A4（派单"只有周五定时"过时）；progress.json 停 08-17（4%）
---

<!--
  SYNOVA-IMPL-DSH-D512: GS 场景全量刷新 + 进度重算（部署轨验证层收官）
  状态: dev doc | 2026-08-23 | 优先级 P1（部署轨优先；todos 判定挂在这）
  权威文档: 并行派单 97f85b20 + scripts/golden-scenarios/README.md（GSS 运行契约 8 条）+ calc-progress.py（A1 证据失效）+ 产品进度设计 v1.4 + AGENTS.md 铁律 0-4（数据资产）
  依赖: D510（GS-01 断言诚实性在修）——GS-01 重跑等 D510 合并，其余 7 场景先行
  并行: 与 D510 有 GS-01 交叉（spec 声明）；与 D511（scripts/ 门禁）零重叠
-->

# SYNOVA-IMPL-DSH-D512: GS 场景全量刷新 + 进度重算

> 一句话问题: 产品完成度数字**不反映代码现实**——8 个 GS 场景证据全在 08-19~08-23（此后 main 进 D505/D508/D504 等），A1 已让大部分证据 stale；progress.json 停在 08-17（4%，L1 桌面端 0/8 但 D504 已实现）；且**派单"全部有 pass 证据"不实**（实测 GS-02/04 = fail）。部署轨验证层需要一次全量诚实刷新：重跑 → 新证据（带 sha）→ 重算 → 数字与代码一致。

## 1. Authority Doc Verification

**来源**: [并行派单](docs/synova/coordination/派单-并行-D511-D512-20260823.md)（97f85b20，任务 2）

> 现状: 8 个 GS 场景全部有 pass 证据（evidence/*.json——但全是 08-21/08-22 的，此后 main 已进 D505/D508/D504）。疑点: 证据 stale——尤其 GS-01 的 L1-1 断言是静态 grep（D510 正在修），GS-06 依赖的 loop 执行体（Win D475）状态未知。验收: ①8 场景在当前 main 全部重跑，证据带时间戳+main sha ②product-progress.json 重算，26 线完成度真实反映 ③过时 todos 条目（T-8-01 类）被重算消化或显式保留理由。并行性: 与 D510 有 GS-01 交叉——GS-01 的重跑等 D510 合并后执行（其余 7 场景先行），或接受 D510 修复前后各跑一次。

**来源**: [GSS 运行契约](scripts/golden-scenarios/README.md)（8 条）

> 1. fresh-db（临时库，测后删除；真实库只读；禁止 cp data/synova.db——铁律 0-4）2. bootstrap 服务（临时端口；就绪探测 healthz）3. inject fixture 4. 触发 5. 断言（≥3 条：正常+降级+≥1 负向）6. 证据产物写 evidence/GS-XX-<date>.json（git 跟踪）7. exit 0 = 全部断言过；exit 1 = 任一失败 8. 幂等。证据目录: evidence/GS-XX-YYYYMMDD.json；有效期 14 天；证据日期后相关线代码有 git 变更 → 自动标"待重跑"（A1）。

**来源**: [calc-progress.py A1](scripts/product-lines/calc-progress.py)（L4/L33/L67）

> git 事实: git log --since=<证据日期> --name-only -- <线 modules>（A1 惰性失效）；stale 🟡 待重跑（证据过期 >14 天，或证据日期后相关代码有变更，A1）；EVIDENCE_TTL_DAYS = 14；场景/测试类证据: 日期后该线 modules 有 git 变更 → stale（自动失效，不继承旧绿）。

**来源**: [evidence-writer.py](scripts/product-lines/evidence-writer.py)（schema=1 契约——A2 CI 工具；**场景证据实际由 [assert.ts](scripts/golden-scenarios/common/assert.ts) 产出**，`--out` 默认 evidence/ 目录）

> @output — <out-dir>/<type>-<date>[-n].json（证据记录，schema=1；同日同类递增序号防覆盖）。schema 字段: schema/record_type/scenario_id/source/date/verdict/verdicts/assertions——**无 main sha 字段**。

## 2. Problem Statement

部署轨验证层四个实测断点（2026-08-23）：
1. **证据 stale**：8 场景 evidence 日期 08-19~08-23，此后 main 进 D505（sentinel/）、D508（scripts/）、D504（electron/）等——A1 判定"证据日期后线 modules 有 git 变更 → stale"，大部分证据已失效（product-progress.json 停 08-17 未重算）。
2. **派单"全部 pass"不实**：evidence 实测 GS-02 = fail（`demand-shift-critical-triggered` 断言 `contains "severity":"critical"` 未命中）、GS-04 = fail（hr-upload 映射错位）——"8 场景全部有 pass 证据"是错误表述。
3. **GS-07 自相矛盾**：README 写"契约级 RED 2/3（D338 前置未落地）"，但 evidence/GS-07-2026-08-23.json verdict=pass——README 与证据不一致（哪个是真？需刷新核实）。
4. **进度数字失真**：product-progress.json generated_at=08-17，product_progress_pct=4，L1 桌面端 verified=0/8——但 D504 已实现 + GS-01 pass 证据在——数字不反映现实（08-17 后 push 触发 A1/A4 未生效或 bot PR 未合并）。

## 3. Q0-Q4

### 3.1 Q0 定位 — 项目拼图 + 文件审计

**a) 项目拼图**: 部署轨验证层（GS 场景 + 产品进度链）。场景绿 = 验收点证据 = 26 线完成度。本任务 = 验证层收官：全量刷新（重跑）+ 证据规范（sha）+ 重算联动 + CI 接入。

**b) 文件审计**（grep/read 实测，2026-08-23）:
| 文件 | 现状 | 复用/扩展/新建 |
|------|------|------|
| scripts/golden-scenarios/evidence/ | 11 个 JSON（GS-01~08，08-19~08-23；GS-02/04 = fail；GS-07 08-23 pass） | 新证据覆盖写（日期命名自动区分） |
| scripts/golden-scenarios/run-all.sh | **不存在** | 新建（全量入口） |
| scripts/product-lines/evidence-writer.py | schema=1（A2 CI 工具）；场景证据由 assert.ts 产出 | 只读（本任务不扩展——main_sha 由 run-all.sh 内联补字段） |
| .github/workflows/product-progress.yml | push main 触发 A1/A2/A4 + 周五 + workflow_dispatch（派单"只有周五"**过时**） | 扩展（GS 跑接入 push main） |
| docs/synova/product-lines/product-progress.json | 08-17（4%，L1 0/8） | 重算（refresh-all.sh） |
| docs/synova/product-lines/todos.yaml | T-1-01/T-3-01/T-8-01 等挂 GS 验收点 | 重算消化（aggregate-todos） |
| scripts/golden-scenarios/GS-07-data-security/README.md | "契约级 RED 2/3" 与 evidence pass 矛盾 | 核实统一 |
| src/agent/loop-handlers.ts（GS-06 依赖） | **已在 main**（D475 交付，派单"状态未知"过时） | 只读确认 |

**c) 决策**: 刷新 = 诚实记录现状（fail 不假装绿）；GS-01 与 D510 交叉按派单声明分批；派单过时假设（全部 pass/只有周五/GS-06 状态未知）以实测为准并写入 spec。

### 3.2 Q1 调研 — 业界最佳实践 / Anthropic 决策链 / memory 教训

**业界最佳实践**:
- **证据带构建/环境指纹**: CI 产物（测试报告/截图）应带 commit sha + 时间戳（业界 CI 惯例）——本任务证据加 main sha，A1 失效归因精确。
- **诚实 RED 不假装绿**: K3 审计纪律（GS-07 README 的诚实 RED 声明是正确先例）——刷新时 fail 场景如实记录，映射修复任务（D355 链路等）。
- **全量入口 + 分批执行**: 测试套件全量入口（如 pytest/make test）支持选择性跳过（--skip）——GS-01 等 D510 用 --skip 分批。

**memory/ 教训**:
- D446-D449（GS 场景交付）: 场景脚本 = Harness 代码 → 进审计范围；证据只入 git，不靠"我记得跑过"。
- 派单信息过时（"全部 pass"/"只有周五"）: claim-verifier 纪律——派单描述 ≠ 代码现实，全部以实测为准。
- 铁律 0-4（数据资产）: 场景运行绝不 cp data/synova.db；fresh-db 临时库。

**收敛**: 全量入口（run-all.sh）+ 诚实记录（fail 不假装）+ sha 证据（A1 精确）+ 分批（GS-01 等 D510）。**参考：Anthropic（机器可验证据 + fail-closed）+ DeepSeek（最少机制——复用 common/ 基建）+ 第一性原理（完成度数字 = 证据的诚实聚合）**。

### 3.3 Q2 范围 — 正确的最简方案

**做什么**（对应写集 §5.1）:
1. 新建 `scripts/golden-scenarios/run-all.sh`——全量入口（默认 8 场景，按依赖排序；`--skip gs01` 分批；`--dry-run` 只打印计划）
2. 编码 session 实跑刷新（当前 main）→ 新证据 JSON（带 main sha）
3. 证据 schema 扩展 main_sha 字段（run-all.sh 内联补字段，向后兼容 schema=1——不改 assert.ts/evidence-writer.py）
4. `product-progress.yml` 接 GS 跑（push main job 加 run-all.sh 步骤，失败不阻断 A1/A4）
5. `refresh-all.sh` 联动重算 → product-progress.json + todos.yaml 消化
6. GS-07 README vs evidence 不一致核实统一

**不做什么**（详见 §6）: 不修 GS-02/04 的哨兵/上传业务逻辑（刷新=记录，修复=另起任务）；不改 8 个场景断言本身（除 GS-01 等 D510）；不动 D510 领地（GS-01 断言诚实性归 D510）。

### 3.4 Q3 验收 — 入口 → 交互 → 结果

- **入口**: `bash scripts/golden-scenarios/run-all.sh`（编码 session 实跑；CI 为 push main 自动触发）
- **交互**: 8 场景逐场景跑（fresh-db → bootstrap → inject → 断言 → evidence）；GS-02/04 fail 如实记录；GS-01 等 D510（--skip 分批）
- **结果**: 新 evidence（时间戳 + main sha）+ refresh-all.sh 重算 → product-progress.json 真实反映（L1/L3 上调）+ todos 过时条目消化 + CI 接入

### 3.5 Q4 契约与测试（铁律 47/48 — 写代码前定义）

**run-all.sh 契约**:
```
@input  [--skip <scenario-id,...>] [--dry-run] [--out-dir <path>]
        --skip: 逗号分隔场景跳过（GS-01 等 D510 合并；GS-02/04 fail 可单跑复验）
        --dry-run: 只打印执行计划（场景顺序 + 依赖）不实际跑——CI/测试可安全调用
@output exit 0 = 全部场景 exit 0；exit 1 = 任一场景 fail（诚实——不掩盖）
        evidence: evidence/GS-XX-<date>.json（每场景独立文件，schema=1 + main_sha 字段）
@degraded — 场景因环境不可跑（如 bootstrap 失败）→ 记 refresh 报告 + 该场景标 skipped/error（不假装 pass）
@error    — 无（逐场景独立退出码，汇总）
```

**证据 schema 扩展（向后兼容）**:
```
现有: schema=1, record_type=scenario, scenario_id, source, date, verdict, verdicts, assertions
新增: main_sha: <8 位 git sha>（run-all.sh 注入：git rev-parse --short HEAD）
      refreshed_at: <ISO 时间戳>（区别于断言 date）
兼容: calc-progress.py 只读既有字段，新增字段不破坏（编码 session 验证）
```

## 4. Current State — 代码审计（2026-08-23 grep/read 实测）

### 4.1 缺陷 A（P1）: 证据 stale + 派单"全部 pass"不实（GS-02/04 = fail）

evidence 实测（scripts/golden-scenarios/evidence/）:
| 场景 | verdict | 日期 | 关键断言 |
|------|---------|------|---------|
| GS-01 | pass | 08-22 | 契约级 3 条 + Electron 4 条（L1-1 静态 grep，D510 在修） |
| **GS-02** | **fail** | 08-21 | `demand-shift-critical-triggered`: contains `"severity":"critical"` **未命中** |
| GS-03 | pass | 08-22 | 现金流阈值告警（D355/D453 修复链已合） |
| **GS-04** | **fail** | 08-21 | hr-upload 映射错位（GS-02/D355 同型） |
| GS-05 | pass | 08-21 | 告警闭环（D463/D354） |
| GS-06 | pass | 08-22 | 进化闭环（D333 loop-3/5 在 main） |
| GS-07 | pass | 08-23 | **README 说 RED 2/3 但 evidence pass——矛盾** |
| GS-08 | pass | 08-22 | 报告可读（模板 K3 定稿） |

> 证据日期后 main 变更（D505 sentinel/、D508 scripts/、D504 electron/）→ A1 判定大部分已 stale。

### 4.2 缺陷 B（P1）: 进度数字失真（progress.json 停 08-17）

[product-progress.json](docs/synova/product-lines/product-progress.json): generated_at=08-17 16:56，product_progress_pct=4，L1 桌面端 verified=0/8——08-17 后 product-progress.yml 的 push 触发（A1/A4）未反映（bot PR 未合并或未触发）。数字不反映 D504/D505 交付后的现实。

### 4.3 缺陷 C（P1）: GS-07 自相矛盾（README RED vs evidence pass）

[GS-07 README](scripts/golden-scenarios/GS-07-data-security/README.md): "D338 前置未落地（契约网关/orgId 别名表零实现）——本场景为**契约级 RED 2/3**"；但 [evidence/GS-07-2026-08-23.json](scripts/golden-scenarios/evidence/GS-07-2026-08-23.json) verdict=pass。**二者必有一假**——刷新时核实（若断言是"缺 JWT → 401"类负向契约则 pass 合理但 README 措辞过时；若断言声称数据安全全链路则证据造假）。编码 session 刷新时如实记录并统一。

### 4.4 缺陷 D（P2）: 派单过时假设（以实测为准）

| 派单假设 | 实测 | 影响 |
|---------|------|------|
| "8 个 GS 场景全部有 pass 证据" | GS-02/04 = fail | 刷新要诚实记录，不假装绿 |
| "product-progress.yml 现在只有周五定时" | 已有 push main 触发 A1/A4 + workflow_dispatch | CI 接入 = 加 GS 跑步骤，非加触发 |
| "GS-06 依赖的 loop 执行体（Win D475）状态未知" | src/agent/loop-handlers.ts 已在 main（EXISTS） | GS-06 无此阻塞 |

### 4.5 接线现状（真实调用方，grep 实测）

| 符号 | 位置 | 说明 |
|------|------|------|
| assert.ts | scripts/golden-scenarios/common/assert.ts | 场景证据产出（--out evidence/GS-XX-<date>.json，schema=1）——main_sha 由 run-all.sh 补 |
| calc-progress.py | scripts/product-lines/calc-progress.py | A1 失效检测（EVIDENCE_TTL_DAYS=14）+ A4 重算 |
| refresh-all.sh | scripts/product-lines/refresh-all.sh | 一键刷新（A1/A3/A4/A5）——run-all 后联动 |
| product-progress.yml | .github/workflows/product-progress.yml | push main → A1/A2/A4 + bot PR（GS 跑接入点） |
| aggregate-todos.py | scripts/product-lines/aggregate-todos.py | todos 聚合（过时条目消化） |
| run.sh（8 场景） | scripts/golden-scenarios/GS-0X-*/run.sh | 各自独立（common/ 基建复用） |

## 5. What We Build

### 5.1 写集 (3 修改 + 2 新建)

| 文件 | 操作 | 说明 |
|------|:---:|------|
| [scripts/golden-scenarios/run-all.sh](scripts/golden-scenarios/run-all.sh) | 新建 | 全量入口：按依赖/独立性排序（GS-03/05 先——共享模式基准；GS-02/04 独立；GS-06 依赖 loop；GS-07/08 独立；GS-01 最后/可 skip）；--skip/--dry-run；逐场景独立退出码汇总；场景跑完后用 python 给证据 JSON 补 `main_sha` 字段（assert.ts 产出后再注入，零改 assert.ts） |
| [.github/workflows/product-progress.yml](.github/workflows/product-progress.yml) | 修改 | push main job 加「跑 GS 场景」步骤（`bash scripts/golden-scenarios/run-all.sh --skip=gs01` 先行——D510 合并后去掉 skip；**失败不阻断** A1/A4 重算，fail-closed 记日志；CI 环境 bootstrap 可跑性以实测为准） |
| [scripts/golden-scenarios/evidence/](scripts/golden-scenarios/evidence/) | 修改 | 新证据 JSON（8 场景重跑产物，assert.ts 产出 + run-all 补 `main_sha`/`refreshed_at`；日期命名自动与旧文件区分，不覆盖旧证据——历史可对比） |
| [docs/synova/product-lines/product-progress.json](docs/synova/product-lines/product-progress.json) | 修改 | refresh-all.sh 重算产物（编码 session 跑，真实反映 L1/L3 等线） |
| [docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D512-gs-refresh-20260823.md](docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D512-gs-refresh-20260823.md) | 新建 | 本 dev doc |

> 并行写集声明（verify-parallel 可查）: 本写集与 D510（electron/* + GS-01 run.sh + task-state）**仅 GS-01 相关证据文件潜在交叉**——run-all.sh 用 `--skip gs01` 分批规避；与 D511（scripts/control-tower/* + pre-commit-check.sh + VERSION.md）零重叠。`run-all.sh` 在 scripts/golden-scenarios/（非门禁目录，D511 检测面不命中——互不触发）。

### 5.2 修复模式（编码 session 实现蓝图）

**run-all.sh（全量入口，核心）**:

```bash
#!/bin/bash
# run-all.sh — GS 场景全量刷新入口（D512）
# 契约: 逐场景独立退出码；--skip 分批；--dry-run 计划模式；证据注入 main_sha
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKIP=""          # --skip gs01,gs07
DRY_RUN=0
MAIN_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")"
# 执行顺序（依赖/独立性排序）: 共享模式基准先行，GS-01 最后（D510 交叉，默认 skip）
ORDER=(gs03 gs05 gs02 gs04 gs06 gs07 gs08 gs01)
for arg in "$@"; do
  case "$arg" in
    --skip=*) SKIP="${arg#*=}" ;;
    --dry-run) DRY_RUN=1 ;;
  esac
done
[ "$DRY_RUN" = 1 ] && { echo "计划: ${ORDER[*]}（skip=$SKIP, sha=$MAIN_SHA）"; exit 0; }
FAIL=0
for id in "${ORDER[@]}"; do
  case ",$SKIP," in *",$id,"*) echo "⏭ skip $id"; continue;; esac
  dir="$(ls -d "$SCRIPT_DIR"/GS-*-*/ 2>/dev/null | grep -i "$id" | head -1)"
  echo "── $id"
  if (cd "$SCRIPT_DIR" && bash "$dir/run.sh"); then
    # 场景证据由 assert.ts 产出（--out scripts/golden-scenarios/evidence/GS-XX-<date>.json）
    # run-all 补 main_sha/refreshed_at 字段（零改 assert.ts——向后兼容）
    python3 - "$MAIN_SHA" <<'PYEOF'
import json, glob, sys, os
sha = sys.argv[1]
files = sorted(glob.glob("evidence/*.json"), key=os.path.getmtime)
if files:
    p = files[-1]  # 刚产出的最新证据（场景刚跑完）
    d = json.load(open(p, encoding="utf-8"))
    d["main_sha"] = sha
    d["refreshed_at"] = __import__("datetime").datetime.now().isoformat(timespec="seconds")
    json.dump(d, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
PYEOF
  else
    echo "❌ $id FAIL（诚实记录，不假装绿）"
    FAIL=1
  fi
done
exit $FAIL
```

> ⚠️ 关键纪律: **场景 fail 不阻断刷新**——fail 场景如实记 evidence（verdict=fail，诚实 RED），刷新报告列出根因映射（GS-02 demand-shift 阈值链 / GS-04 映射错位——均疑似 D355 链路，GS-03 已绿说明链路主体可用，刷新时复验）。修复 = 另起任务（本任务只记录，遵守"刷新=诚实记录"）。

**证据 schema 扩展（向后兼容）**:

```json
{
  "schema": 1,
  "record_type": "scenario",
  "scenario_id": "GS-01",
  "source": "run-all 2026-08-23",
  "date": "2026-08-21",
  "main_sha": "97f85b20",
  "refreshed_at": "2026-08-23T23:00:00+08:00",
  "verdict": "pass",
  "verdicts": [...],
  "assertions": [...]
}
```

> run-all.sh 用 python 给 assert.ts 产出的证据 JSON 补 `main_sha`/`refreshed_at`（向后兼容——calc-progress.py 只读既有字段）；编码 session 跑一次 refresh-all.sh 确认新证据被 A1/A4 正常消费。

**CI 接入（product-progress.yml push main job）**:

```yaml
- name: GS 场景刷新（诚实记录，不阻断进度重算）
  run: |
    bash scripts/golden-scenarios/run-all.sh --skip=gs01 || echo "GS 部分失败——如实记录，不阻断 A1/A4（fail-closed 日志）"
  # GS-01 等 D510 合并后去掉 --skip=gs01；CI bootstrap 可跑性以实测为准（GS-03/05 有 CI 先例则直接跑）
```

**GS-07 矛盾处置**: 刷新时核实 README vs evidence——若断言全过（负向契约类）→ 更新 README（"契约级 RED"→"契约级 PASS，D338 前置仍缺"）；若证据造假 → 重跑修正。**以刷新实测为准，统一 README 与 evidence**。

### 5.3 决策参考（S-12，本任务决策点）

| 决策点 | 选项 | 参考系 | 结论 |
|--------|------|--------|------|
| GS-01 与 D510 交叉 | A --skip gs01 分批（D510 合并后跑）/ B 前后各跑一次 | 派单声明（"等 D510 合并后执行，或接受前后各跑一次"）+ 并行性（verify-parallel） | **A**——run-all.sh 默认 skip gs01（D510 未合 main）；D510 合并后编码 session 补跑 GS-01 并单独记录（无需改 run-all 默认） |
| fail 场景处置 | A 诚实 RED 记录（不阻断刷新）/ B 阻断刷新等修复 | K3 纪律（诚实 RED 先例 GS-07 README）+ 部署轨优先（Track A 永不被阻塞） | **A**——fail 记 evidence（verdict=fail）+ 刷新报告根因映射；修复另起任务 |
| 证据 schema | A 加 main_sha 字段（向后兼容）/ B 新 schema=2 | 最小机制（calc-progress 只读既有字段）+ 兼容性（旧证据不失效） | **A**——新增字段不破坏 schema=1 消费 |
| CI 接入形态 | A push main 加 GS 步骤（失败不阻断）/ B 独立 job 硬阻断 | 部署轨优先（进度重算不能被 GS fail 阻塞）+ A1 语义（证据失效≠进度停摆） | **A**——GS 跑是证据刷新，A1/A4 重算是主流程，GS fail 记日志不阻断 |

> 收敛检查：四决策点双参考系指向一致，无分歧。**参考：Anthropic（诚实证据 + fail-closed）+ DeepSeek（最少机制 + 反内卷）+ 第一性原理（完成度 = 证据的诚实聚合）**。

### 5.4 编码 session 实现时需再确认的项

1. **GS-02/04 fail 根因复验**：刷新时先单跑 GS-02/GS-04 确认是否仍 fail——若 D355 修复链（GS-03 已绿）让它们转绿 → 新证据 pass；若仍 fail → 诚实 RED + 根因记录（demand-shift 阈值未触发 / hr-upload 映射）。
2. **GS-07 README vs evidence 核实**：刷新时对照断言——pass 的断言是什么（负向契约 or 全链路），统一 README 措辞。
3. **CI bootstrap 可跑性**：ubuntu runner 上 GS 场景的 bootstrap（临时服务 + 端口）是否可跑——GS-03/05 在 CI 有先例则直接全跑；无先例 → 首批 CI 只跑 dry-run + 本地证据入库。
4. **GS-06 的 loop 依赖**：D475 loop-handlers 已在 main（实测 EXISTS）——刷新时确认 GS-06 不因此阻塞；若 run.sh 注释与实际不符，编码 session 记录。

## 6. What We Don't Do

| 不做 | 原因 |
|------|------|
| 不修 GS-02/04 的哨兵/上传业务逻辑（demand-shift 阈值、hr-upload 映射） | 刷新 = 诚实记录现状；修复 = 另起任务（D355 链路主体已绿，属后续修复，非本任务） |
| 不改 8 个场景断言本体（除 GS-01 归 D510） | 场景断言是验收点证据的语义；改断言 = 改验收标准（需单独评审） |
| 不动 GS-01 的 L1-1 断言诚实性 | D510 领地（正在修）——本任务只做 --skip 分批规避 |
| 不改 calc-progress.py / refresh-all.sh 判定逻辑 | A1/A4 机制已工作；本任务只产出新证据触发重算 |
| 不动 scripts/control-tower/、pre-commit-check.sh | D511 领地（版本守卫）——零重叠 |
| 不做"证据造假"（fail 场景写 pass） | 红线：诚实 RED 是 K3 审计纪律，伪造证据 = 事故 |

## 7. Test Requirements

### 7.1 L1 单元契约（run-all.sh 可测性 + evidence schema 兼容）

| 用例 | 判定 |
|------|------|
| `run-all.sh --dry-run` | 打印执行计划（顺序 + skip + sha），exit 0——不实际跑场景（CI/测试安全） |
| `run-all.sh --skip=gs01 --dry-run` | 计划含 skip=gs01，GS-01 标记跳过 |
| evidence schema 兼容 | 新证据 JSON（带 main_sha）可被 `calc-progress.py` 消费（跑 refresh-all.sh 无报错） |
| 逐场景退出码汇总 | 单场景 fail → run-all 汇总 exit 1（诚实，不掩盖） |
| run-all 补 main_sha | 证据 JSON 含 main_sha + refreshed_at；旧证据（无字段）仍被 calc-progress 消费（向后兼容） |

### 7.2 L2a 接线（生产调用点）

| 变更 | 验证 |
|------|------|
| run-all.sh 在 product-progress.yml 被调用 | `grep -n "run-all" .github/workflows/product-progress.yml` 非零 |
| run-all.sh 补字段逻辑 | `grep -n "main_sha" scripts/golden-scenarios/run-all.sh` 非零 |
| refresh-all.sh 联动 | 刷新后 `generated_at` 更新 + L1/L3 线 verified 数变化（真实反映） |

### 7.3 L2b 降级

- GS-02/04 fail → 诚实 RED 记录（evidence verdict=fail + 刷新报告根因）——不假装绿（红线）
- CI 场景跑失败 → 不阻断 A1/A4 重算（fail-closed 日志）
- bootstrap 不可跑（环境）→ 场景标 skipped/error，不写假 pass

### 7.4 L2c 边界

- 旧证据不覆盖（日期命名区分，历史可对比）
- schema 向后兼容（旧 evidence 仍被 calc-progress 消费）
- GS-01 skip 语义（D510 未合 main 时默认 skip；合并后编码 session 补跑）

### 7.5 场景级

8 场景在当前 main 全部重跑（编码 session 实跑）——验收项 1（GS-01 分批）。GS-07 README 与 evidence 统一（验收附带）。

## 8. Wiring Verification

| 新 export / 变更 | 生产调用点（真实传递，测试调用不计） | grep 验证 |
|------|------|------|
| `run-all.sh`（新建） | [product-progress.yml](.github/workflows/product-progress.yml) push main job（GS 刷新步骤） | `grep -n "run-all" .github/workflows/product-progress.yml` 非零 |
| run-all.sh 补 main_sha | [run-all.sh](scripts/golden-scenarios/run-all.sh) 场景跑完后内联 python 补字段 | `grep -n "main_sha" scripts/golden-scenarios/run-all.sh` 非零 |
| 新 evidence（main_sha） | [calc-progress.py](scripts/product-lines/calc-progress.py) A1/A4 消费（只读既有字段） | refresh-all.sh 跑通（exit 0） |
| refresh-all.sh 联动 | [product-progress.yml](.github/workflows/product-progress.yml) 既有 A4 步骤 | product-progress.json generated_at 更新 |

> ⚠️ 铁律 0-2 WIRE CHECK 是硬门禁：`grep -rn "run-all" .github/workflows/` — 零结果 = 未完成（CI 接线缺失）。测试调用不计。

## 9. Architecture Layer

**L0/基础设施（部署轨验证层）**。理由：
- run-all.sh 在 scripts/golden-scenarios/（场景脚本 = Harness 代码，TASK-ROUTING §一归 Mac DSH ✅）——调用 common/ 基建（bootstrap/fresh-db/assert），与 8 个场景同层。
- evidence-writer.py / calc-progress.py / refresh-all.sh 在 scripts/product-lines/（进度链，Mac DSH ✅）——数据流: 场景跑 → evidence → calc-progress(A1/A4) → progress.json → 仪表盘。
- product-progress.yml = CI 编排（.github/，Mac DSH ✅）。
- 不触碰 src/（L1-L5 业务代码零改动）、不触碰 scripts/control-tower/（D511 领地）。架构边界检查应零变化。

## 10. Completion Standard（DS 与 dev doc 一一对应，禁重编号，缺项显式 descope——S-10）

1. **DS1**: `scripts/golden-scenarios/run-all.sh` 交付——执行顺序 + --skip + --dry-run + 逐场景退出码汇总 + main_sha 注入（契约 §3.5 全字段）
2. **DS2**: 8 场景当前 main 全重跑（GS-01 分批——D510 合并后补跑），新证据 JSON 带 `main_sha` + `refreshed_at`（验收项 1）
3. **DS3**: GS-02/04 刷新后状态诚实记录——转绿则新证据 pass；仍 fail 则 verdict=fail + 刷新报告根因映射（demand-shift 阈值链 / hr-upload 映射）
4. **DS4**: GS-07 README vs evidence 矛盾核实统一（以刷新实测为准，README 措辞修正或证据修正）
5. **DS5**: run-all.sh 补 main_sha 字段——新证据 JSON 含 `main_sha` + `refreshed_at`；旧证据（无字段）仍被 calc-progress 消费（向后兼容，refresh-all.sh 跑通）
6. **DS6**: refresh-all.sh 联动重算——product-progress.json generated_at 更新 + L1/L3 线 verified 数真实反映（验收项 2；预期 L1 因 GS-01 绿（Electron 断言组）+ D504 实现而上调）
7. **DS7**: todos 过时条目（T-8-01 类）重算消化或显式保留理由（验收项 3）
8. **DS8**: product-progress.yml 接 GS 跑（push main job + run-all.sh --skip=gs01 步骤，失败不阻断 A1/A4——验收附带）
9. **DS9**: 全量 vitest + 12 组 pre-commit 全过 + `as any`=0 + 无 --no-verify + `git diff --name-only` 与写集一致（零越界：不碰 scripts/control-tower/、src/）
10. **DS10**: 推送 + 分支 feat/d512-gs-refresh + CI 绿 + `git log origin/feat/d512-gs-refresh..HEAD` 为空
11. **DS11**: 完成报告含**决策记录**（§5.3 四决策点参考系与结论，S-12）+ 刷新报告（8 场景逐条 verdict + GS-01 分批说明 + GS-02/04 根因）——K3 可核

> 交付声明必须覆盖以上 DS1-DS11 全部并标注状态（✅/⏸/❌+理由）；禁止重编号/跳号/静默缺项（S-10）。
> 显式 descope：GS-02/04 的业务修复（刷新=记录，修复另起任务）；GS-01 的断言诚实性（D510）；progress 仪表盘 UI 变更（非本任务）。

## 11. Auth Doc References

| 引用 | 路径 |
|------|------|
| 并行派单（任务 2 + 并行性声明） | docs/synova/coordination/派单-并行-D511-D512-20260823.md（97f85b20） |
| GSS 运行契约（8 条）+ 证据约定 | scripts/golden-scenarios/README.md |
| A1 证据失效机制 | scripts/product-lines/calc-progress.py（L4/L33/L67，EVIDENCE_TTL_DAYS=14） |
| evidence schema（schema=1） | scripts/product-lines/evidence-writer.py |
| 产品进度链（refresh-all/A1-A5） | .github/workflows/product-progress.yml + scripts/product-lines/refresh-all.sh |
| todos 验收点（T-1-01/T-3-01/T-8-01） | docs/synova/product-lines/todos.yaml |
| 铁律 0-4（数据资产，场景不 cp 真实库） | AGENTS.md |
| 产品进度设计 v1.4 | docs/plans/codex/strategy/SYNOVA-DESIGN-产品完成度仪表盘-v1-20260816.md |

## 12. 自检清单

- [x] 派单"全部 pass"不实——evidence 逐文件实测（GS-02/04 = fail，列出断言级证据）
- [x] 派单过时假设修正（product-progress.yml 已有 push 触发 / D475 loop-handlers 已在 main）
- [x] GS-07 README vs evidence 矛盾识别（刷新时核实统一）
- [x] evidence schema 现状（无 sha）+ 扩展方案（向后兼容）实测
- [x] 并行性声明（GS-01 交叉 --skip 分批；D511 零重叠）
- [x] 决策参考已记录（§5.3，S-12）：四决策点双参考系收敛
- [x] 诚实 RED 红线（fail 不假装绿）显式声明（§5.2/§6）
- [x] 测试先行（run-all --dry-run 可测 + schema 兼容验证）
- [x] 编码 session 待确认项显式列出（§5.4：GS-02/04 复验、GS-07 核实、CI bootstrap）
- [x] 不是凭记忆
