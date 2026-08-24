# D316 — 控制塔 V4.6.0 修复（incident-loop 跨平台 + version.log + 推送积压）

任务 ID: D316 | Agent: claude-code | 会话: 2026-08-05-D313-D314 | 2026-08-05

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
Codex 审计 dev doc（SYNOVA-IMPL-D316-CT-V4.6.0-Fix-20260805.md）声称 3 缺陷。本任务逐一独立实测核实（不盲信 dev doc）：
- 缺陷 A: incident-loop.py verify() 硬编码 ["bash",...] — **实测确认真实**（纯系统 PATH 复现 WinError 2；Git 安装未写 bash 入 PATH）。**dev doc 漏了 attach.py:92 同款硬编码**（本任务补上）
- 缺陷 B: version.log 缺失 — **实测确认**（logs/ 4 件缺 version.log；log_version() 已实现未执行）
- 缺陷 C: D313-D315 共 4 提交未推送 — **实测确认**（origin..HEAD ahead 4）

### b) 文件审计
grep `["bash",` 于 scripts/control-tower/*.py：incident-loop.py:148 + attach.py:92（两处同款）。hook-git-detect.test.sh 无 EXIT trap（P2-1 实测确认）。VERSION.md 有 V4.6.0 首发但 version.log 从未生成。

### c) 决策
3 缺陷 + P2-1 全部真实 → 按 dev doc 方案修复，范围扩展 attach.py（dev doc 遗漏，需同步更新写集契约）。

## Q1: 调研 — 决策链 + 执行约束

### a) 决策链
① 测试先行 — incident-loop.test.sh 加**受限 PATH 断言**（确定性 red：受限 PATH 下修复前 degraded、修复后 fallback 找到 Git bash → closed）
② 实现 — incident-loop.py + attach.py `_find_bash()`（shutil.which + Git 显式路径 fallback + fail-open degraded）
③ P2-1 — hook-git-detect.test.sh EXIT trap
④ 缺陷 B — version.log 补写 4.6.0 + 追加 4.6.1；VERSION.md bump V4.6.1（PATCH，行为变化必须 bump）
⑤ 推送 — 4 积压 + D316（pre-push 门禁全过）
#CRITERIA: A

### b) 执行约束
- 铁律 0-2: spec（dev doc 已批准）→ test → impl → wire → review
- 铁律 24/31: _find_bash 失败必须返回 degraded（fail-open 绝不静默）
- 铁律 48: 测试有真实断言（closed + degraded 双路径）
- 环境事实: 本会话 Git Bash 下 bash 在 PATH（shutil.which 命中）→ 测试须用受限 PATH 构造 red，否则无法区分修复前后

## Q2: 范围 — 正确的最简方案是什么？

做什么（严格按 dev doc 写集 + 审计补漏）：
- scripts/control-tower/incident-loop.py：verify() bash 解析 → _find_bash()（shutil.which → C:\Program Files\Git\bin\bash.exe → Git\usr\bin\bash.exe → None → degraded）
- scripts/control-tower/attach.py：_run_parseable() 同款 _find_bash（dev doc 遗漏，审计补漏）
- tests/control-tower/incident-loop.test.sh：加受限 PATH 断言（bash 不可用 → degraded fail-open；fallback 生效 → closed）
- tests/control-tower/hook-git-detect.test.sh：P2-1 EXIT trap 清窗 + 失败汇总输出测试名
- .codex/control-tower/logs/version.log：新建（① 补写 4.6.0 首发；② 追加 4.6.1）
- .codex/control-tower/VERSION.md：增加 V4.6.1 条目（PATCH bump，与代码同 commit）
- docs/plans/codex/implementation/SYNOVA-IMPL-D316-CT-V4.6.0-Fix-20260805.md：写集表补 attach.py 行
- .claude/task-briefs/D316-ct-v460-fix.md：本 brief

不做什么（含文件路径）：
- 不改 scripts/hooks/hook-git-detect.sh（非缺陷根因）
- 不改 src/server.ts（及 src/ 下其他文件——D309/D310 清理独立任务；审计基线 439 FAIL 不变）
- 不改 scripts/control-tower/control_tower_log.py（log_version 已实现，仅执行）
- 不引入常驻 daemon（设计稿延后）
- 不做 CI 基线判定接线（ci-failures.json 只登记）

## Q3: 验收 — 入口 → 交互 → 结果

入口：`bash tests/control-tower/incident-loop.test.sh`（受限 PATH + 正常 PATH 双环境）
处理：_find_bash 解析 → subprocess 调用 → closed/degraded 双路径断言
结果：7/7 全过（含受限 PATH closed 断言）；hook-git-detect 13/13；logs/ 五件套；VERSION.md V4.6.1；推送后 origin..HEAD 空

## 架构层: 基础设施
控制塔（scripts/control-tower/ + tests/control-tower/ + .codex/control-tower/）。不触产品架构层代码。

## Done 标准
- [ ] incident-loop.test.sh 7/7（受限 PATH 下 verify 返回 closed，修复前为 degraded——red→green 已证）
- [ ] grep -rn '"bash"' scripts/control-tower/*.py 零结果（_find_bash 替代）
- [ ] .codex/control-tower/logs/ 五件套齐全，version.log 含 4.6.0 + 4.6.1 两条
- [ ] VERSION.md 含 V4.6.1 条目（与 D316 同 commit）
- [ ] git push 后 origin/feat/prompt-architecture..HEAD 为空（D313-D315 + D316 全部落库）
- [ ] pre-commit 12 组全过，无 --no-verify
