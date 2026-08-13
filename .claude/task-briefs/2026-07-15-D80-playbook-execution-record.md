## Q0: 定位 -- D80 PlaybookExecutionRecord 持久化
### a) 项目拼图
D67已实现Playbook加载器。D80追加PlaybookExecutionRecord接口+SQLite持久化。支持执行轨迹审计(15字段)。
### b) 文件审计
- src/playbook/playbook-types.ts: PlaybookDefinition存在, 无PlaybookExecutionRecord→追加
- src/playbook/execution-store.ts: 零存在→新建
- src/playbook/playbook-loader.ts: 加载器存在, 无执行记录→集成
### c) 决策
追加类型+新建execution-store(5方法)+loader集成

## Q1: 调研
- §5: PlaybookExecutionRecord 15字段
- L5 SQLite playbook_executions表, 保留90天
- evidence-store.ts better-sqlite3模式

## Q2: 范围
做什么: PlaybookExecutionRecord接口/execution-store(DDL+5方法)/loader集成(recordPlaybookExecution)
不做什么: 不改PlaybookDefinition/不改loader核心/不实现前端

## Q3: 验收
入口: store.createExecutionRecord(record)→executionId
处理: store.getExecutionRecord(id)→完整记录/store.listByPlaybook/Enterprise→列表
结果: 执行轨迹SQLite持久化, 90天自动清理, 降级不阻断

## 架构层:
L5(存储层: execution-store.ts) + L4(本体层: playbook-types.ts)

## Done 标准
- [ ] PlaybookExecutionRecord 15字段完整
- [ ] DDL建表+3索引
- [ ] 5方法: create/get/listByPlaybook/listByEnterprise/cleanExpired
- [ ] loader集成: recordPlaybookExecution
- [ ] >=10测试 / tsc零新增 / vitest零新增 / 零as any
