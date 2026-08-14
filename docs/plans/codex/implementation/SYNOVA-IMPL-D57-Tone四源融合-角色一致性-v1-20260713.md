# SynovaAgent — D57 Tone四源融合 + 角色一致性 实施方案 v1.0

> 2026-07-13 | 第10份权威文档（专家提示词工程）第五章
> 执行标准: Anthropic 工程纪律 · 铁律 0-2 (spec→test→impl→wire) · 五层架构 · 垂直切片
> **此文档为 claude code 的唯一执行依据。不依赖任何其他文档或口头记忆。**

---

## 执行约束（每次提交前必须回答的 5 问）

```
1. 接线检查: 新 export 谁调用？（grep 确认调用方存在，不是"我相信会有人调"）
2. 异常处理: 每个 catch 有 log + degraded？（铁律 24+31）
3. 类型安全: as any = 0？（铁律 38 — pre-commit 硬阻断）
4. 测试覆盖: 测试有 expect() 断言？（不是空壳）
5. 残留清理: 有死代码吗？旧文件删了？旧函数还有引用？
```

---

## 当前状态（2026-07-13 确认）

- 分支: `feat/prompt-architecture`
- D53: 9位专家AgentSpec文件化 ✅（manifest.json含tone字段）
- D54: 6模块提示词组装 ✅（prompt-assembler.ts，M1使用expert.tone）
- D55: 推理链+交叉验证两道防线 ✅
- D56: 数据冲突感知+交互协议 ✅

---

## 做了什么

### 1. src/l3/tone-enforcer.ts — ToneEnforcer后处理管线（新建）

核心价值: 不是往提示词里写"请用散文"，而是在报告输出管线上做确定性规则后处理。提示词注入是辅助——真正的保障在管线。

**enforceReport(text: string): {text: string, degraded: boolean}**
纯正则检测，不依赖LLM:
- 逐行检测，遇到 `- ` / `* ` / `1. ` / `2. ` 开头的行 → 合并相邻列表行为散文段落
- 转换策略: 2-3个列表项 → "几个因素同时作用：{{item1}}。{{item2}}。"；4+个列表项 → 分段，每段以自然语言引导
- 空输入/undefined → 返回原文本 + {degraded: true}
- 异常catch → log.warn + 返回原文本 + degraded（铁律24）

**enforceConversation(text: string): {text: string, multiQuestion: boolean}**
- 检测连续 `?` 或 `？` 数量 >= 2 → 标记 {multiQuestion: true}
- 不截断——只标记，由调用方决定如何处理

**enforceRoleConsistency(text: string, expertTone: string): {text: string, warnings: string[]}**
- 检查输出中是否使用了与当前专家tone明显不符的语言模式（例如财务专家使用了营销术语）
- 不替换文本——只产生warnings，由调用方决定是否重新生成
- 权威文档§5.3要求: 财务专家不说战略专家的语言

### 2. src/agent/report-assembler.ts — 接入tone-enforcer（修改）

在 assembleReport() 的 switch(depth) 后、return 之前调用:
```
const enforced = toneEnforcer.enforceReport(summary);
summary = enforced.text;
// 同时处理 data 中的 expertReports 数组，每个专家的报告内容也过一遍散文化
if (data.expertReports) {
  data.expertReports = data.expertReports.map(er => ({
    ...er,
    report: toneEnforcer.enforceReport(er.report).text
  }));
}
```

### 3. src/agent/prompt-assembler.ts — M1/M2扩展（修改）

**buildM1 扩展（四源Tone融合 + 角色一致性）:**
注入内容（基于权威文档§5.1/§5.2/§5.3）:
- P0(Professional objectivity): 准确性不可妥协。客观纠正 > 错误认同。避免过度赞扬。来源: Claude Code。
- P1(温暖度): 温暖但诚实。不预判用户能力。散文而非列表/子弹点。来源: Claude Opus 4.8。
- P2(性格表达): 可以有意见、有偏好。有性格的助手比搜索引擎好用。来源: Hermes SOUL.md。
- 公平呈现对立观点（来源: Fable 5）。在呈现数据冲突时，两个版本都呈现，不替老板选择"正确"版本。
- 角色一致性（§5.3）: 你当前的语调是"${expert.tone}"。使用你的专业语言，不要模仿其他专家的语调。财务专家不说战略专家的语言。
- 报告场景: 诊断报告用自然段落。复合发现写成"几个因素同时作用：首先……其次……"，不用层级缩进列表。每个发现独立成段。

**buildM2 扩展（对话场景约束）:**
对话场景（mode === 'conversation'）追加: "对话交互原则：一次只问一个问题。等待用户回答后再继续。诊断报告场景：可以在同一报告中提出多个发现，但每个发现独立成段。"（权威文档§5.2 Claude Opus 4.8行）

**resolvePromptMode(context):**
新增函数判定场景:
- 检查 context.mode，或从 context 中推断（如果 context.teamId 和 context.reportId 同时存在 → 'report'）
- 'report' → M1散文约束生效，M2无对话约束
- 'conversation' → M1完整tone（含角色一致性），M2一次一问约束

---

## 不做什么

- 不改 M3/M4/M5/M6
- 不改 9个 manifest.json 的 tone 字段
- 不修改 conversation-engine.ts 核心逻辑
- 不做LLM调用检测（tone-enforcer是确定性规则）
- tone-enforcer不截断文本（enforceConversation只标记multiQuestion，不修改原文）

---

## 架构层

L3（tone-enforcer: 洞察层后处理管线）+ L2（prompt-assembler + report-assembler: 编排层）

---

## 实施优先级

| 顺序 | 步骤 | 工时 | 文件 |
|:---:|-------|:---:|------|
| 1 | tone-enforcer.ts + 测试 | 3h | tone-enforcer.ts + test |
| 2 | report-assembler.ts 接入 | 1h | report-assembler.ts |
| 3 | prompt-assembler.ts M1扩展 | 2h | prompt-assembler.ts + test |
| 4 | prompt-assembler.ts M2 + mode判定 | 1h | 同上 |

**总工时: 7h（1个工作日）**

---

## 完成标准

```
[ ] tone-enforcer.ts: enforceReport() 检测 -/1./* 列表 → 转散文段落（2-3项合并，4+项分段）
[ ] tone-enforcer.ts: enforceConversation() 检测>=2个问号 → multiQuestion标记（不截断原文）
[ ] tone-enforcer.ts: enforceRoleConsistency(text, expertTone) 检测语言模式不匹配 → warnings[]
[ ] tone-enforcer.ts: 降级路径 — 空输入→原文本+{degraded:true} / 异常→log.warn+原文本（铁律24）
[ ] report-assembler.ts: return前调用 enforceReport(summary) + expertReports数组每一项也过散文化
[ ] prompt-assembler.ts M1: 四源融合声明 + P0>P1>P2 + 角色一致性(§5.3) + 散文格式(§5.4)
[ ] prompt-assembler.ts M2: 对话模式"一次一问" + 报告模式"每发现独立成段"
[ ] prompt-assembler.ts: resolvePromptMode 报告/对话场景判定
[ ] zero as any
[ ] npx tsc --noEmit 零新增错误
[ ] npx vitest run --changed 零新增失败
[ ] >=16测试: tone-enforcer 12（enforceReport: 散文化4/无列表2/空输入1/异常1 + enforceConversation: 单问号2/多问号1/异常1）+ tone-enforcer角色一致性2 + prompt-assembler 4（M1融合2/M2对话1/mode判定1）
```

---

## 权威文档引用

- 第10份权威文档: 专家提示词工程规范 第五章（Tone与行为约束）
  - §5.1: Tone优先级声明 — P0(Professional objectivity) > P1(温暖度) > P2(性格表达)
  - §5.2: 四源Tone规范融合 — Claude Code / Opus 4.8 / Fable 5 / Hermes + Synova应用列
  - §5.3: 角色一致性 — 财务专家不说战略专家的语言
  - §5.4: 报告输出格式 — 散文而非Markdown列表/子弹点