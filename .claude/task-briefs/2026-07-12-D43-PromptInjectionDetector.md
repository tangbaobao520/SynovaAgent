## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
SynovaAgent — D43 提示注入防护。安全 P0。当前 message-sanitizer.ts 只做字符清洗（UTF-16代理项/控制字符/BOM），不检测注入。safety-guardrails.ts 在概念层定义了 NRA-01 注入安全约束，但无运行时检测。D41 已实现审计哈希链，可复用 audit-store.ts 记录注入事件。
### b) 文件审计
- `PromptInjectionDetector` — 零存在，全新模块
- `PolicyDeniedError` — D38 未实现，需新建
- `providers/base.ts` — chat()/stream() 调用前插入检测
- `audit-store.ts` (D41) — 复用审计日志
- `safety-guardrails.ts` — NRA-01 概念定义，不改
- `message-sanitizer.ts` — 字符清洗管线，不改
### c) 决策
三层检测: 分隔符模式(DAN/角色扮演分隔符) + 指令覆盖(忽略上述指令/新系统提示) + 越狱尝试(4+种已知越狱模式)。全确定性规则(零LLM调用)。

## Q1: 调研 — memory 历史教训 + 安全规范
a) 安全规范 5.1: 三层防护 — 分隔符模式/指令覆盖模式/越狱尝试。检测到注入->拒绝处理+审计日志
b) Claw Code ROADMAP: 71次恢复失败的工程教训 — 注入检测必须是不依赖LLM的确定性规则
c) memory/ 铁律24(catch+log+degraded) + 铁律38(零as any)
d) D41 审计哈希链 — audit-store.ts 防篡改审计日志就绪，复用 log() 记录注入事件

## Q2: 范围 — 正确的最简方案
做什么：
1. PromptInjectionDetector 类 — detect(content) -> {injectionDetected, patterns, severity}
2. 三层规则引擎（约15条规则，全部确定性正则/字符串匹配）
3. providers/base.ts 接入 — chat()/stream() 调用前检测
4. 拒绝处理：返回 PolicyDeniedError + 写入 audit-store 审计日志
5. PolicyDeniedError 轻量错误类

不做什么（含文件路径）：
- 不修改 src/providers/message-sanitizer.ts（字符清洗逻辑不变）
- 不修改 src/security/safety-guardrails.ts（NRA-01概念定义不变）
- 不实现 LLM-based 注入检测（无源文件—纯规则外延）
- 不实现数据投毒应急响应协议（对应安全规范5.4—不在本次范围）

## Q3: 验收 — 入口 → 交互 → 结果
入口: providers/base.ts chat()/stream() 收到用户消息
处理: PromptInjectionDetector.detect(content) -> 三层规则匹配 -> {injectionDetected, patterns[], severity}
结果: 无注入->正常调用LLM; 有注入->拒绝请求+写入审计日志+返回PolicyDeniedError

## 架构层: L3(洞察层) — src/security/prompt-injection-detector.ts
## Done 标准
- [ ] PromptInjectionDetector.detect() 返回 {injectionDetected, patterns[], severity}
- [ ] 三层规则 >=15条（分隔符/指令覆盖/越狱）
- [ ] providers/base.ts chat()/stream() 调用前检测
- [ ] 检测到注入写入 audit-store 审计日志
- [ ] tsc零新增错误 / vitest零新增失败 / 零as any
