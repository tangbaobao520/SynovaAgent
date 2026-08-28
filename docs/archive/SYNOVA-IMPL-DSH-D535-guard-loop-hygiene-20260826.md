---
north-star:
  服务用户: 开发线全体（CTO/DSH/Claude/Codex——控制塔 guard 是防跑偏的最后防线）+ 未来的实现者（长跑脚本卡死/重复事故无提醒 = 时间黑洞，D529 教训）
  服务场景: 控制塔长跑脚本（gen-task-board/generate-dashboard/gen-cto-health 等仪表盘生成）偶发 subprocess 卡死无统一超时策略；staging-guard 拦截并行冲突后**学习闭环无数据**（incident-loop.py 零生产调用方——D314 建的学习闭环从未接线，防跑偏信号丢在日志里）；同类型事故反复发生无重复提醒（repeat-tool-reminder 范式缺失）
  模块终态: 控制塔防跑偏通用化：① 学习闭环接线——guard 拦截事件（staging-guard block）自动沉淀到 incident-loop（真实数据源，闭环活起来）② 循环卫生标准文档化——控制塔脚本 subprocess 超时契约 + 重复事故提醒（借鉴 DSH timeout-policy + repeat-tool-reminder 理念，融入现有 guard 不新建）③ 长跑脚本超时可 grep 验证
  对齐北星: PRODUCT-BRIEF.md §八「Loop Engineering 需要成为什么」（防跑偏/防时间黑洞是开发效率根基）+ 施工图 §3.3（控制塔是活的生产设施，🟡 搬走前继续服役）
  完成标准: 入口 staging-guard block（并行冲突）→ 处理 自动 record 到 incident-loop（学习闭环接线）→ 结果 incident.log 有真实记录 + 重复事故有提醒（测试可复现）+ 循环卫生标准文档存在（grep 可查）
  当前进度: incident-loop.py（D314）已建 record/suggest/verify 三命令 + 幂等，但**零生产调用方**（grep 实测仅注释提及）；staging_guard.py（D311/D329）已接线 synova-commit:477-490（timeout=30 + fail-open）；控制塔长跑脚本 subprocess 已零星带 timeout（gen-task-board 20s / generate-dashboard 5-10s / gen-cto-health 30s 等）但无统一标准文档；D521 simulate-ci 覆盖提交链路（::error 注解），guard 超时未通用化
---

<!--
  SYNOVA-IMPL-DSH-D535: guard 循环卫生 + 超时通用化（Stage1-D4 续，借鉴 DSH timeout-policy + repeat-tool-reminder）
  状态: dev doc | 2026-08-26 | 优先级 P1（Stage1 序 4 续）
  权威文档: 派单 Stage1续-D534-D535-20260825.md + 施工图 DOC-0114 §3.3/§8 R6 + D473 dev doc（运行时 guard 借鉴先行）+ DSH timeout-policy/repeat-tool-reminder 源码（范式借鉴）
  依赖: D473（已交付，运行时 tool-loop guard——timeoutMs + 分级提醒理念已验证）；D521（simulate-ci/::error 提交链路）
  并行: D534（Notes 四态）独立——D535 写集 scripts/control-tower/incident-loop.py + synova-commit + 新文档，D534 写集 memory/notes/ + commit-msg-check.sh + AGENTS.md，零文件交集；⚠️ D533（CI）可碰 tests/control-tower/*.test.sh（renormalize）——D535 新建测试同目录，标注共享资源（S-7/S-8），新文件用 LF 避免 CRLF 漂移
-->

# SYNOVA-IMPL-DSH-D535: guard 循环卫生 + 超时通用化

> 一句话问题: 控制塔有 guard（staging_guard.py 已接线、incident-loop.py 建了学习闭环），但**防跑偏信号没有通用化**——① `incident-loop.py`（D314 学习闭环）**零生产调用方**（全仓 grep 只有 attach.py 注释提及，record/suggest/verify 从未被任何生产脚本调用）→ 并行冲突/事故拦截后学习闭环收不到数据，"学习"是死的；② 控制塔长跑脚本 subprocess 超时**零星存在但无统一契约**（每个脚本自己写 timeout 值，无标准文档，无 grep 可验证的契约）；③ **无重复事故提醒**——同类型事故反复发生（如 D529 CI 盲猜 5-6 轮）没有 repeat-tool-reminder 式的"你已经重复 N 次了"提醒。借鉴 DSH `dsh-tool-call-timeout-policy`（timeoutMs 声明 + deadline 执行）+ `dsh-repeat-tool-reminder`（同工具重复调用提醒，阈值阶梯），**融入现有 guard 不新建机制**（D529 防膨胀教训）。

## 1. Authority Doc Verification

**来源**: [派单 Stage1续-D534-D535-20260825.md](docs/synova/coordination/派单-Stage1续-D534-D535-20260825.md)（D535 节）

> **目标**：控制塔防跑偏通用化——借鉴 DSH timeout-policy + repeat-tool-reminder，融入现有 guard（不新建机制）。
> **spec 必答题**：① 现状盘点（incident-loop.py/staging_guard.py 现有防跑偏逻辑；控制塔长跑脚本的超时现状——D521 的 simulate-ci 覆盖提交链路，guard 超时未通用）② DSH 范式借鉴（timeoutMs + deadline/timeoutOf 执行 + 重复工具提醒——融入现有 guard 而非新建）③ 通用化设计（控制塔脚本的循环卫生标准：长跑超时/重复操作提醒/防跑偏信号——最小机制，能融入现有 guard 的绝不新建）④ 边界（不膨胀：不新增门禁组/不新建 guard 脚本）
> **验收**：控制塔长跑脚本有超时/循环卫生（grep 物理证明）；防跑偏信号通用化（文档 + 接线）

**来源**: [DSH 迁移施工图](docs/synova/research/DSH迁移施工图-20260820/DSH迁移施工图-20260820.md)（§3.3 🟡 + §8 R6）

> scripts/（checks/control-tower/workflow/hooks）是活的生产设施（153+ 文件），Stage 3 影子运行期间逐组改写验证、过一组换一组。R6：治理层独立排期；不因运行时迁移同时动门禁。

**来源**: [dsh-tool-call-timeout-policy/lib/index.js](/Users/wane/.nvm/versions/node/v24.19.0/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-tool-call-timeout-policy/lib/index.js)（范式借鉴，不引代码）

> L1 `deadline`/`timeoutOf`：工具声明 `timeoutMs`，执行端 `deadline(exec.signal, timeoutMs, TOOL_TIMEOUT)` 包裹——**预算在声明处，执行端统一 enforce**，超时 → 结构化 `TOOL_TIMEOUT` 结果（isError + error.code），不静默。借鉴"声明式超时 + 执行端统一 enforce"理念。

**来源**: [dsh-repeat-tool-reminder/lib/index.js](/Users/wane/.nvm/versions/node/v24.19.0/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-repeat-tool-reminder/lib/index.js)（范式借鉴，不引代码）

> 阈值阶梯 `thresholds: [3,5,8]`：同工具同参数（canonicalize 深排序 JSON 键）连续调用计数，命中阈值 → 注入提醒（首阈值温和提醒 → 后续阈值详细点名工具/次数/参数），**不阻断，决策留给模型**。借鉴"重复操作计数 + 阶梯提醒"理念——控制塔侧 = 同类型事故重复记录提醒。

**来源**: [D473 dev doc](docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D473-guard-loop-hygiene-20260822.md)（Stage1-D4 运行时版，已交付）

> 运行时 tool-loop guard 已借鉴 DSH timeout-policy + repeat-tool-reminder（ToolDefinition.timeoutMs + 分级提醒 [2提醒,3阻断]）。本任务是**控制塔侧**（scripts/）的同一范式——对象不同（运行时工具循环 vs 开发侧 guard），理念同源。

**来源**: [AGENTS.md 铁律](AGENTS.md)（35 自动化优先 / 24+31 降级纪律 / 48 测试非空壳）

> 铁律 35: 能写 check-*.sh 的不靠 review。循环卫生标准 = 文档化 + 可 grep 验证。铁律 24/31: 超时/提醒必须显式，不静默。

## 2. Problem Statement

C 线 S3-5（自诊断可信度）+ D529 教训（时间黑洞防膨胀）同源。控制塔防跑偏有 3 个缺口：

1. **学习闭环未接线（防跑偏信号断流）**：`incident-loop.py` 是 D314 建的"incident → 根因 → 机制推荐 → 验证"学习闭环（record/suggest/verify 三命令），但**全仓 grep 零生产调用方**——`staging_guard.py` block（并行冲突拦截，synova-commit:505-516 exit 1）时没有任何代码调用 incident-loop 记录这次拦截。学习闭环收不到真实事故数据 = "学习"是死的，防跑偏信号（拦截事件）丢在日志里无法沉淀。
2. **循环卫生无统一标准（超时各写各的）**：控制塔长跑脚本 subprocess 超时是"每脚本自写"——gen-task-board.py:169 `timeout=20`、generate-dashboard.py:84 `timeout=10`、gen-cto-health.py:183 `timeout=30`、founder-truth.py:39 `timeout=30`、attach.py:141 `timeout=5`——值各异、无标准文档、无 grep 可验证的契约。新脚本/新调用点写不写 timeout 全凭自觉（D529 CI 挂起 10 分钟无输出的同类风险）。
3. **无重复事故提醒（repeat-tool-reminder 范式缺失）**：同类型事故反复发生（D529 盲猜循环 5-6 轮）时，guard 只记录不提醒"你已经重复 N 次了"。incident-loop.record 有幂等（同 id duplicate）但**静默返回 duplicate**——不告诉调用方"这个问题反复出现，检查是否真闭环"。

对齐北星：PRODUCT-BRIEF §八（Loop Engineering 要防跑偏/防时间黑洞）+ 施工图 §3.3（控制塔是活的生产设施，继续服役期间要防腐化）。学习闭环死着 = 每次事故都从零开始，防跑偏退化成"拦截"不进化成"防"。

## 3. Current State（2026-08-26 grep/read 实测）

### 3.1 已存在（D311/D314/D329/D521 交付，复用不重造）

| 资产 | 位置 | 状态 |
|------|------|------|
| staging_guard.py 暂存隔离 | `scripts/control-tower/staging_guard.py`（201 行） | ✅ 已接线 synova-commit:477-490（timeout=30 + fail-open + D329 认领制） |
| incident-loop.py 学习闭环 | `scripts/control-tower/incident-loop.py`（252 行） | ⚠️ record/suggest/verify 三命令 + 幂等（duplicate 检测 :147-154）✅ 存在，但**零生产调用方** |
| 控制塔长跑脚本 | `scripts/control-tower/` 13 个核心组件（self-health.py:37-48 清单） | ✅ subprocess 零星带 timeout（gen-task-board 20s / generate-dashboard 5-10s / gen-cto-health 30s / founder-truth 30s / attach 5-10s） |
| simulate-ci / ::error | `scripts/control-tower/simulate-ci.sh`（D521） | ✅ 提交链路诊断通道（覆盖 commit 链路，非 guard 超时） |
| 运行时 guard（D473） | `src/agent/tools.ts` + `src/l3/tool-guard.ts` | ✅ 已交付（timeoutMs + 分级提醒）——本任务不碰 src/ |

### 3.2 缺陷 A（P1）: incident-loop.py 零生产调用（学习闭环死）

全仓 grep（2026-08-26 实测）：

```bash
grep -rn "incident-loop" scripts/ .github/ 2>/dev/null
# → 仅 attach.py:39/:75 注释提及（"同 incident-loop.py — Git 安装…"），无任何 subprocess/调用
```

`staging_guard.py` block 时（synova-commit:505-516）只 `exit 1` + 提示——**拦截事件不沉淀**。incident-loop 的 `verify` 命令（:195-218）内嵌了 INC-20260802-stash 闭环案例验证，但 verify 本身也无人调用——学习闭环从建成起从未运行过生产数据。

### 3.3 缺陷 B（P1）: 循环卫生无统一标准（超时各写各的）

实测长跑脚本 subprocess timeout 值（grep 实证）：

| 脚本 | 行 | timeout |
|------|-----|---------|
| gen-task-board.py | :169 | 20s |
| generate-dashboard.py | :84 | 10s |
| gen-cto-health.py | :183 | 30s |
| founder-truth.py | :39 | 30s |
| attach.py | :141/:159 | 5s/10s |
| contract-archiver.py | :211/:224/:239 | 10s |
| env_validator.py | :78/:82 | 参数化 |

无统一标准文档（scripts/control-tower/ 无 README；grep 无"循环卫生"文档）；无契约可 grep 验证"新脚本必须带 timeout"。D529 教训（CI 挂起 10 分钟无输出 = 无 timeout 的代价）未固化为控制塔标准。

### 3.4 缺陷 C（P2）: 无重复事故提醒

`incident-loop.py:147-154` 幂等逻辑：同 id 已存在 → `return {"status": "duplicate", "id": incident_id}`——**静默返回**，不提醒"该问题反复出现"。对照 DSH repeat-tool-reminder 的"你已经重复 N 次了，检查是否在转圈"提醒，控制塔侧缺同型机制：同 symptom 反复 record（如并行冲突每周 3 次）应提醒"该问题频发，机制可能未闭环"。

## 4. What We Build

### 4.1 写集 (2 修改 + 2 新建)

| 文件 | 操作 | 说明 |
|------|:---:|------|
| [scripts/control-tower/incident-loop.py](scripts/control-tower/incident-loop.py) | 修改 | 缺陷 A/C：① record 增加**重复提醒**（同 id 重复 → `status: duplicate` + `repeat_count` + `reminder` 提醒字段，非静默；借鉴 repeat-tool-reminder 阶梯理念）② verify 已有 timeout=10 保留；③ 头注释补循环卫生契约（§4.2 修复模式） |
| [scripts/control-tower/synova-commit](scripts/control-tower/synova-commit) | 修改 | 缺陷 A 接线：staging-guard block 分支（:505-516 exit 1 前）调用 incident-loop.py record——拦截事件自动沉淀（fail-open：incident-loop 失败不阻断主流程，铁律 24/31） |
| [docs/synova/coordination/控制塔循环卫生标准-20260826.md](docs/synova/coordination/控制塔循环卫生标准-20260826.md) | 新建 | 缺陷 B：循环卫生标准文档——控制塔脚本 subprocess 超时契约（声明式 timeout 默认 30s，执行端 enforce）+ 重复事故提醒 + 防跑偏信号接线说明（§4.3） |
| [tests/control-tower/incident-loop-hygiene.test.sh](tests/control-tower/incident-loop-hygiene.test.sh) | 新建 | 重复提醒 + 接线测试（U7/CT-40 配对：incident-loop.py ↔ 同名测试；⚠️ 与 D533 renormalize 共享 tests/control-tower/ 目录，新文件 LF 换行，S-7/S-8 标注） |
| [docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D535-guard-loop-hygiene-20260826.md](docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D535-guard-loop-hygiene-20260826.md) | 新建 | 本 spec（dev doc） |

### 4.2 修复模式 A/C — incident-loop.py record 重复提醒（:147-154 改造）

```python
# D535: 重复事故提醒（借鉴 DSH repeat-tool-reminder 阶梯理念——同 id 重复 record
# 不是静默 duplicate，而是显式提醒"该问题反复出现，机制可能未闭环"）
if incident_id in existing_ids:
    # 查上次记录时间（incident.log 末条同 id）
    last = _last_record_time(incident_id)  # 新增辅助函数，读 INCIDENT_LOG 同 id 最后时间戳
    return {
        "status": "duplicate",
        "id": incident_id,
        "repeat_count": existing_ids.count(incident_id) + 1,  # 或从 log 统计
        "reminder": (
            f"该事故（{incident_id}）已重复出现 {n} 次（上次 {last}）——"
            "检查是否机制未闭环（repeat-tool-reminder 范式，D535）"
        ),
        "last_recorded": last,
    }
```

**契约**（铁律 47）：`@output` — duplicate 时含 `repeat_count` + `reminder` + `last_recorded`；`@degraded` — INCIDENT_LOG 不可读 → 维持现有降级（:174-175 OSError → degraded）；`@error` — 幂等保持（同 id 不重复追加）。

### 4.3 修复模式 B — 循环卫生标准文档（新建，非脚本）

`docs/synova/coordination/控制塔循环卫生标准-20260826.md` 核心内容：

```markdown
# 控制塔循环卫生标准（D535，2026-08-26）

## 1. subprocess 超时契约（借鉴 DSH timeout-policy：预算声明处，执行端 enforce）
- 所有控制塔脚本的 subprocess.run/check_output 必须带 `timeout` 参数（默认 30s，按需收紧）
- 超时 → `except subprocess.TimeoutExpired` → log + 显式降级（铁律 11/24，不静默）
- 验证：`grep -rn "subprocess" scripts/control-tower/*.py | grep -v "timeout="` 零结果
- 审计锚点：gen-task-board.py:169(20s) / generate-dashboard.py:84(10s) / gen-cto-health.py:183(30s)

## 2. 重复事故提醒（借鉴 DSH repeat-tool-reminder）
- incident-loop.py record 同 id 重复 → 返回 duplicate + repeat_count + reminder
- 调用方（synova-commit 等）收到 reminder → 打印 ⚠ 提醒（不阻断）

## 3. 防跑偏信号接线
- staging-guard block（synova-commit）→ incident-loop.py record（拦截事件自动沉淀）
- verify 命令用于闭环案例验证（INC-20260802-stash 等）
```

### 4.4 修复模式 A 接线 — synova-commit block 分支（:505-516 前插入）

```bash
if [[ "$GUARD_STATUS" == "block" ]]; then
  # D535: 防跑偏信号接线 — block 事件自动沉淀到学习闭环（incident-loop）
  # fail-open: incident-loop 不可用 → 显式提示不阻断（铁律 24/31）
  if [[ -n "$PYBIN" ]]; then
    set +e
    INC_OUT=$("$PYBIN" "$PROJECT_ROOT/scripts/control-tower/incident-loop.py" record \
      --id "staging-block-$(date +%Y%m%d)" \
      --symptom "staging-guard block: 暂存区含他人文件" \
      --root-cause "R1" \
      --sessions "$SESSION_ID" \
      --fix "与对应 session 协调或移出文件" 2>&1)
    INC_RC=$?
    set -e
    if [[ "$INC_RC" -eq 0 ]] && echo "$INC_OUT" | grep -q '"reminder"'; then
      echo -e "${YELLOW}⚠ 事故频发提醒: $(echo "$INC_OUT" | python3 -c "import json,sys; print(json.load(sys.stdin)['reminder'])" 2>/dev/null || echo "$INC_OUT")${NC}"
    fi
  fi
  echo ""  # ... 原有 block 输出与 exit 1 保持
```

> **注意**：incident id 用 `staging-block-$(date +%Y%m%d)` 按天聚合（当天多次 block 幂等合并，repeat_count 增长 → 频发提醒），不按次生成（防 incident.log 噪音）。

### 4.5 不做的事

| 不做 | 原因 |
|------|------|
| 新建 guard 脚本 / 新门禁组 | 派单防膨胀（D529 教训）+ 施工图 R6：融入现有 guard，不新建机制 |
| 改 staging_guard.py 本体 | 已接线 + D311/D329 已审计；本任务只在其 block 路径接线 incident-loop（synova-commit 侧改） |
| 给全部 13 个核心组件脚本统一 timeout 值 | 超时已有（各脚本自写）；本任务文档化标准 + 验证，**不批量改值**（防无谓 diff，K3 可核"验证零新增差异"） |
| 改 src/（D473 运行时 guard） | 已交付；本任务只控制塔侧（scripts/） |
| 自动 git mv / 迁移脚本 | 与 D534 无关；本任务不碰 memory/notes/ |
| 硬阻断升级（重复提醒 → 硬拦） | 借鉴 DSH advisory only（repeat-tool-reminder 明令"决策留给模型"）；提醒不阻断 |
| 改 incident-loop verify 超时值 | timeout=10 已有，行为不变（回归） |

## 5. Test Requirements（测试优先 — 铁律 0-2/48，red→green）

**第一步（red）**: 新建 `tests/control-tower/incident-loop-hygiene.test.sh`，用例在实现前必须失败：

| 用例 | 修复前（red） | 修复后（green） |
|------|------|------|
| L1 重复提醒：同 id 连续 record 2 次 → 第二次返回 `repeat_count>=2` + `reminder` 非空 | 现在静默 duplicate（无 reminder 字段） | 返回提醒 |
| L1 重复提醒边界：首 record → `status: recorded`（无 reminder） | 首条即 recorded | 不变（回归） |
| L1 幂等保持：同 id 重复 record → 不追加 incident.log 新行（行数不变） | 幂等已有 | 保持（回归） |
| L1 降级：INCIDENT_LOG 不可写 → `status: degraded`（不阻断，铁律 24/31） | 已有降级 | 保持（回归） |
| L2a 接线：synova-commit block 分支含 incident-loop record 调用 | 无调用 | grep 命中调用行 |
| L2a 接线降级：PYBIN 不可用 → block 仍正常 exit 1（fail-open，incident 失败不阻断） | — | block 语义不变 |
| L2b 频发提醒：构造 2 天前同 id 记录 + 今日再 record → reminder 含"重复"关键词 | 无提醒 | 提醒含频发语义 |
| L2c 超时契约：文档存在且含 subprocess 超时标准（grep "timeout" 文档命中） | 无文档 | 文档命中 |

**第二步（green）**: 实现后全绿。

| 层 | 类型 | 数量 | 覆盖 |
|:---|------|:---:|------|
| L1 | bash 单元 | ≥5 | 重复提醒/幂等/降级/边界（正常/降级/边界，铁律 48） |
| L2a | 接线 | 2 | synova-commit block 分支真实调用 + fail-open（grep 断言） |
| L2b | 降级 | 1 | incident 不可用 → block 语义不变 |
| L2c | 文档 | 1 | 循环卫生标准文档存在且含超时契约 |

## 6. Wiring Verification

| 新 export/函数 | 生产调用点 | 确认方式 |
|---------------|-----------|---------|
| incident-loop.py record 重复提醒 | synova-commit block 分支（staging-guard block → record） | `grep -n "incident-loop.py.*record" scripts/control-tower/synova-commit` 命中调用行 |
| 防跑偏信号接线 | synova-commit:505-516 block 分支 | `grep -n "incident-loop" scripts/control-tower/synova-commit` 命中 |
| 循环卫生标准文档 | docs/synova/coordination/控制塔循环卫生标准-20260826.md | `grep -n "subprocess.*timeout\|重复事故提醒" docs/synova/coordination/控制塔循环卫生标准-20260826.md` 命中 |

> 生产调用点必须（S-3）：incident-loop 被 synova-commit（生产提交链路）真实调用——测试调用不计；grep 物理断言。

## 7. Test Requirements（契约明细，铁律 47/48）

### 7.1 L1 单元契约 — incident-loop-hygiene.test.sh（≥5 用例）

- 正常路径：同 id 二次 record → duplicate + repeat_count + reminder；首 record → recorded
- 降级路径：INCIDENT_LOG 不可写 → degraded（不静默，铁律 24）
- 边界条件：reminder 含上次时间戳；repeat_count 递增；幂等（log 行数不变）
- 失败模式覆盖（S-5）：静默 duplicate（broken 提醒）/ 接线缺失（broken 接线，grep 零命中）/ 降级吞错（broken 降级）

### 7.2 L2a 接线契约

- synova-commit block 分支调用 incident-loop record（grep 断言调用行）
- fail-open：incident-loop 不可用（PYBIN 无/脚本缺失）→ block 仍 exit 1（主流程不因辅助记录失败而改变，铁律 31 降级信号显式）

### 7.3 L2b 降级契约

- incident-loop record 失败 → synova-commit 显式提示 + 继续原 block 语义（不静默吞，不阻断错误方向）
- INCIDENT_LOG 不可写 → record 返回 degraded（现有 :174-175 逻辑，回归）

### 7.4 L2c 边界契约

- 同 id 当天多次 block → 幂等合并（repeat_count 递增，log 不膨胀）
- 跨天同 id（staging-block-YYYYMMDD 日期聚合）→ 次日重新计数（id 含日期，天然隔离）
- 长跑脚本超时验证：`grep -rn "subprocess" scripts/control-tower/*.py | grep -v "timeout="` 零结果（文档标准可 grep 验证，非改动）

## 8. Architecture Layer

**L0（工程治理/开发侧）+ 控制塔**。依据：
- `scripts/control-tower/` 是治理层（施工图 §3.3 🟡 搬走），不属于 L1-L5
- synova-commit 是开发侧提交链路（L0 工具链）
- 循环卫生标准文档 = 治理规范（L0）
- 不触碰 src/ L1-L5 任何业务代码（D473 运行时 guard 已交付，本任务不重复）

## 9. Completion Standard（DS 与 dev doc 一一对应，禁重编号/跳号/静默缺项——S-10）

1. DS1: `tests/control-tower/incident-loop-hygiene.test.sh` 全过（≥5 L1 + 2 L2a + 1 L2b + 1 L2c；red 已证——二次 record 在修复前无 reminder）
2. DS2: 重复提醒——同 id 二次 record 返回 `repeat_count>=2` + `reminder` 非空（实测输出断言）
3. DS3: 幂等保持——同 id 重复 record 不追加 incident.log 行（行数断言，回归）
4. DS4: 接线——`grep -n "incident-loop" scripts/control-tower/synova-commit` 命中 block 分支调用（生产调用点，测试调用不计 S-3）
5. DS5: fail-open——PYBIN 不可用/incident 失败 → synova-commit block 仍 exit 1（主流程不变）
6. DS6: 循环卫生标准文档——`grep -n "subprocess.*timeout\|重复事故提醒\|防跑偏信号" docs/synova/coordination/控制塔循环卫生标准-20260826.md` 命中
7. DS7: 超时验证——`grep -rn "subprocess" scripts/control-tower/*.py | grep -v "timeout="` 零结果（现有脚本已达标，文档化验证）
8. DS8: 零回归——`bash scripts/control-tower/baseline-check.sh` 无新增失败；incident-loop.test.sh（既有）+ staging_guard 相关测试全绿
9. DS9: 写集一致——`git diff --name-only HEAD^` 与 §4.1 写集一致，无越界文件
10. DS10: 无绕过——pre-commit 13 组全过、bypass.log 无 `--no-verify`；提交走 synova-commit（禁 git stash，铁律 0-3）
11. DS11: 完成报告含决策记录（§4.5 融入而非新建/不批量改 timeout/按天聚合 id 的参考系与结论，S-12）——K3 可核

> 交付声明必须覆盖以上 DS1-DS11 全部并标注状态（✅/⏸/❌+理由）；禁止重编号/跳号/静默缺项。

## 10. Auth Doc References

- [派单 Stage1续](docs/synova/coordination/派单-Stage1续-D534-D535-20260825.md)（D535 节：必答题/验收/防膨胀约束）
- [DSH 迁移施工图](docs/synova/research/DSH迁移施工图-20260820/DSH迁移施工图-20260820.md)（§3.3 / §8 R6）
- [dsh-tool-call-timeout-policy/lib/index.js](/Users/wane/.nvm/versions/node/v24.19.0/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-tool-call-timeout-policy/lib/index.js)（范式借鉴：声明式超时 + 执行端 enforce，不引代码）
- [dsh-repeat-tool-reminder/lib/index.js](/Users/wane/.nvm/versions/node/v24.19.0/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-repeat-tool-reminder/lib/index.js)（范式借鉴：重复计数 + 阶梯提醒，不引代码）
- [D473 dev doc](docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D473-guard-loop-hygiene-20260822.md)（运行时 guard 借鉴先行）
- [incident-loop.py](scripts/control-tower/incident-loop.py) / [staging_guard.py](scripts/control-tower/staging_guard.py) / [synova-commit](scripts/control-tower/synova-commit) / [self-health.py](scripts/control-tower/self-health.py)
- [D529 教训](docs/synova/coordination/AUDIT-FINDINGS-LEDGER.md)（CT-46：CI 挂起无 timeout = 时间黑洞）
- AGENTS.md 铁律 11/24/31/35/48
- TASK-ROUTING.md §四（Stage 1 归 Mac DSH）+ §一（scripts/control-tower 归 DSH）

## 11. 自检清单

- [x] incident-loop.py 零生产调用实测（全仓 grep 仅注释提及，attach.py:39/:75）
- [x] 长跑脚本超时现状实测（gen-task-board:169 20s / generate-dashboard:84 10s / gen-cto-health:183 30s / founder-truth:39 30s / attach:141 5s，grep 实证）
- [x] staging_guard 接线实测（synova-commit:477-490，block 分支 :505-516 exit 1）
- [x] incident-loop 幂等逻辑实测（:147-154 duplicate 静默返回）
- [x] DSH timeout-policy / repeat-tool-reminder 源码精读（timeoutMs + deadline / thresholds [3,5,8] + canonicalize + advisory only）
- [x] D473 运行时 guard 已交付核对（不重复，本任务只控制塔侧）
- [x] 防膨胀核对（§4.5：不新建 guard 脚本/门禁组；不批量改 timeout 值——文档化验证）
- [x] 测试 red→green 覆盖失败模式（S-5：静默 duplicate/接线缺失/降级吞错）
- [x] 决策参考已记录（§4.5 融入而非新建/按天聚合 id/advisory only，S-12）
- [x] DS 与 dev doc 一一对应（DS1-DS11）；写集表标题紧跟表头（D381 格式契约）
- [x] 与 D534 写集零交集；⚠️ tests/control-tower/ 与 D533（renormalize）共享目录已标注（S-7/S-8），新测试文件 LF 换行
- [x] 不是凭记忆；不用 --no-verify
