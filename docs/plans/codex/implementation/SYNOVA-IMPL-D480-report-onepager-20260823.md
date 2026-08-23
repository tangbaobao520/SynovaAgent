<!--
  SYNOVA-IMPL-D480: 诊断报告一页纸渲染（部署可读性，GS-08 前置工程侧）
  状态: dev doc | 2026-08-23 | 优先级 P1
  权威文档: docs/synova/coordination/编码session派单-20260821.md（GS-08「报告可读（GS-01 产物 → 一页纸 + 移动端）」前置=报告模板）; src/agent/report-assembler.ts（四层报告组装 ceo/flywheel/expert/raw）; src/l3/report-templates.ts（executive_summary 模板已注册未消费）; AGENTS.md 铁律 4/5（入口→结果可见）
  依赖: D475（诊断循环真实化已合并）；报告模板格式待 K3 定稿——本任务实现**工程侧渲染与端点**，模板文案以现有 executive_summary 为准，K3 定稿后仅改模板数据不动物料
  并行: 写集=src/agent/report-assembler.ts + src/routes/diagnosis.ts + src/l3/report-templates.ts + tests/，与 D478（server.ts）、D479（middleware/auth.ts）**文件级零交集**，可 worktree 隔离并行
-->

# SYNOVA-IMPL-D480 诊断报告一页纸渲染

## 1. 权威文档引用

* **GS-08**（docs/synova/coordination/编码session派单-20260821.md）：「报告可读（GS-01 产物 → 一页纸 + 移动端）」前置=报告模板（K3 定稿）——本任务做工程侧：把诊断结果渲染成可读一页纸并暴露端点。
* **report-assembler**（src/agent/report-assembler.ts）：四层组装已存在——`assembleCeo`（≤200字瓶颈+建议）、`assembleFlywheel`（三飞轮评分+瓶颈哨兵）——一页纸的数据源已就绪。
* **report-templates registry**（src/l3/report-templates.ts）：`executive_summary` 模板已注册（built-in）但**全仓零消费**（`registry.render('executive_summary')` 无调用方）——闲置资产。
* **诊断路由**（src/routes/diagnosis.ts L244-252）：SSE 响应 `result.report` + `assembled`（JSON 对象），**无可读文本/一页纸格式**。

## 2. 代码审计——现状（全部实测 file:line）

### 缺陷 A：诊断报告无可读一页纸产出（老板不可读）
* `src/routes/diagnosis.ts` L244-252：reportDepth 非 raw 时 `assembleReport(...)` 产出 `assembled`（JSON 对象），SSE 返回原始 JSON —— 没有 markdown/HTML 一页纸，移动端/邮件场景不可读。GS-08 验收「一页纸 + 移动端」在工程侧缺渲染器与端点。

### 缺陷 B：executive_summary 模板已实现但闲置
* `src/l3/report-templates.ts` L116-119：`EXECUTIVE_SUMMARY` 已实现（「高管摘要 — 一句话结论+Top3+行动」），但 `rg "executive_summary" src/` 仅模板自身——**零渲染调用**，一页纸形态空转。**本任务只消费它，不改模板（避免 G12c 写集漂移）**。

### 缺陷 C：简报/诊断报告模板双轨
* `briefing-generator.ts` L124-134 用 `report-templates` registry 渲染 `daily_briefing`；而 `report-template-loader.ts`（extensions/reports/*.hbs）走另一套（file-driven-loaders 加载）——诊断报告未接任何一套。本任务接 registry（report-templates），不动 loader 轨（避免双轨纠缠）。

## 3. 实现方案

### 3.1 写集 (2 修改 + 1 新建)
| 文件 | 操作 | 说明 |
|------|------|------|
| src/agent/report-assembler.ts | 修改 | 新增 `renderOnePager(report: DiagnosisReport, depth: 'ceo'\|'flywheel'): string`——调 assembleCeo/assembleFlywheel 组装 `ReportData`（orgId/date/goals/alerts/obstacles/recommendations）→ `getReportTemplateRegistry().render('executive_summary', data)` 输出 markdown 一页纸；降级：render 抛错 → 返回纯文本组装（log.warn + degraded 语义） |
| src/routes/diagnosis.ts | 修改 | 报告响应附加 `onePager`（markdown 字符串）：reportDepth 非 raw 时调 `renderOnePager` 写入 `result.report.onePager`（渲染失败 → 不阻断，log.warn，原报告保留）；**新建** `GET /api/diagnosis/consult/:consultId/report?format=markdown`（实测 L66-299 仅 POST consult/status/interrupt/resume + GET status，无报告 GET 端点——新建真实存在） |
| tests/agent/report-assembler.test.ts | 新建 | renderOnePager 用例：①正常报告 → 输出含 CEO 摘要+建议的 markdown（red=无此函数 → green）；②空 rootCauses → 降级文案；③render 抛错 → 纯文本 fallback（degraded） |

> 共享资源标注（S-8）：本写集不含 VERSION.md（功能新增，非门禁/工具行为变化，不 bump）；current-brief / 暂存区共享，串行触碰；诊断报告路由与 D478 的 server.ts 挂载区不同文件，零交集。

### 3.2 最终实现同 commit 回填
若实现偏离方案（如 GET 报告端点实际已存在、或 renderOnePager 放 report-templates.ts 而非 report-assembler、或模板用 extensions/reports/*.hbs 轨），必须在本节同 commit 回填最终形态（S-6）。

### 3.3 不做的事
* 不改 report-template-loader（extensions/reports/*.hbs 轨，保持现状）。
* 不做移动端 UI/前端（本任务只出可读 markdown 字符串 + 端点，前端接入另排）。
* 不改 K3 的报告模板定稿（模板文案以现有 executive_summary 为准，K3 定稿后只改数据）。
* 不碰 D478（server.ts）/ D479（auth.ts）。

## 4. 测试要求（测试优先：先写 red → 再实现 green）

| 层 | 类型 | 数量 | 覆盖 |
|----|------|------|------|
| L1 | 单元 tests/agent/report-assembler.test.ts（新建） | +3 | ①正常报告 renderOnePager 输出 markdown（含瓶颈+建议）；②空 rootCauses → 降级文案；③registry.render 抛错 → 纯文本 fallback + degraded |
| L2 | 回归 既有 full-pipeline.integration + interview e2e | 全量 | assembleReport 四层行为不变 |

**RED 必须覆盖失败模式（S-5）**：用例①先以现状断言 `renderOnePager` 存在且输出 markdown → **修复前失败（函数不存在）** → 修复后通过；用例③渲染抛错不阻断主链路。

## 4.5 决策参考（S-12）
* 决策点 1：一页纸走 registry 还是 .hbs 轨？
  * 参考系：第一性原理——registry 的 executive_summary 已注册闲置，接上即用；.hbs 轨需处理 Handlebars 语法与客户覆盖，爆炸面大。
  * 结论：registry（report-templates）。
* 决策点 2：输出 markdown 还是 HTML？
  * 参考系：DeepSeek——最小可用；markdown 是移动端/邮件/网页的通用中间格式，HTML 可由 markdown 派生。
  * 结论：markdown（renderOnePager 返回 markdown 字符串）。

## 5. 接线要求

| 新 export/函数 | 调用方 | 确认方式 |
|---------------|--------|---------|
| renderOnePager | src/routes/diagnosis.ts 报告响应 | `grep -rn "renderOnePager" src/routes/diagnosis.ts` 命中且被调用 |
| executive_summary 渲染 | renderOnePager 内部 | `grep -rn "executive_summary" src/l3/report-templates.ts src/agent/report-assembler.ts` 双命中 |

> 生产调用点（S-3）：diagnosis.ts 是诊断报告生产入口（SSE/GET）；测试调用不计入。

## 6. 完成标准

* **DS1 渲染函数**：`grep -rn "renderOnePager" src/agent/report-assembler.ts` 命中（定义）。
* **DS2 端点接线**：`grep -rn "renderOnePager" src/routes/diagnosis.ts` 命中（生产调用）。
* **DS3 模板启用**：`grep -rn "executive_summary" src/agent/report-assembler.ts` 命中（renderOnePager 消费既有模板；report-templates.ts 零改动——避免 G12c 漂移）。
* **DS4 测试全绿**：`vitest run tests/agent/report-assembler.test.ts` 全 pass（red 先行已证）。
* **DS5 零回归**：full-pipeline.integration + interview e2e 绿 + `tsc --noEmit` 零新增（28=28）。
* **DS6 范围一致**：`git diff --name-only HEAD^` 与 §3.1 写集一致，无越界（不碰 D478/D479/DSH 写集）。
* **DS7 无绕过**：`grep -n "no-verify" .claude/bypass.log` 零命中。
* **DS8 推送 + CI**：`git push` 后 `git log origin/main..HEAD --oneline` 空 + CI 任务相关 job 绿。

## 7. 自检清单

* [ ] 每个代码审计 claim 有 file:line 证据（§2 grep 实测，不是凭记忆）
* [ ] 写集表标题后紧跟表格（无空行）
* [ ] 测试 red→green 覆盖失败模式（无渲染函数 → 有；渲染失败降级）
* [ ] 接线要求 ≥1 生产调用点（diagnosis.ts 报告入口）
* [ ] DS verify 命令真实可执行、映射到实际用例
* [ ] 版本编排：功能新增，非门禁/工具行为变化，不 bump VERSION.md
* [ ] 不用 --no-verify

## 8. 交付声明（声称↔证据对照表，U4 D423）

| 声称 | 证据命令 | 预期 |
|------|---------|------|
| DS1 渲染函数 | grep -rn "renderOnePager" src/agent/report-assembler.ts | 命中 |
| DS2 端点接线 | grep -rn "renderOnePager" src/routes/diagnosis.ts | 命中 |
| DS3 模板启用 | grep -rn "executive_summary" src/agent/report-assembler.ts | 命中 |
| DS4 测试全绿 | vitest run tests/agent/report-assembler.test.ts | 全 pass |
| DS5 零回归 | vitest run 相关 + tsc --noEmit | 全绿 + 零新增 |
| DS6 范围一致 | git diff --name-only HEAD^ | 与写集一致 |
| DS7 无绕过 | grep -n "no-verify" .claude/bypass.log | 零命中 |
| DS8 推送 + CI | git log origin/main..HEAD --oneline | 空（推送后） |

---

> 交付声明 DS 须与本文档 DS1-DS8 一一对应（S-10）；派发说明：与 D478/D479 **可并行**（写集零交集：report-assembler+routes/diagnosis / server.ts / middleware/auth.ts），必须 worktree 隔离；**只消费不改 report-templates.ts（executive_summary 已实现 L116-119，改它=G12c 漂移）**；报告模板文案以现有为准，K3 定稿后只改数据不动料；**合并顺序建议 D479 → D478/D480**（auth 语义是 D478 requireAuth 运行时依赖，先合 D479 保证集成测试环境一致）；merge main 时 reference-map 冲突由本任务所有者解决、bypass.log 噪声行不提交；暂存前查 session-registry（S-9）。
