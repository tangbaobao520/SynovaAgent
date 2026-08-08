<!--
  SYNOVA-IMPL-D317: G12b/brief 解析 CI 红修复 — resolver 回退过滤 + python3 跨平台
  状态: dev doc | 2026-08-07 | 优先级 P0 (D316 审计发现 — CI Iron Laws 持续红，阻塞后续所有 push)
  权威文档: SYNOVA-DESIGN-控制塔V4.6-独立化 §2.6/§2.7 + D313 M3 契约 + AGENTS.md 铁律 35/48
  来源: D316 审计 (2026-08-07, Codex synova-audit) — CI run 31067628720 Iron Laws 失败根因
  依赖: 无 (独立修复; D316 的 DS6 未达成由此任务补)
  并行: 无 (控制塔组件; 工作区未提交的 feishu-bridge 文件不属于本写集，无交集)
-->

# D317: G12b/brief 解析 CI 红修复 — resolver 回退过滤 + python3 跨平台

> 一句话问题: D316 push 后 CI 的 Iron Laws job 失败（run 31067628720），根因是 G12b 硬阻断选中了已提交的旧格式 brief（`2026-08-02-D286-GraphStore-unify.md`，缺 #CRITERIA）；同时 Windows 下 `python3` 缺失会让 brief 解析 4 项假失败并让 resolver 静默回退到坏 brief。

## 1. 权威文档引用

**来源**: [SYNOVA-DESIGN-控制塔V4.6-独立化 §2.6/§2.7](D:\novis-backup-20260526\Novis\synova-agent\docs\plans\codex\strategy\SYNOVA-DESIGN-控制塔V4.6-独立化-20260802.md)

> 版本只增不减；任何门禁/工具行为变化必须 bump（PATCH 起步）；fail-open 绝不静默。

**来源**: [AGENTS.md 铁律 35/48](D:\novis-backup-20260526\Novis\synova-agent\AGENTS.md)

> 自动化优先——能写 check-*.sh 的不靠 review；测试不可为空壳（≥3 断言，正常/降级/边界）。

**来源**: [D313 M3 brief 契约](D:\novis-backup-20260526\Novis\synova-agent\docs\plans\codex\strategy\SYNOVA-DESIGN-控制塔V4.6-独立化-20260802.md)（check-brief-parseable 4 项：Q2 可解析 / #CRITERIA A-D / 架构层 / Done ≥1）

## 2. 代码审计——现状 (2026-08-07 实测)

### 2.1 缺陷 A (P0): D316 push 后 CI Iron Laws 持续红 — G12b 硬阻断旧 brief

**CI 事实（gh 实测）**:
- run [31067628720](https://github.com/tangbaobao520/SynovaAgent/actions/runs/31067628720)（fdad612 D316 push）：`TypeScript + Lint + Iron Laws` job ❌ **Iron laws 步骤失败**（TypeScript 步骤 ✅）；Golden Case/Vitest 因 `needs: quality` 被跳过。
- 同 job 在 D311（run 30758314995）与 D312（run 30786961241）均 ✅ → **非预存失败，D313-D316 引入**。

**根因链条（逐行核实）**:
1. [pre-commit-check.sh L888-890](D:\novis-backup-20260526\Novis\synova-agent\scripts\pre-commit-check.sh:888)（D313 新增 G12b）：对 resolver 选出的 brief 跑 `check-brief-parseable.sh`，输出含 `❌` 即硬阻断。
2. [resolve-commit-brief.sh L117-124](D:\novis-backup-20260526\Novis\synova-agent\scripts\workflow\resolve-commit-brief.sh:117) 最终回退：**文件名日期前缀最新**的已提交 brief。CI 干净检出：current-brief 已提交且陈旧（`2026-07-14-D83-bootstrap-startup-sequence.md`，[L30-36](D:\novis-backup-20260526\Novis\synova-agent\scripts\workflow\resolve-commit-brief.sh:30) 判定过期忽略）→ 无认领（无 staged）→ 落到 L117 回退。
3. 最新日期前缀 = `2026-08-02-D286-GraphStore-unify.md`（**已提交**，08-02 D286 旧模板）→ G12b 校验失败。
4. [brief_parser.py parse_all](D:\novis-backup-20260526\Novis\synova-agent\scripts\control-tower\brief_parser.py:114) 实测 D286 brief：`"criteria": null`（**缺 #CRITERIA**，必填 A-D）→ 硬阻断。
5. **扫描全量已提交 brief（281 个带日期前缀，`git ls-files` + brief_parser 实测）：可解析 = 0 个**。回退链上每一个候选（08-02 D286 / 08-01 auto / 08-01 D290 / 07-31 auto …）都缺字段 → 修单个 brief 不够，必须让回退不再选中坏 brief。

### 2.2 缺陷 B (P1): Windows 环境 `python3` 缺失 → 4 项假失败 + resolver 静默回退

**实测**（本机 Git Bash）：`command -v python3` 为空（只有 `python` / `py -3`）。
- [check-brief-parseable.sh L45](D:\novis-backup-20260526\Novis\synova-agent\scripts\workflow\check-brief-parseable.sh:45)：`python3 --all` 失败被 `|| echo '{"parseable": false}'` 吞掉 → **Q2/#CRITERIA/架构层/Done 4 项全部假失败**（对好 brief 也误报）。
- [resolve-commit-brief.sh L49](D:\novis-backup-20260526\Novis\synova-agent\scripts\workflow\resolve-commit-brief.sh:49)：认领判定的 python 块失败 → `RESULT` 空 → 静默落入最终回退 → 选中 D286。

> 注: CI 用 ubuntu-latest（自带 python3），CI 侧根因是缺陷 A；缺陷 B 是本地开发环境的同源脆弱性（同 L45 模式），一并修。

### 2.3 附注: current-brief 已提交且陈旧

[.claude/current-brief](D:\novis-backup-20260526\Novis\synova-agent\.claude\current-brief) 被 git 跟踪且内容陈旧（D83）。本任务不改其追踪状态（D308 backlog：current-brief 独立化）；resolver 已正确忽略过期 current-brief，本任务只需保证回退不再选中坏 brief。

## 3. 实现方案

### 3.1 写集 (4 修改 + 2 新建)
| 文件 | 操作 | 说明 |
|------|:---:|------|
| [scripts/workflow/resolve-commit-brief.sh](D:\novis-backup-20260526\Novis\synova-agent\scripts\workflow\resolve-commit-brief.sh) | 修改 | 顶部解析 PYBIN（python3→python→py）；认领 python 块（L49 `RESULT=$("$PYBIN" -c ...)`）与最终回退（L117-124）全部换用；最终回退改为"最新日期→最早"逐个用 brief_parser 验证可解析性（`"criteria": "[A-D]"`），选第一个可解析的；全部不可解析或 python 不可用 → **exit 1（fail-open → G12b 跳过）**，绝不静默返回坏 brief |
| [scripts/workflow/check-brief-parseable.sh](D:\novis-backup-20260526\Novis\synova-agent\scripts\workflow\check-brief-parseable.sh) | 修改 | 顶部解析 PYBIN（`python3` → `python` → `py -3`，全无 → fail-open 跳过 + degraded 记录）；L45/49/56/62/68/75/76 全部 `python3` 换 `"$PYBIN"` |
| [tests/control-tower/resolve-commit-brief.test.sh](D:\novis-backup-20260526\Novis\synova-agent\tests\control-tower\resolve-commit-brief.test.sh) | 新建 | 回退过滤测试（正常/降级/边界，≥4 断言，见 §4） |
| [tests/control-tower/brief-parseable.test.sh](D:\novis-backup-20260526\Novis\synova-agent\tests\control-tower\brief-parseable.test.sh) | 修改 | 新增：D286 legacy brief 回归（python 可用时仅报 #CRITERIA 缺失而非 4 项假失败）+ PYBIN 解析断言 |
| [.codex/control-tower/VERSION.md](D:\novis-backup-20260526\Novis\synova-agent\.codex\control-tower\VERSION.md) | 修改 | 追加 **V4.6.2** 条目（门禁行为变化，PATCH） |
| [.codex/control-tower/logs/version.log](D:\novis-backup-20260526\Novis\synova-agent\.codex\control-tower\logs\version.log) | 新建 | 运行时产物（gitignore，不进 commit）：`control_tower_log.py version --version 4.6.2 --changes "G12b/brief 解析 CI 红修复"` |

### 3.2 修复模式

**resolve-commit-brief.sh（L48 之前插入 PYBIN 解析；L49 换用；替换 L117-124）**:

```bash
# 顶部（ROOT/TODAY 之后）:
PYBIN=""
for _c in python3 python py; do
  if command -v "$_c" >/dev/null 2>&1; then PYBIN="$_c"; break; fi
done
# L49: RESULT=$("$PYBIN" -c "...")（认领判定用同一解释器，避免 Windows 无 python3 时 RESULT 空）

# 最终回退: 最新日期 → 最早, 逐个用 brief_parser 验证可解析性 (criteria A-D)
# 全部不可解析或 python 不可用 → exit 1 (fail-open → G12b 跳过), 绝不静默选坏 brief
if [ -z "$PYBIN" ]; then
  exit 1
fi
for _d in $(find "$ROOT/.claude/task-briefs/" -maxdepth 1 -name "*.md" -printf '%f\n' 2>/dev/null \
  | grep -oE '^[0-9]{4}-[0-9]{2}-[0-9]{2}' | sort -r | uniq); do
  for _f in $(find "$ROOT/.claude/task-briefs/" -maxdepth 1 -name "${_d}-*.md" 2>/dev/null | sort -r); do
    if "$PYBIN" "$ROOT/scripts/control-tower/brief_parser.py" --all "$_f" 2>/dev/null \
      | grep -qE '"criteria": "[A-D]"'; then
      echo "$_f"
      exit 0
    fi
  done
done
exit 1
```

> 说明：以 `criteria` 作为最小可解析判据（#CRITERIA 是新模板的硬字段；layer/Done 旧格式部分存在，以 criteria 为准最稳）。G12b 对真实提交仍生效——认领路径（步骤 1/2/3）不变，只有无认领的最终回退变严格。

**check-brief-parseable.sh 顶部（L26 之后插入）**:

```bash
# D317: Windows 无 python3.exe — python3 → python → py -3 回退; 全无 → fail-open 跳过
PYBIN=""
for _c in python3 python py; do
  if command -v "$_c" >/dev/null 2>&1; then PYBIN="$_c"; break; fi
done
if [ -z "$PYBIN" ]; then
  echo '{"time": "'"$(date -u +%Y-%m-%dT%H:%M:%S+00:00)"'", "component": "check-brief-parseable", "reason": "python 不可用 — 跳过 (fail-open)"}' >> "$DEGRADED_LOG" 2>/dev/null || true
  echo "[check-brief-parseable] ⚠️  python 不可用 — 跳过 (fail-open)"
  exit 0
fi
```

> 之后 L45/49/56/62/68/75/76 的 `python3` 全部替换为 `"$PYBIN"`。

### 3.3 不做的事

| 不做 | 原因 |
|------|------|
| 批量移动/删除 281 个旧格式 brief | 历史文档红线（用户明确：不能删除任务文档）；修复后回退不再选中它们，无需动 |
| 取消 git 跟踪 .claude/current-brief | D308 backlog（current-brief 独立化 + 共享配置认领强制），不在本任务 |
| 修改 CI workflow（.github/workflows/ci.yml） | ubuntu runner 自带 python3，非缺陷 |
| 改 brief_parser.py 本体 | 解析语义正确，无需变 |
| 处理 D309/D310（预存 npm audit/Architecture） | 独立收尾任务，与本修复无冲突 |

## 4. 测试要求 (测试优先 — 铁律 0-2/48)

**第一步（red）**: 新建 `tests/control-tower/resolve-commit-brief.test.sh`，用例在修复前必须失败：

| 用例 | 修复前（red） | 修复后（green） |
|------|------|------|
| 仅 legacy 不可解析 brief（拷 D286 内容入临时 repo） | 回退返回该 brief exit 0 → 断言 exit 1 失败 | exit 1（fail-open） |
| 可解析 + 不可解析混存 | 返回最新（=不可解析者）→ 断言"返回可解析者"失败 | 返回最新可解析者 |
| 仅可解析 brief | 返回该 brief（此用例已过） | 不变 |
| 过期 current-brief（日期≠今日）忽略 | 已过 | 不变 |

**第二步（green）**: 实现后全绿。`brief-parseable.test.sh` 增补：

| 层 | 类型 | 数量 | 覆盖 |
|:---|------|:---:|------|
| L1 | shell 单元（新建） | ≥4 | resolve-commit-brief 回退过滤（正常/降级/边界/过期 current-brief） |
| L1 | shell 单元（修改） | +2 | ① D286 legacy brief 在 python 可用时仅报 #CRITERIA（非 4 项假失败）；② PYBIN 解析非空 |

> 每个用例 ≥3 断言（assert_exit + assert_contains + assert_not_contains）；临时 repo 用 `mktemp -d` + `git init`（resolve-commit-brief.sh 依赖 `git rev-parse --show-toplevel`），测试 brief 放入临时 repo 的 `.claude/task-briefs/`（刚创建 → mtime 为今日 → 进入 ALL_TODAY 候选，隔离真实仓库）。

## 5. 接线要求

| 变更 | 验证 |
|------|------|
| resolver 回退过滤 | `bash scripts/workflow/resolve-commit-brief.sh ""` 在无 staged 时不再输出 D286（输出空 + exit 1 或可解析 brief） |
| check-brief-parseable PYBIN | `command -v python3` 为空时（本机 Git Bash）跑模板 brief 仍 exit 0 |
| G12b 不再误选 | 干净检出模拟（`git worktree add` 临时目录，无 staged）`bash scripts/pre-commit-check.sh` → G12b 通过（fail-open skip） |
| version.log | `logs/` 含 version.log 且追加 V4.6.2 记录 |

## 6. 完成标准

1. DS1: `tests/control-tower/resolve-commit-brief.test.sh` 全过（≥4 用例；修复前 red → 修复后 green 已证）
2. DS2: resolver 最终回退**永不再返回不可解析 brief**——测试断言 + `grep -n 'NEWEST_DATE' scripts/workflow/resolve-commit-brief.sh` 确认旧逻辑已替换
3. DS3: `check-brief-parseable.sh` 在 python3 缺失环境（`command -v python3` 为空）用 python/py 回退——本机实测模板 brief exit 0
4. DS4: 干净检出模拟（临时 worktree、无 staged）`bash scripts/pre-commit-check.sh` → G12b 通过（不再选中 legacy brief）
5. DS5: VERSION.md 含 **V4.6.2** 条目（同 commit）；version.log 追加 V4.6.2（运行时产物，本地核验）
6. DS6: 全量审计 `python scripts/audit/audit-check.py --full` 与基线一致（**439 FAIL** 不变）+ as any=0
7. DS7: 推送后 CI run：**TypeScript + Lint + Iron Laws ✅**（修复 D316 引入的 CI 红；npm audit / Architecture 预存失败除外；Golden Case/Vitest 由 needs 链决定）
8. DS8: 真实提交环境 12 组 pre-commit 全过、无 --no-verify、`git diff --name-only` 与写集一致

## 7. 自检清单

- [x] CI run 31067628720 Iron Laws 失败已核实（gh run view；D311/D312 同 job ✅）
- [x] G12b 硬阻断链路逐行核实（pre-commit-check.sh L888-890 → resolve-commit-brief.sh L117-124 → brief_parser criteria=null）
- [x] 281 个日期前缀已提交 brief 全量扫描：可解析 0 个（git ls-files + brief_parser 实测）
- [x] D286 brief `"criteria": null` 实测确认；D316 brief criteria=A（对照组）
- [x] Windows `command -v python3` 为空实测确认；check-brief-parseable 4 项假失败复现
- [x] current-brief 已提交且陈旧（D83 07-14）核实；resolver 已忽略过期值
- [x] 测试优先：4 用例 red→green 设计（§4 表）
- [x] 不是凭记忆
- [x] 不用 --no-verify
