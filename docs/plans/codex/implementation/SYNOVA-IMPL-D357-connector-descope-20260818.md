<!--
  SYNOVA-IMPL-D357: L5 连接器 descope（创始人裁决 B，MVP 仅上传/CSV/字段映射）
  状态: dev doc | 2026-08-18 | 优先级 P1
  权威文档: docs/synova/audit-reports/AGENT-CAPABILITY-FULL-CHAIN-AUDIT-20260813.md（K3 全链路审计 P0-2 L5「无 CRM/财务/HR 连接器」）; extensions/ontology/field-mappings/（crm/erp/hr-standard.json 已就绪）; 创始人裁决 B（2026-08-16）
  依赖: 无
  并行: 与 D358（extensions/sentinels/margin+capital）、D354（src/sentinel/runner+signal-aggregator）零文件交集，可 worktree 隔离并行；⚠️ 与 D359（同触 docs/synova/architecture/）禁止并行；⚠️ product-lines.yaml 是 DSH 地盘，派发前须确认 mac 侧 DSH 未在改该文件（跨机冲突）
-->

# SYNOVA-IMPL-D357 L5 连接器 descope（诚实降级声称）

## 1. 权威文档引用

* **K3 全链路审计** P0-2 L5：「三循环端到端全断 0/3——L5 无 CRM（Salesforce/HubSpot/钉钉）/ 财务（用友/金蝶/银行）/ HR（北森/钉钉）连接器」。
* **创始人裁决 B（2026-08-16）**：MVP 仅支持上传/CSV/字段映射通道，下掉「直连 CRM/财务/HR」声称；直连连接器按 DSH 迁移施工图 Stage 1+ 推进（非搁置）。
* **DSH 迁移施工图（2026-08-20）**：L5 数据连接器归核心服务——注册机制在 ✅，每客户凭证/字段映射属客户配置包（CFG）；Stage 0 部署前只动文档与配置，直连增量归 Stage 1+。
* **erp/crm/hr-standard.json**：字段映射已就绪（上传通道可用），直连连接器未实现。

## 2. 代码审计——现状

### 缺陷 A：架构文档声称「连接器管道 ✅」但真实连接器未实现

* `docs/synova/architecture/SYNOVA-ARCH-数据层(L5)-20260707.md`：L22「连接器管道」标 ✅、L28「外部系统（ERP、财务软件、电商后台）通过 Python 连接器接入」、L96「数据层三条采集通道齐全」——但 `synova_worker/connectors/` 仅 `feishu.py` 一个连接器，无 ERP/财务/电商直连。

### 缺陷 B：product-lines.yaml「04 数据接入」value 声称 CRM/ERP/HR 连接器

* `docs/synova/product-lines/product-lines.yaml` `04 数据接入` `value: "CRM/ERP/HR 连接器 + 文件导入 + 问卷"`——CRM/ERP/HR 三项直连连接器零实现（该项 baseline_note 已写「仅飞书+CSV」，但 value 未同步降级）。

### 缺陷 C：src/connectors/index.ts 注释声称钉钉/企微适配器

* `src/connectors/index.ts:4` 注释「国内轨: DomesticHub (飞书/钉钉/企微自研适配器)」——但 L9 只 export `FeishuConnector`，钉钉/企微适配器不存在。

## 3. 实现方案

### 3.1 写集（本 commit：2 修改；实现写集已随 b26e8d35 入库）
| 文件 | 操作 | 说明 |
|------|------|------|
| docs/synova/architecture/SYNOVA-ARCH-数据层(L5)-20260707.md | 修改 | 「连接器管道 ✅」→「管线已通、直连连接器按施工图 Stage 1+ 推进（非搁置），配置层照常」；1.1 节明确 Python 连接器仅 feishu.py，ERP/财务/电商直连归 Stage 1+ |
| docs/synova/product-lines/product-lines.yaml | 修改 | `04 数据接入` value 降级为「文件导入 + 问卷 + 飞书连接器（CRM/ERP/HR 直连按施工图 Stage 1+ 推进，配置层照常）」；CRM/ERP/HR 三个 acceptance_points 标 deferred |

> 历史实现写集（已随 b26e8d35 交付入库，不在本修订 commit 内）：`src/connectors/index.ts` L4 注释真实化（「国内轨: FeishuConnector（钉钉/企微待接入）」）。

> 共享资源标注（S-8）：本写集不含 VERSION.md（纯文档诚实性修正 + 1 行注释，非门禁/工具行为变化）；`docs/synova/product-lines/` 按创始人「D355-360 不变」口径纳入 Claude 线写集。**⚠️ 跨机冲突风险：`product-lines.yaml` 是 DSH（mac）的地盘，派发前须 grep/git log 确认 DSH 未在改该文件，否则先协调串行**；`docs/synova/architecture/` 与 D359 重叠，禁止与 D359 并行。

### 3.2 最终实现同 commit 回填

若实现偏离方案（如 product-lines.yaml 的 acceptance_points 改为删除而非 deferred），必须在本节同 commit 回填最终形态（S-6）。

### 3.3 不做的事

* 不实现真实 CRM/财务/HR 直连连接器（按施工图 Stage 1+ 推进，非搁置）。
* 不动 `synova_worker/connectors/feishu.py` 或 connector-pipeline（管线已通）。
* 不动 field-mappings（crm/erp/hr-standard.json 已就绪）。

## 4. 测试要求（grep 验证，非代码测试）

本任务纯文档 + 注释，无运行时逻辑，验证用 grep（red 先行）：

| 验证 | 命令 | red→green |
|------|------|-----------|
| 声称已降级 | grep -rn "CRM/ERP/HR 连接器\|连接器管道" docs/synova/architecture/SYNOVA-ARCH-数据层(L5)-20260707.md docs/synova/product-lines/product-lines.yaml | 修复前命中旧声称 → 修复后零命中或已改「推迟」 |
| 注释真实 | grep -n "飞书/钉钉/企微" src/connectors/index.ts | 修复前命中 → 修复后零命中 |

## 4.5 决策参考

* 决策点：CRM/ERP/HR acceptance_points 标 deferred 还是删除？
* 参考系：第一性原理——能力真实存在只是推迟，标 deferred 保留追踪、不删历史；Anthropic——诚实降级要可追踪；收敛——标 deferred + note。
* 结论：标 deferred（非删除），value 同步降级。完成报告必含决策记录（K3 可核）。

## 5. 接线要求

| 声称变更 | 确认方式 |
|---------|---------|
| 连接器声称降级 | `grep -rn "真实连接器未实现\|Stage 1+ 推进\|仅 feishu" docs/synova/architecture/SYNOVA-ARCH-数据层(L5)-20260707.md` 命中 |
| value 降级 | `grep -n "文件导入 + 问卷 + 飞书" docs/synova/product-lines/product-lines.yaml` 命中 |

## 6. 完成标准

* DS1 声称降级：`grep -rn "CRM/ERP/HR 连接器" docs/synova/architecture/SYNOVA-ARCH-数据层(L5)-20260707.md docs/synova/product-lines/product-lines.yaml` 零命中（或明确「Stage 1+ 推进」措辞）。
* DS2 注释真实：`grep -n "飞书/钉钉/企微" src/connectors/index.ts` 零命中。
* DS3 范围一致：`git diff --name-only HEAD^` 与 §3.1 写集一致（3 文件），无越界。
* DS4 无绕过：pre-commit 12 组全过，bypass.log 无 `--no-verify`。
* DS5 推送 + CI：`git push` 后 `git log origin/main..HEAD --oneline` 空 + CI 任务相关 job 绿（job 级）。

## 7. 自检清单

* [ ] 每个审计 claim 有 file:line 证据（§2 grep 实测，不是凭记忆）
* [ ] 写集表标题后紧跟表格、格式符合 verify-parallel 契约
* [ ] grep 验证 red→green（旧声称命中 → 降级后零命中）
* [ ] 版本编排：纯文档 + 注释，非门禁/工具行为变化，不 bump VERSION.md
* [ ] 不用 --no-verify

## 8. 交付声明（声称↔证据对照表，U4 D423）

| 声称 | 证据命令 | 预期 |
|------|---------|------|
| 连接器声称已降级 | grep -rn "CRM/ERP/HR 连接器" docs/synova/architecture/SYNOVA-ARCH-数据层(L5)-20260707.md docs/synova/product-lines/product-lines.yaml | 零命中 |
| 施工图措辞对齐 | grep -n "推迟到部署后\|推迟部署后" docs/synova/architecture/SYNOVA-ARCH-数据层(L5)-20260707.md docs/synova/product-lines/product-lines.yaml | 零命中（已改「Stage 1+ 推进（非搁置）」） |
| 注释已真实化 | grep -n "飞书/钉钉/企微" src/connectors/index.ts | 零命中 |
| 写集一致 | git diff --name-only HEAD^ | 3 文件，无越界 |
| 无绕过 | grep -n "no-verify" .claude/bypass.log | 零命中 |
| 推送 + CI | git log origin/main..HEAD --oneline | 空（推送后） |

---

> 交付声明 DS 须与本文档 DS1-DS5 一一对应（S-10）；并行派发各开 worktree 隔离（D307）；§3.2 最终实现同 commit 回填（S-6）。
