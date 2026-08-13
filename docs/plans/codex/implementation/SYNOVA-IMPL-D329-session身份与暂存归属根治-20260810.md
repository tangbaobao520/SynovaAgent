<!--
  SYNOVA-IMPL-D329: session 身份独立化 + staging-guard 认领制 + current-brief 独立化（RC-2/RC-3 根治）
  状态: dev doc | 2026-08-10 | 优先级 P0 (D320 劫持根因 RC-2/RC-3)
  权威文档: D311 staging-guard 设计 + D296 认领制 + D308 backlog + D320 劫持复盘
  依赖: D328（已交付 ea1cb71；**本任务折入其审计 P2：commit-msg-check.sh 裸 python3 → PYBIN 加固**）
  并行: 无（D328 已完成；本任务独占 V4.7.1 版本编排）
-->

# D329: session 身份独立化 + 暂存归属根治

> 一句话问题: D320 劫持的第二层根因——synova-commit 的 SESSION_ID 缺省解析会"自动采用认领文件的 brief 身份"（[synova-commit L297-305](D:\novis-backup-20260526\Novis\synova-agent\scripts\control-tower\synova-commit:297)），导致 staging-guard 把被偷文件当成"自己的"（[staging_guard.py L86-87](D:\novis-backup-20260526\Novis\synova-agent\scripts\control-tower\staging_guard.py:86) "自己写集→pass"）——**guard 从机制上无法识别劫持**；同时 current-brief 是全局单文件，三并行 session 互相覆盖。

## 1. 权威文档引用

**来源**: [D311 staging-guard 设计](D:\novis-backup-20260526\Novis\synova-agent\docs\plans\codex\strategy\SYNOVA-DESIGN-控制塔V4.6-独立化-20260802.md)

> 暂存区隔离：防 A session 的 commit 把 B session 已暂存文件一并提交；他人活跃写集 → block。

**来源**: [D308 backlog（current-brief 独立化）](D:\novis-backup-20260526\Novis\synova-agent\docs\synova\DASHBOARD-CN.md)

> current-brief 独立化 + 共享配置文件纳入写锁/认领强制。

## 2. 代码审计——现状 (2026-08-10 实测)

### 2.1 缺陷 A (P0): SESSION_ID 自动采用认领 brief → guard 失效

[synova-commit L297-305](D:\novis-backup-20260526\Novis\synova-agent\scripts\control-tower\synova-commit:297)：

```bash
if [[ -z "$SESSION_ID" ]]; then
  RESOLVED_BRIEF=$(bash ".../resolve-commit-brief.sh" "${FILES[*]:-}" 2>/dev/null | head -1 || true)
  if [[ -n "$RESOLVED_BRIEF" && -f "$RESOLVED_BRIEF" ]]; then
    SESSION_ID=$(basename "$RESOLVED_BRIEF" .md)   # ← 提交者身份 = 认领文件的 brief
```

**劫持链实测**：D318 session 提交 D320 文件 → resolver 返回 D320 brief → SESSION_ID="D320-dashboard-gitify" → [staging_guard.py L86-87](D:\novis-backup-20260526\Novis\synova-agent\scripts\control-tower\staging_guard.py:86) `own_set` 判定 → 文件"属于自己"→ pass。**guard 的唯一防线被身份自动采用击穿**。registry 实测：`D320-dashboard-gitify` 已登记 6 条写集（正是被劫持后登记）。

### 2.2 缺陷 B (P1): 写集登记时序盲区（staging→commit 窗口）

写集登记发生在 synova-commit（提交时），而劫持窗口是"A 已暂存 → B 提交"——A 未提交前 registry 无其写集。且 [staging_guard.py L112-116](D:\novis-backup-20260526\Novis\synova-agent\scripts\control-tower\staging_guard.py:112) 自身异常 → fail-open pass。→ **guard 对"暂存中未提交"的并行文件天然不可见**。

### 2.3 缺陷 C (P1): current-brief 全局单文件竞态

实测工作区 `M .claude/current-brief`（三并行 session 互相覆盖）。synova-commit 缺省 SESSION_ID 解析依赖它；D308 backlog 未做。

### 2.4 缺陷 D (P2, D328 审计折入): commit-msg-check.sh 裸 python3 无 PYBIN 回退

D328 交付 [commit-msg-check.sh L58](D:\novis-backup-20260526\Novis\synova-agent\scripts\commit-msg-check.sh:58) 的 GENUINE 判定用裸 `python3`——本机实测 python3 解析不稳定（`command -v` 时有时无），真正无 python3 的机器上 GENUINE 恒 0 → **D328 门禁静默失效**（fail-open skip，无告警）。D317 已在 check-brief-parseable/resolver 标准化 PYBIN 回退（python3→python→py），D328 未对齐。本任务补上。

## 3. 实现方案

### 3.1 写集 (8 修改 + 1 新建)
| 文件 | 操作 | 说明 |
|------|:---:|------|
| [scripts/control-tower/synova-commit](D:\novis-backup-20260526\Novis\synova-agent\scripts\control-tower\synova-commit) | 修改 | **删除 SESSION_ID 自动采用认领 brief**：缺省回退 `SESSION_ID="$TASK_ID"`；显式 `--session-id` 优先；**write-set 登记移到 staging-guard 通过之后**（防 --files 预登记"洗白"他人文件）；register 的 brief 路径按 TASK_ID 前缀查找实际文件（`ls task-briefs/${TASK_ID}-*.md` 首个，找不到则空 fail-open，不假定 `${SESSION_ID}.md` 存在） |
| [scripts/control-tower/staging_guard.py](D:\novis-backup-20260526\Novis\synova-agent\scripts\control-tower\staging_guard.py) | 修改 | 判定升级为**认领制**：**认领制判定放在 own_set 之前**（对每个暂存文件先查"被真实认领 brief（Q2 命中）的 D# ≠ 本 session 任务 D#"→ block，own_set 不能先放行）；own_set 仅用于无认领冲突的文件；D# 比对用正则提取后**精确相等**（禁 startswith，防 D3290 误配 D329）；保留 fail-open 但 degraded 必记录 |
| [scripts/control-tower/session_registry.py](D:\novis-backup-20260526\Novis\synova-agent\scripts\control-tower\session_registry.py) | 修改 | register 增加 `--task-id` 绑定（session ↔ 任务 D#）；write-set 记录含 task_id；活跃判定不变 |
| [scripts/workflow/resolve-commit-brief.sh](D:\novis-backup-20260526\Novis\synova-agent\scripts\workflow\resolve-commit-brief.sh) | 修改 | 支持 `--session <sid>`：读 session 专属 current-brief（`.claude/current-brief.<sid>`），无则回退全局（单 session 语义） |
| [scripts/control-tower/attach.py](D:\novis-backup-20260526\Novis\synova-agent\scripts\control-tower\attach.py) | 修改 | SessionStart 时写 `.claude/current-brief.<session-id>`（session 专属 current-brief 的写入方）；task-start.sh 同步（可选） |
| [scripts/commit-msg-check.sh](D:\novis-backup-20260526\Novis\synova-agent\scripts\commit-msg-check.sh) | 修改 | **D328 P2 折入**：GENUINE 判定 `python3` → PYBIN 回退（python3→python→py，全无 → 显式 degraded 提示后 fail-open skip，不静默）——对齐 D317 模式 |
| [.gitignore](D:\novis-backup-20260526\Novis\synova-agent\.gitignore) | 修改 | 新增 `.claude/current-brief*`（session 专属 + 全局 current-brief 均为运行时产物，去跟踪） |
| [tests/control-tower/staging-guard-session.test.py](D:\novis-backup-20260526\Novis\synova-agent\tests\control-tower\staging-guard-session.test.py) | 新建 | session 身份 + 认领制判定测试（≥5 用例，见 §4） |
| [.codex/control-tower/VERSION.md](D:\novis-backup-20260526\Novis\synova-agent\.codex\control-tower\VERSION.md) | 修改 | 追加 **V4.7.1（批次 D328+D329）**——本任务独占版本编排 |

> 配套操作（同 commit）：`git rm --cached .claude/current-brief`（保留工作区文件，去跟踪——全局 current-brief 是运行时产物，已提交值陈旧且被多 session 覆盖）。

### 3.2 修复模式

**synova-commit SESSION_ID 解析（替换 L297-305）**:

```bash
# D329: session 身份 = 会话声明的任务，绝不自动采用认领 brief（劫持根因）
if [[ -z "$SESSION_ID" ]]; then
  SESSION_ID="$TASK_ID"
fi
```

**staging_guard.py 认领制判定（check_staging 内，own_set 判定之前）**:

```python
# D329: 认领制硬校验 — 文件被"认领 brief 的 D# ≠ 本 session 任务 D#"认领 → block
import re, subprocess
staged_arg = "\n".join(staged_files)
claimed = subprocess.run(
    ["bash", str(REPO_ROOT / "scripts/workflow/resolve-commit-brief.sh"), staged_arg],
    capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=30,
).stdout.strip().splitlines()
if claimed:
    brief = claimed[0]
    # 防假阳性: 仅当 brief 真实认领 ≥1 个暂存文件才比较 D#（Q2 include 命中）
    try:
        sys.path.insert(0, str(REPO_ROOT / "scripts/control-tower"))
        from brief_parser import parse_q2, match_path
        text = Path(brief).read_text(encoding="utf-8", errors="replace")
        inc = parse_q2(text).get("include", [])
        genuine = any(match_path(f, p) for f in staged_files for p in inc)
    except Exception:
        genuine = False
    if genuine:
        claim_did = re.search(r"D\d+", Path(brief).stem)
        sess_did = re.search(r"D\d+", session_id or "")
        # 精确相等（禁 startswith）: D3290 不能匹配 D329；session_id 无 D# → 跳过认领制判定
        if claim_did and sess_did and claim_did.group(0) != sess_did.group(0):
            result["status"] = "block"
            result["foreign_files"].append({"file": "<staged>", "owner_session": Path(brief).stem,
                                            "brief": brief, "reason": "认领 brief D# 与本 session 任务不一致"})
```

> 说明：**认领制判定必须放在 own_set 放行之前**——否则 synova-commit 的 write-set 预登记会让被声明文件先进 own_set 直接 pass（D329 自查发现的设计缺陷）；synova-commit 侧同步把 write-set 登记移到 guard 通过之后，双保险。session_id 形如 `D318-...`（TASK_ID 或显式），D# 用正则提取后**精确相等**（禁 startswith）。registry 写集判定保留（防已登记占用），认领制判定是独立防线（不依赖登记时序）。`import re, subprocess` 在模块顶部（非函数内）。**跨天边界**：resolver 只认今日 mtime brief——跨天时认领判定走跳过路径（不误伤），跨天需 touch brief/重跑 task-start（D296 教训）。

**commit-msg-check.sh PYBIN 加固（替换 L58 处 `python3` 调用）**:

```bash
# D329 (D328 P2 折入): Windows 无 python3.exe → python3→python→py 回退
PYBIN=""
for _c in python3 python py; do
  if command -v "$_c" >/dev/null 2>&1; then PYBIN="$_c"; break; fi
done
if [ -z "$PYBIN" ]; then
  echo -e "${YELLOW}⚠ D328 一致性检查跳过: python 不可用（fail-open 显式提示，不静默）${RESET}"
else
  GENUINE=$(echo "$STAGED_LIST" | "$PYBIN" -c "...")   # 其余不变
fi
```

**current-brief 独立化（resolve-commit-brief.sh）**:

```bash
# D329: session 专属 current-brief 优先
if [ -n "$SESSION_ID" ] && [ -f "$ROOT/.claude/current-brief.$SESSION_ID" ]; then
  CUR_SRC="$ROOT/.claude/current-brief.$SESSION_ID"
fi
```

> `.claude/current-brief.<sid>` 由 session 启动时创建（attach.py/task-start 写入），`.gitignore` 忽略（运行时产物）；全局 `current-brief` 保留为无 session 时的回退（单 session 语义）。

### 3.3 不做的事

| 不做 | 原因 |
|------|------|
| 重写已推送历史（拆分 c576e2b） | 不重写历史；D328+D329 起防新劫持 |
| G12 范围校验改造 | D328 已覆盖消息-内容一致性 |
| hook 双重执行排查 | D331 独立任务 |

## 4. 测试要求 (测试优先 — 铁律 0-2/48)

**第一步（red）**: 新建 `tests/control-tower/staging-guard-session.test.py`，用例在修复前必须失败：

| 用例 | 修复前（red） | 修复后（green） |
|------|------|------|
| **劫持复现**：session=D318 + 暂存 D320 认领文件 + 无显式 --session-id 走 synova-commit → 断言 block | 当前自动采用 D320 → pass | block |
| 显式 --session-id D318 + D320 文件 → block | 当前（显式时）已能 block | 不变 |
| 自己任务文件（session=D320 + D320 文件）→ pass | 已过 | 不变 |
| session 专属 current-brief 优先于全局 | 未实现 → 读全局 | 读 session 专属 |
| registry 缺失 → degraded pass + 记录（fail-open 不静默） | 已过 | 不变 |
| **无真实认领（resolver 回退）→ 不误伤** | 当前无判定（平凡 pass） | pass 且不比较（防假阳性） |
| **python3 缺失 → PYBIN 回退 python 仍生效（D328 P2 回归）** | 当前裸 python3 静默 skip | python 回退执行 + 无 python 时显式 degraded 提示 |
| **own_set 预登记绕过防护**：synova-commit --files 先登记写集 → guard 仍对"认领 D# 冲突"文件 block | 当前 own_set 直接 pass（绕过）→ 断言 block 失败 | block（认领制判定在 own_set 之前） |

**第二步（green）**: 实现后全绿。

| 层 | 类型 | 数量 | 覆盖 |
|:---|------|:---:|------|
| L2 | Python 单元（新建） | ≥5 | 上述 5 用例（正常/降级/边界/劫持/豁免） |
| L1 | 集成验证 | 1 | 真实仓库：`bash scripts/control-tower/synova-commit --task-id D328 ...` 不自动改身份 |

## 5. 接线要求

| 变更 | 验证 |
|------|------|
| synova-commit 身份不再自动采用 | grep 确认 L297-305 替换为 `SESSION_ID="$TASK_ID"` |
| staging-guard 认领制判定 | grep 确认调用 resolve-commit-brief.sh + block 分支 |
| current-brief.<sid> | attach.py/task-start 写入 + .gitignore 忽略 + resolver 读取 |
| V4.7.1 | VERSION.md + version.log（同 commit；版本编排本任务独占） |

> **D331 升级 (2026-08-12 — KIMI K3 D329 审计 L4-3 WIRE CHECK 升级)**: 接线验收必须验证
> "生产调用方真实传递"——测试调用不计入 grep 物理证据。
>
> 生产调用点（DS6 物理证据: `rg -n "resolve-commit-brief.sh.*--session" scripts/` ≥1 真实命中）:
> - **staging_guard.py check_staging()** — 认领制判定调 resolver 传 `--session <session_id>`
>   （生产唯一调用点；synova-commit 无 resolver 调用——REGISTER_BRIEF 按文件名 glob 解析，
>   身份 = SESSION_ID=TASK_ID，不依赖认领）
> - commit-msg-check.sh 的 resolver 调用（无 --session，D330 范围，commit-msg hook 无 session 上下文）
>
> D331 同步修复（本 dev doc §3.1 文档-实现漂移）: write-set 条目已携带 task_id（继承 session）
> — 原 §3.1"write-set 记录含 task_id"声称在 D329 未实现，D331 补齐。

## 6. 完成标准

1. DS1: `tests/control-tower/staging-guard-session.test.py` 全过（≥5 用例；劫持复现 red→green 已证）
2. DS2: synova-commit 无显式 --session-id 时 `SESSION_ID=TASK_ID`（grep 确认，不再出现 resolver 结果赋值）
3. DS3: 劫持场景（session=D318 + D320 文件）→ staging-guard exit 1（认领制判定拦截）
4. DS4: 自己任务文件不被误伤（正常提交回归）
5. DS5: current-brief.<sid> 生效（attach.py SessionStart 写入 + session 专属优先）+ 全局 current-brief 去跟踪（`git rm --cached` + .gitignore）且无 session 时回退
6. DS6: VERSION.md 含 **V4.7.1（批次 D328+D329）** + version.log 追加 4.7.1（同 commit）
7. DS7: 全量审计 `python scripts/audit/audit-check.py --full` 与基线一致（439 FAIL）+ as any=0
8. DS8: 真实提交环境 12 组 pre-commit 全过、无 --no-verify、`git diff --name-only` 与写集一致
9. DS9 (D328 P2 折入): `command -v python3` 为空的环境下 commit-msg-check.sh 用 python/py 回退执行 GENUINE（测试注入 PATH 验证）；无 python 时输出显式 degraded 提示而非静默 skip

## 7. 自检清单

- [x] synova-commit L297-305 自动采用认领 brief 实测确认
- [x] staging_guard.py L86-87 own_set 放行 + L112-116 fail-open 实测确认
- [x] registry 现状：D320-dashboard-gitify 6 条写集（劫持后登记）实测确认
- [x] current-brief M 状态（多 session 覆盖）实测确认
- [x] 测试优先：劫持复现 = red 基准（§4 表）
- [x] D328 审计 P2 折入：commit-msg-check.sh 裸 python3 无 PYBIN 实测确认（L58）
- [x] 不是凭记忆
- [x] 不用 --no-verify
