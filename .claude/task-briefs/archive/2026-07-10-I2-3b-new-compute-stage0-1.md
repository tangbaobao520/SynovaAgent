---
task_id: "I2-3b"
---

Q0 定位: 12条新边(环节0+1) × 1 compute + 3测试 = 24新文件。已有compute样本参考。

Q1 调研: 参考compute-channel-roi.ts格式(~50行, 契约ID+JSDoc+输入/输出/降级)。12条边JSON的requiredProps确定输入参数。

Q2 范围: 创建l1-input/目录下12个compute + 12个test + index.ts导出 + assumption-monitor.ts 3处旧名。
不动: 哨兵目录(阶段4), DEPLOYS/FUNDS(阶段4), compute逻辑以外的代码。

Q3 验收: 24个新文件存在。36+个it+expect。assumption-monitor.ts零EXTERNAL_ASSUMPTION_BINDS。

架构层级: L4 compute函数。

Done 标准: 24新文件 + 契约ID + 36+ it + tsc零错误 + vitest零失败 + 零as any
