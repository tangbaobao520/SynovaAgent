## Q0: 定位 -- D54 6模块提示词组装 (Prompt Assembler)
### a) 项目拼图
D53已完成9位专家的manifest.json结构化声明。D54将这些声明组装为可注入LLM的标准提示词--六个独立模块(M1-M6)，按专家类型+任务类型按需组装。M2(工具调用)必须在M3(推理链)前加载。Token预算 <=4000。
### b) 文件审计
- expert/*/manifest.json: 9个完整manifest，含edges/computes/boundaries/frameworks/moduleLoading
- src/agent/expert-file-loader.ts: 旧assemblePrompt(按IDENTITY/THEORY/SOUL分段), 不替换, D54是新模块
- src/agent/conversation-engine.ts: buildSystemPrompt(L0+L1+context), 后续可能消费D54但本次不接线
- src/l1/l0-global-prompt.ts: L0全量身份层(870 chars), D54各模块注入时参考其格式
### c) 决策
新建 src/agent/prompt-assembler.ts -- 6个模块独立函数，消费D53 manifest.json，输出 <=4K tokens的标准提示词。

## Q1: 调研 -- 第10份权威文档第二章 + memory教训
- 规范§2.1: 六模块定义表 -- M1角色/M2工具/M3推理/M4交叉验证/M5边界/M6数据冲突
- 规范§2.2: 加载顺序 -- M2必须在M3之前("数据先于判断")
- 规范§2.4: Token预算 <=4000 tokens, 按需加载
- manifest.json moduleLoading: always [M1,M2,M3,M5], onDemand {M4: "多专家协作", M6: "有数据冲突"}
- 铁律38: 零as any

## Q2: 范围 -- 正确的最简方案
做什么:
1. src/agent/prompt-assembler.ts -- 6个模块加载函数 (buildM1 ~ buildM6)
2. ExpertManifest 类型定义 (匹配 D53 manifest.json 结构)
3. PromptContext 类型定义
4. assemblePrompt(expertType, context) -- 主入口，按需组装6模块
5. Token预算控制: 超32000字符(~4000 tokens)则截断M3+降级
6. {{PLACEHOLDER}} 动态上下文注入
7. 加载顺序强制执行: M2必须在M3之前
不做什么:
- 不创建新的LLM调用管线
- 不修改 D53 的 manifest.json
- 不实现 M4 的交叉验证执行引擎 (归 D55)
排除: expert/*/manifest.json(D53产物), providers/base.ts(不改LLM调用)

## Q3: 验收 -- 入口->处理->结果
入口: assemblePrompt('finance', {findings: [...], edges: {...}, hasConflict: false})
处理: 加载manifest -> 判断场景(单专家/多专家/P0) -> 按需选择模块 -> M2先于M3 -> 组装 -> Placeholder注入 -> Token检查
结果: 返回 {systemPrompt, userMessage, tokenCount, modules, degraded}

## 架构层:
L2(编排层) -- src/agent/prompt-assembler.ts。主Agent调用以生成专家提示词。

## Done 标准
- [ ] 6个模块函数(buildM1~buildM6)全部实现
- [ ] assemblePrompt() 按需组装: 单专家=4模块(M1+M2+M3+M5), 多专家=6模块
- [ ] M2在M3之前加载(代码级排序保证)
- [ ] Token预算 <=32000字符(~4000 tokens): 超限截断M3
- [ ] {{PLACEHOLDER}} 动态上下文注入正常
- [ ] >=8测试用例
- [ ] tsc零新增错误 / vitest零新增失败 / 零as any
