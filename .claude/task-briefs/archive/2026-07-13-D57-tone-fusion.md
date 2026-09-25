## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
SynovaAgent — 专家提示词工程P0。D57：Tone四源融合 + 角色一致性。
第10份权威文档第五章。D53/D54/D55/D56已完成。
核心价值：报告输出后处理（非字符串注入）。

### b) 文件审计
| 审计项 | 状态 | 行动 |
|--------|------|------|
| tone-enforcer.ts | 零 | 新建 — 散文化后处理 |
| report-assembler.ts | assembleReport() | 修改 — 调用toneEnforcer |
| prompt-assembler.ts M1 | 5行硬编码 | 扩展 — 四源融合+P0>P1>P2 |
| prompt-assembler.ts M2 | 工具调用模板 | 扩展 — 对话一次一问 |
| manifest.json tone | 9个已存在 | 消费，不改 |

### c) 决策
2新建 + 2修改。核心是产品行为改变：tone-enforcer做后处理管线，report-assembler接入。

## Q1: 调研
a) 5.1: P0(Professional) > P1(温暖度) > P2(性格)
b) 5.2: 四源 — Claude Code/Opus 4.8/Fable 5/Hermes
c) 5.4: 散文格式，不用Markdown列表
d) report-assembler: switch(depth)后 return前 插入后处理
e) 铁律24/38

## Q2: 范围
做什么:
1. src/l3/tone-enforcer.ts — enforceReport()检测列表→转散文, enforceConversation()多问→标记
2. tests/l3/tone-enforcer.test.ts — >=8用例
3. src/agent/report-assembler.ts — assembleReport()调用enforceReport()
4. src/agent/prompt-assembler.ts — M1四源+P0>P1>P2, M2一次一问
5. tests/agent/prompt-assembler.test.ts — 更新M1/M2

不做什么:
- 不改 M3/M4/M5/M6
- 不改 manifest.json
- 不做LLM调用 (tone-enforcer纯确定性规则)

## Q3: 验收
入口1: assembleReport(report) → toneEnforcer.enforceReport(summary) → 列表转散文
入口2: assemblePrompt(finance, report) → M1四源融合, M2无对话约束
入口3: assemblePrompt(finance, conversation) → M2一次一问
处理: 纯正则检测Markdown语法→替换, 不依赖LLM

## 架构层
L3（tone-enforcer）+ L2（prompt-assembler + report-assembler）

## Done 标准
- [ ] tone-enforcer.ts: enforceReport() 检测 -/1./* 列表 → 转散文
- [ ] tone-enforcer.ts: enforceConversation() 检测>=2个问号 → multiQuestion
- [ ] tone-enforcer.ts: 降级 — 空输入→原文本+degraded
- [ ] report-assembler.ts: return前调用 enforceReport(summary)
- [ ] prompt-assembler.ts M1: 四源声明+P0>P1>P2
- [ ] prompt-assembler.ts M2: 对话模式一次一问
- [ ] 零as any / tsc零新增 / vitest零新增
- [ ] >=12测试: tone-enforcer 8 + prompt-assembler 4