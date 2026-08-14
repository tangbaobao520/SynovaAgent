# scripts/golden-scenarios/ — 黄金场景集（GSS，验收点的证据引擎）

> 依据: docs/plans/codex/strategy/SYNOVA-DESIGN-黄金场景与创始人驾驶舱-v1-20260816.md（v1.0）
> 定位: GSS 从"驾驶舱"降级为**产品进度页的证据工厂**（产品完成度仪表盘 v1.4 §八）——
>       场景绿 = 验收点证据；场景列表 = 验收点分布的可执行化。
> 归属: TASK-ROUTING.md 已登记 `scripts/golden-scenarios/ → 进行中·DeepSeek Harness·08-16`

## 当前状态（D371 阶段）

- 本目录当前只落**骨架**（本 README + evidence/ 目录）。
- **GS-01~GS-08 场景脚本本体属下一任务（设计 §八 D361-D364）**，交付顺序按创始人已批：
  GS-03 资本循环先行（一行修 manifest 起步）→ GS-02/GS-04 → GS-05 → GS-01 → GS-06 → GS-07/08。

## 运行契约（设计 §2.2，场景脚本必须满足——下一任务执行）

1. fresh-db（临时库，测后删除；真实库只读；禁止 cp data/synova.db——铁律 0-4）
2. bootstrap 服务（临时端口；就绪探测 healthz）
3. inject fixture（crm-standard / erp-standard / hr-standard / 问卷 / 敏感数据）
4. 触发（API 调用 / cron 手动 run）
5. 断言（逐条执行 expect.json → 结果 JSON；每场景 ≥3 条：正常 + 降级 + ≥1 负向断言）
6. 证据产物写 evidence/GS-XX-<date>.json（git 跟踪）
7. exit 0 = 全部断言过；exit 1 = 任一失败（失败明细入 JSON）
8. 幂等：重复跑结果一致；中途失败也须清理临时资源

## 证据目录约定

- `evidence/GS-XX-YYYYMMDD.json` — 场景运行证据（calc-progress.py 消费，"场景实测"类）
- 证据有效期 14 天；证据日期后相关线代码有 git 变更 → 自动标"待重跑"（A1）

## 红线

- 断言必须机器判定（exit 0/1），禁止"人工看看差不多"；禁止恒真断言（echo true 类）。
- 证据只入 git，不靠"我记得跑过"。
- 场景脚本 = Harness 代码 → 进审计范围，无豁免。
