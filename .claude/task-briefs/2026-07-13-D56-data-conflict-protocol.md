## Q0: 定位 -- D56 数据冲突感知+交互协议
### a) 项目拼图
D54的M6只有has_conflict注入骨架。D56扩展为完整4条冲突规则+示例输出，并新增三个专家间交互原语(RequestValidation/Endorse/Challenge)，扩展M5的置信度三级标注+信息不足强制输出。
### b) 文件审计
- prompt-assembler.ts: buildM5/buildM6骨架存在, need expansion
- expert-interaction-protocol.ts: 零存在, need creation
### c) 决策
扩展buildM5/buildM6 + 新建 expert-interaction-protocol.ts。不改M1/M2/M3/M4。

## Q1: 调研
- 第四章4.1: has_conflict 4条规则(告知歧义/展示冲突版本/分别诊断/不默认选择)
- 第四章4.2: 三个交互原语
- 第四章4.3: 信息不足强制输出格式
- 第四章4.4: 置信度3级标注(>0.8陈述/0.5-0.8推断/<0.5猜测)

## Q2: 范围
做什么: buildM5扩展(3级置信度+信息不足) / buildM6扩展(4条规则+示例) / 新建expert-interaction-protocol.ts
不做什么: 不改M1/M2/M3/M4 / 不修改knowledge-conflict-handler.ts

## Q3: 验收
入口: assemblePrompt('finance', {hasConflict:true}) -> M6含4条规则
处理: RequestValidation('strategy','f1','reason') -> 结构化对象
结果: 提示词含冲突感知规则+三级置信度+交互原语可独立调用

## 架构层:
L2(编排层)

## Done 标准
- [ ] buildM6: 4条规则+示例输出
- [ ] buildM5: 3级置信度+信息不足强制输出
- [ ] expert-interaction-protocol: 3个原语函数
- [ ] 零as any / tsc零新增 / vitest零新增
