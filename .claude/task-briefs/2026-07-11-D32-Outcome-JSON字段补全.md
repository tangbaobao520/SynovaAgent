## Q0: 定位 — 项目拼图 + 文件审计 + 决策
### a) 项目拼图
SynovaAgent — D32: Outcome JSON字段补全。数据层前置研究审计发现8个outcome JSON的optionalProps共约60个，42边需求85参数，覆盖率约60%。代码交叉审计确认7个字段全部缺失。
### b) 文件审计
financial.json(20 optionalProps)缺fixed_cost_ratio/unit_margin
operational.json(7 optionalProps)缺efficiency_rate/cycle_time/cross_dept_coupling
people.json(6 optionalProps)缺skill_match_rate/key_position_backup_rate
### c) 决策
逐JSON追加字段，不删除不修改现有字段。每个新字段标注type和description。

## Q1: 调研 — 引用来源 + memory教训
a) 数据层前置研究：7个缺口字段的完整清单
b) 42边JSON：273个unique参数
c) D31已创建7个适配器，prop引用outcome JSON字段→D32追加后D31自动获益
d) JSON追加操作为纯配置，不影响tsc/vitest

## Q2: 范围 — 正确的最简方案
做什么: 3个outcome JSON各追加2-3个optionalProps字段
不做什么: 不修改requiredProps; 不删除现有字段; 不修改.ts代码
排除: src/agent/data-ingest-service.ts(不改), extensions/ontology/field-mappings/*.json(不改)

## Q3: 验收 — 入口 → 交互 → 结果
入口: extensions/ontology/outcome/ (3个文件)
处理: 每个JSON的optionalProps追加指定字段
结果: 3个JSON新增7个字段，JSON.parse可解析

## 架构层: L5(数据层) — extensions/ontology/outcome/

## Done 标准
- [ ] verify: financial.json 新增 fixed_cost_ratio + unit_margin
- [ ] verify: operational.json 新增 efficiency_rate + cycle_time + cross_dept_coupling
- [ ] verify: people.json 新增 skill_match_rate + key_position_backup_rate
- [ ] verify: 零字段删除 + JSON.parse全部可解析
