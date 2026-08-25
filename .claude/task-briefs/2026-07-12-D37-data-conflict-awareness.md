## Q0: 定位 — 数据冲突上层感知
### a) 项目拼图
D29已在L4层实现冲突检测（createNode检测standardKey重复→写入has_conflict=true+data_versions[]），但L3零感知。本任务接通这根线。
### b) 文件审计
- has_conflict/data_versions: 仅graph-bridge.ts内部使用 → 需暴露只读查询
- evidence-store.ts: 无冲突字段列 → 需DDL扩展
- sentinel-runner.ts: aggregate前无冲突检测 → 需注入
### c) 决策
三步接线: graph-bridge暴露只读查询 → evidence DDL扩展 → runner注入warning

## Q1: 调研 — 引用来源 + memory教训
数据层规范§7: "当节点has_conflict=true时，任何消费该节点的哨兵和专家必须在输出中标注"
铁律1/4/5: 接线三环节（入口→处理→结果）
铁律24/31: catch+log+degraded, 降级信号传播

## Q2: 范围 — 正确的最简方案
做什么:
1. graph-bridge.ts 新增 getNodeConflictInfo 只读查询
2. evidence-store.ts DDL扩展(ALTER TABLE)+add()方法更新
3. sentinel-runner.ts 冲突感知注入（旁路增强）
不做什么:
- 不修改graph-bridge createNode冲突检测逻辑（D29已完成）
- 不新增哨兵 — 现有管线感知增强

## Q3: 验收 — 入口->处理->结果
入口: 哨兵runner定时触发→读取节点→调用getNodeConflictInfo
处理: 有冲突→写入Evidence(hasConflict=1)→哨兵findings收conflict warning
结果: 诊断报告出现"数据冲突警告: 节点X存在N个版本"

## 架构层: L3(洞察层)->L4(本体层) — L3消费L4 ✅
## Done 标准
- [ ] graph-bridge.getNodeConflictInfo(nodeId,g)返回{hasConflict,versions,currentVersion}
- [ ] evidence DDL含has_conflict+conflict_versions列
- [ ] evidence.add()支持hasConflict/conflictVersions参数
- [ ] runner检查节点冲突->追加warning finding
- [ ] tsc零新增错误/vitest零新增失败/零as any
- [ ] ≥6测试用例
