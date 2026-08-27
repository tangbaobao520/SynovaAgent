# 派单：会话 worktree 隔离（D539）

> 派单: CTO | 2026-08-27 | 认领: 📋 dev-doc（写 spec，后续编码执行）
> 方法论: 并行协作架构治理——根治 M8 共享暂存区竞争 + M13 测试沙箱污染（db 损坏 7 天的根因）
> 流程: dev-doc 出 spec → 编码实现 → K3 审计 → CTO 合并
> 上一轮教训: M8（共享暂存区竞争，08-16 D394 首次 / 08-23~27 反复复发）/ M13（测试沙箱污染真实仓库，08-20 db 损坏 + 前科 core.bare=true/user.name=test）/ CT-42（current-brief 会话专属接线，台账 08-16 登记未落地）

---

## 写前核实（强制清单 — §〇c ①）

- [x] ① 任务来源/依赖: 并行协作架构治理（Win 侧 Codex「独立 clone」方案 + CTO 评估结论「先一个 session 一个 worktree，零膨胀根治」）。上游已合 main：D515 项1「并行隔离软告警」+ D537 #2「主树占用检测」均在 `pre-commit-check.sh:749-761`（本地软告警不阻断，CI 权威）。
- [x] ② task-state 最新状态: D539 已 `alloc-task-id.sh` 登记（status=claimed），空壳 `task-state/D539.json`。
- [x] ③ 基线资产实际存在（物理确认）:
  - `scripts/workflow/task-start.sh`（4310B）——:66-69 写**全局** `current-brief`（D513 恢复，Claude 线 attach 依赖）
  - `scripts/control-tower/worktree-manager.py`（12599B）——**已有 `create <sid> [--base]` + `list`**，现成 worktree 建仓工具
  - `scripts/pre-commit-check.sh:749-761`——主树提交软告警已存在（活跃 session>1 告警，提示 worktree-manager.py create）
  - `scripts/control-tower/resolve-commit-brief.sh`——**grep 不到 `--session` 参数**（D329 声称的会话专属机制疑似未实现/已退化，见 §⑥）
- [x] ④ DSH 借鉴核查: 见下「DSH 借鉴核查」章节（四色 🟡治理层 + 🔵session 隔离范式）。
- [x] ⑤ 写集重叠检查: D539 未占用（刚取号）；与在途 D538（前端左栏）不重叠（本单是控制塔脚本，D538 是前端产品）；与 Stage 1 续审计（D534/D535）不重叠。
- [x] ⑥ 上一轮教训: M8/M13/CT-42 三条（本单正是根治这三条，见 §⑥ 详述）。

## DSH 借鉴核查（强制章节 — §〇b 三步）

1. **施工图四色归属**：本任务改的是 `task-start.sh` + hook + `current-brief` 协调机制——属 🟡 治理层（工程治理，独立节奏）；其中「session 隔离范式」对应施工图 §3 🔵 借 DSH 清单（`src/store/` SessionStore 事件溯源、core/session）。
2. **借鉴边界判定**：**有 DSH 可借鉴（理念级）**——DSH 的 session 隔离范式「每个 session 独立上下文 + 独立持久化存储，不共享全局单例状态」。借鉴理念自研（Stage 1），**不引代码、不 npm install**（红线 R1/R3）。
3. **DSH 源码参考**（读范式，不 copy）：
   - `~/.nvm/versions/node/v24.19.0/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-session/` —— 会话隔离核心（每 session 独立 id + 独立存储句柄）
   - `@deepseek-ai/dsh-session-persistence-jsonl/` —— 每 session 独立 JSONL 持久化（对应我们 `current-brief.<sid>` 每 session 独立文件的思路）

> 红线：借鉴 = 读范式自研；不 copy DSH 代码、不复制 OpenViking（AGPLv3）；验收含接线审计。

---

## 切片定义（CTO 已定，dev-doc 复核）

| 切片 | 用户可见价值 | 验证锚点 | 依赖 |
|---|---|---|---|
| D539（本次） | 并行 session 物理隔离——不再互相覆盖/污染 | CT-42 闭环 + M8 根治 + M13 症状消减 | 上游 D515/D537 已合 main |
| （后续，可选）独立 clone 试点 | 彻底对象库隔离 | 成本实测后创始人再拍板 | 本单落地后 |

## 现状材料（dev-doc 必读，全部在 main，先读实际代码不凭记忆）

| 资产 | 位置 | 状态 | 与本单的关系 |
|---|---|---|---|
| task-start.sh | `scripts/workflow/task-start.sh` | :66-69 写全局 current-brief | 需加「主工作区检测 → 强制建 worktree」 |
| worktree-manager.py | `scripts/control-tower/worktree-manager.py` | **create `<sid>` / list 已存在** | 现成 worktree 建仓工具，需接线到 task-start 流程 |
| 主树软告警 | `scripts/pre-commit-check.sh:749-761` | 本地软告警不阻断 | 需升级为「开工端物理阻断」（不是提交端软告警） |
| resolver | `scripts/control-tower/resolve-commit-brief.sh` | **无 `--session` 参数** | ⚠️ D329 声称的会话专属机制需核实（M2 嫌疑） |
| 会话专属 brief 残留 | `.claude/current-brief.D502/D503/D506` | 曾存在会话专属文件 | 证明机制曾写过专属文件，但 resolver 现在不读 |

## D539：session-worktree-isolation（根治并行干扰）

**目标**：两个 session 并行时，各自在独立 worktree 工作，物理上不互相覆盖协调文件、不抢写 index、不污染真实仓库。

**依赖**：无（上游 D515/D537 软告警已合 main，本单把它们升级为物理强制）。

**spec 必答题**（dev-doc 必须回答，缺一返修）：

1. **主仓只读化**：`feat/d505-impl`（主工作区，已落后 main 426 commit）如何废弃/归档？主仓作为 worktree 源头的具体机制是什么？——需给出「session 在主工作区 commit/checkout 时被物理阻断」的 hook 设计（复用现有 hook-block-write.sh 还是新检测？）。

2. **开工强制 worktree**：`task-start.sh` 如何检测「session 在主工作区操作」？检测到后如何阻断并引导 `worktree-manager.py create <sid>`？——需给出检测逻辑 + 阻断点 + 与 worktree-manager.py 的接线设计（接线审计：新函数 grep 有生产调用点）。

3. **会话专属 brief 接线（CT-42）**：**先核实 D329 的真实现状**——`resolve-commit-brief.sh` 是否曾支持 `--session` 读 `current-brief.<sid>`？若已退化/未实现，spec 需诚实标注「机制需重写，非接线」；若在其他文件，给出真实位置。然后设计「废除全局 current-brief，强制会话专属」的完整方案。

**验收**（物理可复现，禁止静态 grep 冒充）：

- **隔离断言**：临时 git 沙箱中模拟两个 session 并行——A session 在自己 worktree commit，B session 的暂存区/current-brief 不受影响（断言：B 的 index 和 current-brief 零变化）。
- **阻断断言**：session 在主工作区 `git commit` 被 hook 拦截（exit != 0 + 提示建 worktree），在独立 worktree commit 放行。
- **接线断言**：`grep -rn "新函数名" scripts/` 有真实生产调用点（测试调用不计）。

## 写集约束

- **可碰**：`scripts/workflow/task-start.sh`、`scripts/control-tower/`（hook / resolver / worktree-manager.py）、`.claude/current-brief*` 相关逻辑。
- **不碰**：`src/`（产品代码，铁律红线）、`scripts/audit/`（K3 专属，红线）、`scripts/pre-commit-check.sh`（门禁本体，除非 spec 明确需改且 CTO 单独审）。
- **防膨胀（红线）**：**零新组件**——复用 worktree-manager.py + 现有 hook；禁止新增独立守护进程/服务/新 launchd 任务；禁止引入 DSH 依赖。
- 串行：本单与 D538（前端）无依赖，可并行；但本单内部三问（主仓只读化 → 强制 worktree → 会话 brief）是依赖序。

## 切片级审计

- 本单 1 个 D 完成后一次提审（K3 审 D539），报告覆盖 D539。
- task-state 加 `"slice": "parallel-isolation"` 字段。
- 审计验收 = 验证锚点「CT-42 闭环 + M8 根治」从 claimed → verified。

## 给 dev-doc 的交付要求

1. **spec 文件命名**：`docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D539-session-worktree-isolation-20260827.md`
2. **验收物理可复现**：每条验收带「命令 + 断言 + 预期输出」，禁止文档声称冒充（M2 红线）。
3. **诚实声明**：D329 会话专属机制若核实为「未实现/退化」，spec 开头显式声明「机制需重写，非接线」（防 M7 文档-实现漂移）。
4. **DSH 借鉴落地**：spec 含「借鉴 dsh-session 隔离范式」小结（理念，不引代码）。

---

## 写后自检（强制清单 — §〇c ③）

- [x] ① 验证锚点正确（CT-42 闭环 + M8 根治，非产品 26 线验证点——本单是控制塔治理任务）
- [x] ② D# 未占用（alloc-task-id 确认：D539，task-state 已登记）
- [x] ③ 依赖链正确（上游 D515/D537 已合 main；本单三问内部依赖序：主仓只读化 → 强制 worktree → 会话 brief）
- [x] ④ DSH 借鉴核查三步完整（四色 🟡/🔵 + 借鉴边界「理念级」+ 源码 dsh-session/dsh-session-persistence-jsonl）
- [x] ⑤ 现状材料全部核实过（grep/ls 物理确认：task-start.sh:66-69、worktree-manager.py create、pre-commit:749-761、resolver 无 --session）
- [x] ⑥ 验收物理可复现（隔离断言/阻断断言/接线断言，均命令+断言）
- [x] ⑦ 术语一致（控制塔「session 隔离」口径，非 Win 线 AUTH 口径）
- [x] ⑧ 无遗漏（执行方=dev-doc、交付要求 spec 命名+诚实声明、审计验收项）

**交付门槛**：dev-doc 拿到派单可直接开工（基线/依赖/写集/借鉴全给）+ K3 审计可核（验收物理可复现）。

---

## 派单说明（给创始人复制——自包含，零查找）

```
【派单】会话 worktree 隔离（D539）
> 认领: 📋 dev-doc（写 spec）→ 编码执行

## 背景（一句话）
并行 session 互相干扰（覆盖 current-brief/抢写主树/污染 db）是 db 损坏 7 天的根因；本单落地「一个 session 一个 worktree」根治，零新增组件。

## 现状材料（执行方必读）
- scripts/control-tower/worktree-manager.py —— 已有 create <sid> 建 worktree 工具，直接接线
- scripts/workflow/task-start.sh:66-69 —— 现在写全局 current-brief，要改成会话专属
- scripts/pre-commit-check.sh:749-761 —— 主树占用软告警已存在，要升级为开工物理阻断
- scripts/control-tower/resolve-commit-brief.sh —— ⚠️ 无 --session 参数，D329 声称的会话专属机制疑似未实现（先核实再设计）

## spec 必答题
1. 主仓只读化：feat/d505-impl 如何废弃？session 在主工作区 commit 如何物理阻断？
2. 开工强制 worktree：task-start.sh 检测主工作区 + 阻断 + 引导 worktree-manager.py create 的接线设计
3. 会话专属 brief：先核实 D329 现状（resolver 是否曾支持 --session），再设计 current-brief.<sid> 强制方案

## 写集约束
- 可碰: scripts/workflow/task-start.sh、scripts/control-tower/、.claude/current-brief* 逻辑
- 不碰: src/（产品代码）、scripts/audit/（K3 红线）、pre-commit-check.sh（除非 CTO 单独审）
- 防膨胀: 零新组件，复用 worktree-manager.py + 现有 hook，禁止引入 DSH 依赖

## 验收（物理可复现）
- 隔离断言: 双 session 并行，B 的暂存区/current-brief 零变化
- 阻断断言: 主工作区 commit 被拦（exit≠0），独立 worktree 放行
- 接线断言: 新函数 grep 有真实生产调用点

## 交付要求
1. spec 命名: docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D539-session-worktree-isolation-20260827.md
2. 验收物理可复现（命令+断言，禁止文档声称）
3. 诚实声明 D329 现状（未实现就说未实现，防 M7 漂移）
```
