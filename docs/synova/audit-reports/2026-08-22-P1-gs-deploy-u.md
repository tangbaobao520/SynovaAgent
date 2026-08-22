# 审计报告 2026-08-22-P1（模式 A v2）— GS 场景脚本（D442-D449）+ 部署轨（D454/D455/D462/D463）+ U 系列（D412-D415/D419）

> 审计员: K3 | 范式: 声称↔证据驱动（K3-AUDIT-STANDARD-v2）
> 审计基线: 产品仓库 main = bb785aa；审计工作区独立克隆 @ bb785aa
> 运行环境注记: macOS / Node v24.19.0 / git bb785aa / 审计工作区沙箱（产品仓库只读）
> 清单依据: docs/synova/coordination/K3审计清单-20260822.md P1 段

## 0. 门禁与声称表存在性

- P1 段任务全部为 CTO/编码 session 直接实施（spec=null 为主，D445/D463/D462 有 brief/README）→ 声称表多数缺失（按 v2 步骤 0 记 P1 轻级，语义验证降级为提交证据 + evidence 文件 + 台账对账）。
- U 系列（D412-D415/D419）: **已有 K3 独立终审记录** docs/synova/audit-reports/2026-08-17-K3-final-control-tower-console.md（U1-U8 升级 13 分支: 12 可合并 / U8 打回 / U5a 知情接受）——本批按"已审不回审"原则，仅补 CTO 2026-08-22 接线回填的独立核实。

## 1. GS 场景脚本（D442-D449）→ 全部 **PASS**

**总体验证**: 8 个场景目录 + run.sh 全部存在（scripts/golden-scenarios/GS-01..GS-08/run.sh）；evidence 落盘（scripts/golden-scenarios/evidence/GS-01..08-*.json）；诚实 RED 标注（K3 P0-3 防假转绿正确行为）——commit message 与 evidence 双重标注。

| 任务 | 场景 | 提交 | evidence 实测 | 判定 |
|------|------|------|--------------|:---:|
| D442 | GS-03 资本循环 | f02edec3（诚实 RED）→ 转绿 7fe92110（D462） | GS-03-2026-08-22.json: **3/3 pass**（erp-upload-ok / cash-runway-critical-triggered / no-false-critical-zero-runway 负向断言） | ✅ GREEN 属实 |
| D443 | GS-02 客户循环 | fa8ab73c（诚实 RED 2/3） | GS-02-2026-08-21.json: S1-1 fail（crm-standard 缺 revenue/churn → critical 无法触发）+ S1-4 pass → 诚实 RED 属实 | ✅ |
| D444 | GS-04 人才循环 | ff524686（诚实 RED 2/3） | GS-04-2026-08-21.json: S1-1 fail（hr-standard 缺 name/domains/role）+ S1-4 pass → 诚实 RED 属实 | ✅ |
| D445 | GS-05 告警闭环 | a12c4458（诚实 RED 2/4）→ 转绿 6b28e740（D463） | GS-05-2026-08-21.json 更新 + D463 声称 4/4 | ✅ 闭环属实 |
| D446 | GS-01 首诊旅程 | 4c8572a3（诚实 RED） | GS-01-2026-08-22.json 存在 | ✅ |
| D447 | GS-06 进化闭环 | 4c8572a3 | GS-06-2026-08-22.json 存在（前置 D333） | ✅ |
| D448 | GS-07 数据安全 | 4c8572a3 | GS-07-2026-08-22.json 存在（前置 D338） | ✅ |
| D449 | GS-08 报告可读 | 4c8572a3 | GS-08-2026-08-22.json 存在 | ✅ |

- P2-1: D443/D444 转绿留独立任务（契约错位归 Win 修 field-mappings——台账 2026-08-21 全景重梳已裁决归属），RED 是正确交付行为。
- P2-2: D445 曾暴露 runSentinelOnce 绕过工单管线 + tickets API 与 DB 不一致（独立发现）——D463 已闭环（见下）。

## 2. 部署轨（D454/D455/D462/D463）→ 全部 **PASS**

| 任务 | 声称 | 证据 | 实测 | 判定 |
|------|------|------|------|:---:|
| D454 | GSS 服务启动原生崩溃修复（require 清零 + L2 服务隔离） | 8e4a0f29（memory-access-service + 103 行测试）+ 080fc7e4（21 文件 require→静态 import） | 提交内容与声称一致；L2 服务隔离（routes 不直触 L4，铁律 39） | ✅ |
| D455 | D355 残留修复（cashBalance↔cash 对齐 + compute filter bug） | bcfd466b | erp-standard.json 4 行映射修正 + compute-cash-runway-months.ts:6 行 filter 修复 + 契约测试更新；与 D355 审计（08-16-D355 报告 P0 filter bug）所指一致 | ✅ |
| D462 | better-sqlite3 v12（Node 24 崩溃根因，WiseLibs#1376）+ GS-03 run.sh 三修复 | 7fe92110（package.json ^12.11.1 + GS-03 run.sh 45 行 + evidence） | 产品仓库 node_modules 实测 12.11.1 ✅；GS-03 evidence 3/3 绿 ✅ | ✅ |
| D463 | GS-05 告警闭环（run-once 接 runner 管线 + severity 自动建工单，选项 A 无 LLM 依赖） | 6b28e740（src/sentinel/runner.ts +54 / sentinel-service.ts +19 + 2 测试文件 181 行） | 提交内容与声称一致；GS-05 4/4（台账 + evidence） | ✅ |

- P2-1: D455 声称"创始人授权修复 D355 验收不完整"——授权路径可查（task-state note + brief），流程合规。
- P2-2: D463 是 L2/L3 产品变更，台账已提醒部署后 checkpoint-deploy.sh——建议 CTO 确认部署动作已执行（未核到部署证据，外部项）。

## 3. U 系列（D412/D413/D414/D415/D419）→ 引用 08-17 终审 + 接线核实 **PASS**

K3 终审（2026-08-17-K3-final-control-tower-console.md）对 U 系列分支结论: u7-ct-test-gate **CP**（P1-3 fail-open 残留）、u1-bypass-reconcile **CP**（P1-4）、u2-writeset-reconcile **CP**（P1-5 三处 fail-open 残留）、u5-secrets-failopen **CP**、u5a-marker-tristate **CP**（知情接受）等 12 分支可合并；u8 打回。本批补核 CTO 2026-08-22 接线回填（任务 state 中 commit=pending → 回填为接线核实）:

| 任务 | CTO 声称接线 | 独立核实 | 判定 |
|------|------------|---------|:---:|
| D412 u3-artifact-gate | gen-cto-health.py（pre-audit-summary/check-orphan-worktrees） | gen-cto-health.py:487 调 check-orphan-worktrees.sh --json；pre-audit-summary.sh 存在（U8 工程侧） | ✅ |
| D413 u7-ct-test-gate | ct-test-gate.sh（pre-commit 组2） | pre-commit-check.sh:446 `CT_GATE_OUT=$(bash ct-test-gate.sh)` | ✅ |
| D414 u1-bypass-evidence-chain | check-bypass-log.sh（pre-push/pre-audit） | pre-push-check.sh:399 + bypass 对账硬阻断 | ✅ |
| D415 u2-writeset-reconcile | check-dev-doc-write-set.sh（pre-commit G12c） | pre-commit-check.sh:1105 | ✅ |
| D419 u-founder-truth-mvp | founder-truth.py（generate-dashboard） | generate-dashboard.py:149-176 物理加载 founder-truth.py，缺失→显式 unknown 降级 | ✅ |

- P1-1（引用终审，非新发现）: 终审已记 U 系列 fail-open 残留（u7 的 P1-3、u2 的 P1-5 等）——需确认这些 P1 是否有 FIX 任务跟进（本批未发现独立 FIX 任务，建议 CTO 核对；部分已由 D433 fail-open 批量修复覆盖，见 D433 提交 5f7b1135）。

## 4. 常设项（13/14/15）

- #13: D442-D449/D454/D455/D462/D463 均有 bypass.log 补记 + PR/合并记录（D331 对账链完整）；U 系列合并（D428）与 08-17 终审记录衔接。
- #15: .wt-gs05 worktree 残留于产品仓库根目录（GS-05 场景 worktree 未收尾）——08-21 控制塔冻结决策"worktree 收尾强制"（D461）已实现孤儿检测；.wt-gs05 仍在 = 收尾执行待确认（P2，CTO 处理）。

## 5. 分级汇总

| 级别 | 编号 | 内容 | file:line | 归因 |
|------|:---:|------|-----------|------|
| P1 | U-系列残留 | 08-17 终审 P1（u7 P1-3 / u2 P1-5 fail-open 残留）跟进确认 | 08-17 终审报告 | control-tower（CT 队列） |
| P2 | 多 | task-state commit 未回填（D443/D444 等 PENDING）/ .wt-gs05 残留 / D463 部署动作未核 | task-state/D443.json 等 | implement / CTO 流程 |

## 6. 总体结论: **PASS**（GS 8 + 部署轨 4 全过；U 系列引用终审 + 接线核实通过，残留 P1 归 CT 队列跟进）

## 7. L4 防线缺口收割

| 发现 | 本该拦住 | 为什么没拦住 | 缺什么 |
|------|---------|-------------|--------|
| D443/D444 契约错位（field-mappings 缺字段） | 契约收敛门禁（铁律 47 契约优先） | field-mappings 与 compute 契约的跨层对齐无自动校验（D355 同型复发） | extensions/ 契约校验门禁（field-mapping schema ↔ compute 输入契约） |
| .wt-gs05 孤儿 worktree | D461 worktree 收尾强制 | 强制检测已实现，存量孤儿未执行清理 | 存量孤儿清理动作（CTO） |
| task-state commit 字段长期 PENDING/local | D382 状态机回填纪律 | 无自动回填（git log --grep 兜底） | 自动回填或人工回填纪律 |

*P1 批审计完。P2 批见 2026-08-22-P2-batch-audit.md。*
