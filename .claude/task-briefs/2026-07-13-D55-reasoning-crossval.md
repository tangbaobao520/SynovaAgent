## Q0: 定位 -- D55 推理链 + 交叉验证两道防线
### a) 项目拼图
D54已完成6模块提示词组装骨架(M1-M6)。D55填充M3(推理链)和M4(交叉验证)的完整实现内容: 四层追溯协议 + 两道防线 + 循环检测。
### b) 文件审计
- src/agent/prompt-assembler.ts: buildM3/buildM4骨架存在, detectExpertLoop零存在
- expert/*/manifest.json: edges字段可用于M3的42边引用, dependencies.peers可用于循环检测
### c) 决策
扩展prompt-assembler.ts的buildM3/buildM4, 新增detectExpertLoop纯函数。不改M1/M2/M5/M6, 不改assemblePrompt主逻辑。

## Q1: 调研 -- 第10份权威文档第三章 + D54 + memory
- 规范§3.1: 四层追溯协议(症状->传导->结构->根因), 每层引用42边
- 规范§3.2: 两道防线(格式定义+循环检测)
- D54: M3/M4骨架, PromptContext/ExpertManifest类型
- 铁律38: 零as any
- 约束3: 循环检测纯确定性, 零外部调用

## Q2: 范围
做什么:
1. 扩展buildM3(): 四层追溯协议完整内容(4层结构+每层关键边+输出要求)
2. 扩展buildM4(): 两道防线(格式定义+循环检测规则)
3. 新增detectExpertLoop(): 三色标记DFS检测有向图循环
4. 更新truncateM3Content匹配新M3格式
不做什么:
- 不改D54的M1/M2/M5/M6模块
- 不改assemblePrompt主逻辑
- 不创建新文件(所有改动在prompt-assembler.ts内)
排除: expert/*/manifest.json(D53), 现有D54测试

## Q3: 验收
入口: assemblePrompt('finance', context) -> systemPrompt含四层追溯+交叉验证规则
处理: M3层1-4完整展开(每层42边引用), M4含两道防线, detectExpertLoop独立调用
结果: 系统提示词中推理链格式正确, 交叉验证规则完整, 循环检测可独立使用

## 架构层:
L2(编排层) -- src/agent/prompt-assembler.ts。扩展buildM3/buildM4。

## Done 标准
- [ ] M3: 四层追溯协议完整实现(4层, 每层含42边引用+输出要求)
- [ ] M4: 两道防线(格式定义+循环检测规则)
- [ ] detectExpertLoop()纯函数返回{hasLoop, path[]}
- [ ] 不改M1/M2/M5/M6和assemblePrompt主逻辑
- [ ] >=8测试(已26个)
- [ ] tsc零新增错误 / vitest零新增失败 / 零as any
