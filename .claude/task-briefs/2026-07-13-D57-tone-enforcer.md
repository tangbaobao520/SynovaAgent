## Q0: 定位 -- D57 Tone四源融合+角色一致性
### a) 项目拼图
D54-D56已完成6模块提示词组装。D57添加Tone后处理管线(tone-enforcer) + M1/M2扩展 + report-assembler接入。
### b) 文件审计
- src/l3/tone-enforcer.ts: 零存在 → 新建
- src/agent/report-assembler.ts: assembleReport() return前需enforceReport
- src/agent/prompt-assembler.ts: buildM1/buildM2需扩展Tone声明+角色一致性+散文约束
### c) 决策
新建tone-enforcer.ts + 修改report-assembler.ts + 扩展prompt-assembler.ts M1/M2。不改M3/M4/M5/M6。

## Q1: 调研
- §5.1: Tone优先级 — P0>P1>P2
- §5.3: 角色一致性 — 财务不说战略语言
- §5.4: 散文格式 — 报告不用列表

## Q2: 范围
做什么: tone-enforcer(3函数) / report-assembler接入 / M1扩展(四源Tone+角色一致性) / M2扩展(一次一问) / resolvePromptMode
不做什么: 不改M3/M4/M5/M6 / 不改manifest / 不改conversation-engine

## Q3: 验收
入口: assemblePrompt('finance',{mode:'report'}) -> M1含Tone声明+散文约束
处理: enforceReport(text) -> 列表转散文 / resolvePromptMode(context) -> 'report'|'conversation'
结果: 提示词含四源Tone+角色一致性, 报告散文化后处理

## 架构层:
L3(tone-enforcer) + L2(prompt-assembler + report-assembler)

## Done 标准
- [ ] tone-enforcer: enforceReport/enforceConversation/enforceRoleConsistency
- [ ] report-assembler: return前enforceReport
- [ ] M1: 四源Tone融合+角色一致性+散文约束
- [ ] M2: 对话模式一次一问约束
- [ ] resolvePromptMode: mode/teamId+reportId推断
- [ ] >=16测试 / tsc零新增 / vitest零新增 / 零as any
