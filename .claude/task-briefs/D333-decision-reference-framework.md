#CRITERIA: A
## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
Synova = AI 诊断 Agent + 控制塔治理体系。本任务 = 创始人 2026-08-13 定 DECISION-REFERENCE.md（四步框架：①第一性原理 ②Anthropic 工程基线 ③开源实证 ④收敛检查），把它落地到任务启动流程，确保所有（含未来新开的）Claude Code session 在任务执行时遵循。

触发条件（框架文档 §2）：①多选项需取舍 ②设计/架构方案选择 ③优先级排序 ④"最佳实践是什么" ⑤实现与文档声称冲突。
现状缺口：task brief Q1 只有"Anthropic 决策链"（流程顺序 spec→test→impl→wire→verify），无决策方法 + 无参考系记录 → 决策依据不可审计（K3 审计只能看到"选了什么"，看不到"为什么、参考了什么"）。

### b) 文件审计
- scripts/workflow/generate-task-brief.py：Q1 模板（### a) 决策链 + ### b) 执行约束）— 新增 ### c) 决策参考系；Q0 c) 决策 — 追加提示
- scripts/control-tower/inject-context.py + context-injector.sh：D200 注入权威文档到 Q1c — 追加 DECISION-REFERENCE.md 注入
- scripts/control-tower/doc-registry.json：权威文档注册表 — 注册 DECISION-REFERENCE.md
- CLAUDE.md：项目指令（每个 session 必读）— 追加四步框架引用
- .codex/control-tower/VERSION.md：bump V4.7.5（PATCH；D332 独占 V4.7.4 在其后，接力补序模式已确立）

### c) 决策
模板字段追加（文件驱动最小机制），不动 pre-commit 硬门禁（反内卷：硬门禁无法判断"难决策"，只制造噪音）。版本编排：V4.7.5 置于 V4.7.4（D332 声明）之后，D332 落地后由其后继补序。

## Q1: 调研 — 决策链 + 执行约束
### a) Anthropic 决策链
① SPEC/Done → ② 测试 → ③ 实现 → ④ 接线 → ⑤ 验证。
引用依据：
- 铁律 0-2: spec → test → impl → wire → review → merge
- 铁律 35: 自动化优先（能写模板的不靠文档）
- DECISION-REFERENCE.md 自身：Anthropic（机器可验契约=决策记录随 brief 存档）+ DeepSeek（最少机制=只加模板字段，不加工厂）
- memory 教训：文档-代码版本漂移（V4.4.4）、模板残留检查（V4.2.7）

### b) 本任务执行约束（plan.json principles）
- rule: "brief 模板必须含 ### c) 决策参考系 字段"
  verify: "grep -c '决策参考系' scripts/workflow/generate-task-brief.py ≥ 1"
- rule: "DECISION-REFERENCE.md 必须被 doc-registry 注册 + 注入器可达"
  verify: "grep -c 'DECISION-REFERENCE' scripts/control-tower/doc-registry.json ≥ 1 && grep -c 'DECISION-REFERENCE' scripts/control-tower/inject-context.py ≥ 1"
- rule: "CLAUDE.md 必须引用 DECISION-REFERENCE（新 session 必读）"
  verify: "grep -c 'DECISION-REFERENCE' CLAUDE.md ≥ 1"

## Q2: 范围 — 正确的最简方案
做什么：
- scripts/workflow/generate-task-brief.py：Q1 新增 ### c) 决策参考系（四步 + 记录格式 `参考：Anthropic/DeepSeek + 结论`）；Q0 c) 决策 追加"冲突取舍 → 走 DECISION-REFERENCE 四步，结论写入 Q1c"
- scripts/control-tower/inject-context.py：注入器将 DECISION-REFERENCE.md 四步框架作为权威文档注入 Q1c
- scripts/control-tower/doc-registry.json：注册 DECISION-REFERENCE.md
- CLAUDE.md：流程约束行追加"决策参考：四步框架（docs/synova/coordination/DECISION-REFERENCE.md）"
- .codex/control-tower/VERSION.md：bump V4.7.5（PATCH，决策参考框架落地）+ version.log 运行时追加
- tests/control-tower/brief-template-decision.test.sh：新建（模板含决策参考系 + 注入器含 DECISION-REFERENCE + doc-registry 注册 + CLAUDE.md 引用，red→green）

不做什么：
- 不改 pre-commit-check.sh / 不加硬门禁（反内卷）
- 不改 task-start.sh 主流程（注入已由 context-injector 处理）
- 不改 docs/synova/coordination/DECISION-REFERENCE.md 本身（创始人定稿）
- 不重写已推送历史

## Q3: 验收 — 入口 → 交互 → 结果
入口：新 session 运行 `bash scripts/workflow/task-start.sh "任务"` → 生成的 brief 自动含 ### c) 决策参考系（四步框架 + 记录格式）
处理：Q0 c) 决策 提示冲突走四步；注入器把 DECISION-REFERENCE.md 注入 Q1c；CLAUDE.md 新 session 必读含引用
结果：任意新 session 生成的 task brief 均可 grep 到"决策参考系"；doc-registry 注册；CLAUDE.md 引用；V4.7.5 落地

## 架构层: 基础设施
（任务启动流程 + 上下文注入，L1-L5 之外；五层架构无涉）
## Done 标准
- [ ] DS1: tests/control-tower/brief-template-decision.test.sh 全过（red→green）
- [ ] DS2: grep -c "决策参考系" scripts/workflow/generate-task-brief.py ≥ 1
- [ ] DS3: grep -c "DECISION-REFERENCE" scripts/control-tower/doc-registry.json ≥ 1
- [ ] DS4: grep -c "DECISION-REFERENCE" scripts/control-tower/inject-context.py ≥ 1
- [ ] DS5: grep -c "DECISION-REFERENCE" CLAUDE.md ≥ 1
- [ ] DS6: 生成一个临时 brief 实测含 ### c) 决策参考系（模板接线验证）
- [ ] DS7: VERSION.md 含 V4.7.5 + version.log 追加
- [ ] DS8: 真实提交环境 12 组 pre-commit 全过、无 --no-verify
