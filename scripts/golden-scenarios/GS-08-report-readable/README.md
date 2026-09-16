# GS-08 报告可读场景（D449 起，D791 改造为生产路径）

> 场景: 诊断完成 → 一页纸四槽位（结论 / 关键证据 / 各维度循环结论 / 行动建议）→ 条条可溯源
> 归属: scripts/golden-scenarios/ → DeepSeek Harness（进审计无豁免）
> 验收点: 产品线 3-1（一页纸报告结构）+ 3-7（一页纸含各维度循环结论）

## 一句话

用**真实存储与真实生产 HTTP 路径**把「诊断报告 → 一页纸四槽位 → 每条结论可回查到报告之外的物理记录」
跑成机器可判工件；断言引擎只认物理输出（文件内容 / HTTP 状态码），不认自述。

## 诚实 RED 声明（D791，**必读**）

本项目**不跑**真实 LLM 六阶段诊断——**契约级**验收：

| 面 | 真实性 |
|---|---|
| 诊断报告内容 | **fixture**（`fixtures/diagnosis-report.json`，形状对齐 `DiagnosisReport`，LLM 产物替身） |
| checkpoint 归档行 | **真实**（`SessionStore.saveDiagnosisCheckpoint`，phase=5，键=reportId） |
| 循环溢出快照 | **真实**（`SqliteGraphStore` + `writeOverflowSnapshot`，写后复读校验） |
| 渲染路径 | **真实**（`renderOnePager` / `executive_summary` 模板，与生产同一入口） |
| 读取路径 | **真实**（HTTP `GET /api/diagnosis/consult/:reportId/report?format=markdown`） |
| 指针解析 | **真实**（直读 `graph_nodes` 物理记录判存在性，不复用产品查询路径自证） |

> ⚠️ **禁止**把本场景结论冒充为「全链路 LLM 诊断已验」。本场景证明的是
> 「报告渲染 + 读取 + 溯源链路在真实生产路径上成立」，不是「LLM 诊断质量」。

另：`scripts/golden-scenarios/evidence/*` 为机器产物，`assert.ts` 的 `error` 三态语义
（"查询失败" ≠ "真空结果" ≠ "通过"）在本场景全量生效——任一断言 error = 场景 fail。

## 断言契约（23 条，机器判定；3 条负向）

13 条挂 3-1、10 条挂 3-7（`expect.json` 的 `evidence_map`）。

| # | id | 类型 | 判定 |
|---|----|------|------|
| 1 | `report-endpoint-ok` | 正常 | 生产端点返回 `status=200` |
| 2–5 | `slots-complete` / `slot-conclusion` / `slot-evidence` / `slot-actions` | 正常 | 生产 markdown 含四个固定槽位标题 |
| 6 | `slots-ok` | 正常 | `onepager-meta.json` `"slotsOk":true` |
| 7 | `budget-ok` | 正常 | 去空白字符数 ≤ 1200 |
| 8 | `conclusion-length` | 正常 | S1 结论 ≤ 200 字符 |
| 9 | `line-width` | 正常 | S2/S3/S4 条目行人类可见宽度 ≤ 60 |
| 10 | `deterministic` | 正常 | 同输入两次渲染字节相等 |
| 11 | `dimensions-complete` | 正常 | `missingDimensionCount=0`（不缺维度） |
| 12 | `dimensions-registered-only` | 正常 | `unregisteredDimensionCount=0`（不多维度） |
| 13 🚫 | `no-unregistered-dimension-fingerprint` | 负向 | `onepager.md` 无「供应链循环」（硬编码维度表指纹） |
| 14 | `pointer-coverage` | 正常 | `missingPointerLines=0`（条条带指针） |
| 15 | `pointer-resolved` | 正常 | `unresolvedCount=0`（无编造指针） |
| 16 | `pointer-no-unknown` | 正常 | `unknownCount=0`（无「判不了」态） |
| 17 🚫 | `external-traceable` | 负向 | `externalResolvableCount` 不为 0（**支柱② 判据**） |
| 18 🚫 | `no-false-calm` | 负向 | S3 片段无「平稳」（缺数据不得报平稳） |
| 19 🚫 | `no-fabricated-trend` | 负向 | 无快照变体 S3 片段无 `▲`（无数据不得造趋势） |
| 20 | `degraded-honest` | 正常 | 无 inputs 变体含 `[degraded]` |
| 21–23 | `hbs-loader-regression` / `hbs-render-regression` / `hbs-template-registered` | 回归 | D449 的 .hbs 轨（加载 / 渲染 / 注册）零回归 |

## 运行（K3 可独立重跑）

```bash
bash scripts/golden-scenarios/GS-08-report-readable/run.sh
# exit 0 = 23/23 断言通过
```

- **幂等**：临时库在系统临时区自建、退出即清理；工件按日期落在
  `scripts/golden-scenarios/evidence/GS-08-<date>/`（同日重跑覆盖为同名同内容，实测 14 文件 sha 全等）。
  → K3 独立重跑得到同一组工件。
- **工件目录不入版本库**（`.gitignore` 的 `scripts/golden-scenarios/evidence/GS-08-*/`）：
  它们是**机器生成**的日期戳产物（同 `docs/synova/DASHBOARD*.md` 的生成物语义），
  入版本库会被 D2 登记门禁判为「未登记文档」且污染文档台账。**重跑即重建**，无信息损失；
  机器断言单文件 `scripts/golden-scenarios/evidence/GS-08-<date>.json` 仍入版本库（K3 直接可读）。
- **点级证据入库**：`exit 0` 且当日 `docs/synova/product-lines/evidence/scenario-<date>.json`
  **不存在**时自动入库（evidence-writer.py + 补 `at` 全量 ISO）。
  同日重复跑不会产生 `-1/-2` 增量文件，也不改写既有证据（幂等保护）。
  强制跳过：`GS08_PUBLISH_EVIDENCE=0 bash ...run.sh`。

## 工件（`<OUT>` = `scripts/golden-scenarios/evidence/GS-08-<date>/`）

| 工件 | 用途 |
|---|---|
| `onepager.md` | 生产 HTTP 产物（四槽位 / 篇幅 / 指针审计对象） |
| `onepager-degraded.md` | 无 inputs 变体（S2/S3/S4 走 `[degraded]` 空态行） |
| `onepager-no-snapshot.md` | store 缺席变体（S3 全量「未建立基线」） |
| `cycle-slot.md` | 生产 `### 各维度循环结论` 段（负向断言 18 的精确作用域） |
| `cycle-slot-no-snapshot.md` | 无快照变体的 S3 段（负向断言 19 的精确作用域） |
| `pointer-audit.json` | 指针覆盖 / 解析三态 / 外部可溯源计数 |
| `dimension-audit.json` | S3 维度集合 vs `cycleRegistry.list()` 全集 |
| `onepager-meta.json` | 篇幅 / 单行 / 槽位 / 确定性 |
| `seed-meta.json` | 快照写入复读校验结果 |
| `audit-extra.json` | `httpMatchesLocal`（生产 HTTP 产物 ≡ 本地同输入渲染）等诊断面 |
| `report-endpoint-status.txt` | 生产端点 HTTP 状态码 |
| `load-result.json` / `render-meta.json` / `templates.json` | .hbs 轨回归面 |

## 可读性约束口径（D791 消解原 spec 内部歧义，**审计可核**）

spec §5.2 把「S1 结论槽 ≤200 字符」与「单行 ≤60」并列在同一张表——若二者作用域相同，
200 那行是死条文。**实现口径**（`auditOnePagerReadability` 的 JSDoc 同款声明）：

- `conclusionChars` / `conclusionCharsOk` → S1 结论行 ≤ **200** 字符；
- `maxLineChars` / `maxLineOk` → **S2/S3/S4** 条目行 ≤ **60** 字符；
- 两者均**剥离 `[src:…]` 指针后**计量（指针是审计元数据，单条 30–55 字符，非老板阅读面）。

**为什么必须剥离**：spec §5.4 自定的行文案格式
`- <循环名>：溢出 <值><单位>｜<箭头> <方向>｜<成熟度> [src:cycle:<id>@<月>]`
在真实 `cycleId`（如 `customer-cycle`）下实测 **67 字符**（含指针）——
≤60 在数学上不可满足。剥离后人类可见部分 33 字符（实测见 `audit-extra.json` / `onepager-meta.json`）。

## 验收（D791）

- [x] 场景脚本 + 审计工件 + 机器证据进 git
- [x] 机器判定 exit 0/1（`assert.ts` 三态）
- [x] 诚实 RED 标注（契约级、LLM 产物为 fixture，双处标注）
- [x] 负向断言 3 条（`no-unregistered-dimension-fingerprint` / `no-false-calm` / `no-fabricated-trend`）+ 支柱② 判据 `external-traceable`
