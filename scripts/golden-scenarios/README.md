# scripts/golden-scenarios/ — 黄金场景集（GSS，验收点的证据引擎）

> 依据: docs/plans/codex/strategy/SYNOVA-DESIGN-黄金场景与创始人驾驶舱-v1-20260816.md（v1.0）
> 定位: GSS 从"驾驶舱"降级为**产品进度页的证据工厂**（产品完成度仪表盘 v1.4 §八）——
>       场景绿 = 验收点证据；场景列表 = 验收点分布的可执行化。
> 归属: TASK-ROUTING.md 已登记 `scripts/golden-scenarios/ → 进行中·DeepSeek Harness·08-16`

## 当前状态（D361 已交付 common/ 基建）

- ✅ **common/ 四工具**（D361）：`bootstrap.ts`（临时端口起服务 + healthz 就绪）/
  `fresh-db.ts`（临时数据目录）/ `inject.ts`（fixture 契约校验 + 归一）/ `assert.ts`（机器断言引擎）。
- ✅ **断言规范**：`common/expect-schema.json`（机器契约）+ 本 README §断言规范。
- ⏳ **GS-01~GS-08 场景脚本本体属 D362-D364**，按创始人仲裁（08-16）：等 Win D366/D355-D357
  修复合并后再写 GS-02/03/04（脚本与修复解耦，零撞车）。默认顺序：GS-03 先行 → GS-02/GS-04 →
  GS-05 → GS-01 → GS-06 → GS-07/08。

## 断言规范（common/expect-schema.json，GSS 设计 §2.3）

1. **断言只认产品物理输出**：HTTP 响应 / 表行数 / 文件内容 / 进程退出码。禁止"人工看看差不多"。
2. **每条断言必须带 `purpose`**（证明产品哪个承诺，对应 C线标准/验收点）——缺 purpose 引擎拒绝执行（防恒真/空壳）。
3. **每场景 ≥3 条**：正常路径 + 降级路径 + 至少 1 条负向断言（`notContains` / `not_contains`）。
4. **三态语义**（K3 P0-3 fail-open 教训）：查询失败 = `error`（场景判 fail，显式告警）≠ 真空结果；
   真空（零结果）必须显式声明（如 `cell: {op: eq, value: 0}`），绝不当"通过"。
5. **机器判定**：`npx tsx common/assert.ts --expect <场景>/expect.json` → exit 0 = 全过，exit 1 = 有失败。
6. **证据自动对接**：证据 JSON 与 calc-progress.py 契约一致（schema=1 / record_type=scenario /
   verdicts[acceptance_point, verdict, quote]）→ 场景绿直接成为产品进度页的验收点证据（14 天有效期，A1 自动失效）。

## 铁律 0-4 防线（写进代码的物理执法）

- `bootstrap.ts` **只接受系统临时区数据目录**（fresh-db 产物），其余一律 exit 2——场景链结构上不可能触达真实库。
- fresh-db 不检查环境变量（08-16 实测：开发者会话常自带 SYNOVA_DB_PATH 指向真实库，误报且与本工具无关）。
- 场景运行绝不 cp data/synova.db；临时目录用完即删。

## 运行契约（设计 §2.2，场景脚本必须满足——D362+ 执行）

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
