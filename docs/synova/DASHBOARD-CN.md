---
title: "Synova 项目仪表盘"
version: "v4.8"
date: "2026-07-29"
status: "17/17 门禁 PASS. CT 20/20. D253 D255 D258 D261 D263 D266 done. 131+ D-tasks (97%)."
purpose: "全局任务追踪。控制塔健康监控。"
---

# Synova 项目仪表盘

> 开发文档: [implementation/](../plans/codex/implementation/) | 权威文档: [research/](research/)
> 最后更新: 2026-07-29 | 131+ D级任务 | CT 20/20 | 17/17 门禁 PASS
> English: [DASHBOARD.md](DASHBOARD.md)

---

## 控制塔部署状态 (20/20 在线)

| 组件 | D# | 状态 |
|------|-----|------|
| 上下文注射器 | D200 | 在线 |
| 校验网守 | D201+Phase2 | 在线 (11/11) |
| 外部审计器 | D202+D210 | 在线 (6/6) |
| Synova Commit | D201 | 激活 |
| 文档门禁 | D206+D212 | 在线 |
| 契约存档器 | D208 | 在线 (5/5) |
| 写入锁 | D209 | 在线 (5/5) |
| 审计器接线 | D210 | 在线 |
| 环境验证器 | D211 | 在线 (4/4) |
| 仪表盘 (D213) | D213 | 在线 |
| 共享信号发射器 | D214 | 在线 |
| 契约Store+Gate | D215 | 在线 |
| 审计补全 | D216 | 在线 |
| 写入锁补全 | D218 | 在线 |
| 全局集成 | D219 | 在线 |
| 创始人驾驶舱 | D220+PHASE2/3/4 | 在线 |
| 真实数据连接器 | D221 | 在线 |
| 方向监测 | D222 | 在线 |
| 停滞检测 | D223 | 在线 |

## 一、整体进度

已完成 (100%): I2/D10/D15a/D29-D101/D102-D111/D200-D241
#4 Agent L2: 100% (D8a-D8g+D9+D20)
#5 Agent主动交互: 100% (D17-D21)
#6 测试体系: 100% (D24-D28, 10黄金案例)
#16 企业多用户: 100% (D102-D111)
#17 控制塔: 100% (D200-D232, 20/20)
#18 权限与知识治理: 100% (6/6 done)

## 二、最近完成 (2026-07-28~29)

| # | 任务 | 文件 | CI | 日期 |
|---|------|------|:--:|------|
| D253 | GA 管理界面 (三面板: 企业列表 + 诊断数据 + 联邦审批) | `app/ga.html` + `app/js/ga.js` + CSS + shell.js | ✅ 6/8 | 07-28 |
| D253-fix | package-lock.json 重建修复 CI (10 个 `../packages/` 残留引用) | `package-lock.json` | ✅ 6/8 | 07-28 |
| D255 | Electron 桌面打包 (.exe) — electron-builder + build-synova.cjs 修正 | `package.json` + `build-synova.cjs` + lockfile | ✅ 6/8 | 07-29 |
| D258 | 脚本清理归并 — 删除 22 死文件, 2 组合并, 1 归档 | `scripts/` 清理 | ✅ 6/8 | 07-29 |
| D261 | V3-P1 PM仪表盘 + 完成度 (视图2+3) — views/pm_dashboard + completion + 快照 | 5 新建 + 4 修改 | ✅ 6/8 | 07-29 |
| D263 | GraphStore 增量查询 — `queryNodesCreatedAfter(store, graph, days)` | `src/l4/diagnosis-graph-query.ts` + 5 测试 | ✅ 6/8 | 07-29 |
| D266 | 数据管道监控 — `getPipelineHealth()` 封装 D263 | `src/ingest/data-pipeline-monitor.ts` + 4 测试 | ✅ 6/8 | 07-29 |

### CI 状态详情 (6 个任务一致)

| 检查项 | 状态 | 说明 |
|--------|:----:|------|
| TypeScript + Lint + Iron Laws | ✅ 通过 | tsc --noEmit 零新增错误 |
| Vitest (1/2) | ✅ 通过 | 0 新增失败 |
| Vitest (2/2) | ✅ 通过 | 0 新增失败 |
| Integration Contract Check | ✅ 通过 | L1+L2 接线已验证 |
| Checker Review | ✅ 通过 | maker/checker + brief-vs-code |
| Golden Case F1 Gate | ✅ 通过 | F1 阈值达标 |
| Architecture Check | ❌ 失败(预存) | `src/routes/admin-knowledge.ts` L1→L4 — 与本批次任务无关 |
| npm audit | ❌ 失败(预存) | electron 依赖 CVE — 与本批次任务无关 |

## 三、上次完成 (2026-07-24~27)

| # | 任务 | 日期 |
|---|------|------|
| D8g | 推理成本预算 | 07-24 |
| D9 | 内置循环激活 | 07-26 |
| D20 v2 | 循环交互展示 | 07-26 |
| D106-D111 | 企业多用户全部 | 07-26 |
| D213-D219 | 控制塔全子组件 | 07-24~25 |
| D220 | 创始人驾驶舱 | 07-25 |
| D221-D232 | Gate+修复+测试+部署 | 07-25~26 |
| D234 | 专家工具补齐 (8/8) | 07-27 |
| D236 | 专家9->7重构 (39文件) | 07-27 |
| D239 | GA权限边界 (14测试) | 07-27 |
| D240 | 企业事实治理 (9测试) | 07-27 |
| D241 | 知识审批流水线 (6测试) | 07-27 |

## 三、剩余缺口 (来自预期状态模型 v3.1)

| # | 缺口 | 权威文档 | 优先级 | 状态 |
|---|------|---------|:---:|------|
| G1 | GA合同到期日UI (代码存在, 无管理员UI设置) | #18 M1 | P0 | D239已加GAConstraints, contractExpiry未用 |
| G2 | 客户自安装 (无安装引导) | #16 Ch3 | P0 | D232部署指南存在, 无引导安装器 |
| G3 | 诊断从未用真实数据验证 | — | P0 | 零次真实企业测试 |
| G4 | ProactivePush通道空 (emitSignal绕道可用) | #05 M1 | P1 | D249加了emitSignal路径 |
| G5 | 推送去重未实现 | #05 M1 | P2 | 同一告警多次推送 |
| G6 | 按角色推送未实现 | #05 M1 | P2 | 所有人看到相同推送 |
| G7 | 5个旧专家缺金字塔格式 | #05 M6 | P1 | D236重构7专家, 旧目录未清理 |
| G8 | 子Agent可视化 (右侧占位) | #05 Suppl | P2 | index.html L35占位文字 |
| G9 | 数据管道健康未监控 | #17 | P1 | D266 已完成 — `getPipelineHealth()` via `queryNodesCreatedAfter` (D263) |
| G10 | 审计器cross-check+report (2/5子模块缺) | #17 Ch5 | P1 | 3/5已实现 |
| G11 | V3 P2视图4+5 (工作流图+Agent健康) | #17 | P2 | 视图1/2/3已完成(D260/D261) |
| G12 | 运行健康度自检 (product-health.py) | #17 | P1 | D263+D266 已完成 (queryNodesCreatedAfter + getPipelineHealth), D265/D267 待完成 |
| G13 | 组织记忆自动生成 (模式→事实) | #18 M2-3 | P1 | D240文件事实存在, 自动生成缺 |
| G14 | 部门记忆 | #18 M3 | P2 | 未实现 |
| G15 | 联邦知识/多企业共享 | #18 M4 | P2 | D244联邦管线存在, 多企业缺失 |
| G16 | NCI非共识检测 | #02 | P2 | 研究完成, 代码零实现 |
| G17 | 跨部门信号 | #15 | P2 | 销售→研发信号传导未实现 |
| G18 | 知识审批管线 (写入→待审→通过) | #18 M4 | P1 | D241 pkb_status draft, 非完整管线 |
| G19 | 流式SSE前端 (通用聊天) | #05 M2 | P1 | D252诊断SSE, 通用聊天用fetch |
| G20 | GA纠正自动反馈到诊断规则 | #17 | P1 | D262反馈收集, 闭环缺失 |
| G21 | 自诊断Phase 0完成 (D265-D267) | #17 | P1 | D262-D264 done, D265-D267就绪 |

## 四、下一批待办

| # | Task | Auth Doc | Status |
|---|------|----------|------|
| D256 | 审计器统一入口 (CT Graph Phase 1-1) | #17 Ch5 | dev doc ready |
| D257 | 契约门禁接入网守 (CT Graph Phase 1-2) | #17 Ch3 | dev doc ready |
| D260 | V3-P0 流水线健康度 (视图1) | — | DONE |
| D261 | V3-P1 PM仪表盘+完成度 (视图2+3) | — | DONE |
| D265 | 资源监控 (CPU/内存/磁盘) | #17 | dev doc ready |
| D267 | 自诊断CLI (6条件判定) | #17 | dev doc ready |

## 五、关键指标

| 指标 | 数值 | 目标 |
|------|------|------|
| 门禁 | 17/17 PASS | 17/17 |
| 控制塔 | 20/20 在线 | 20/20 |
| 已完成D任务 | 131+ | 97% |
| 哨兵 | 45活跃 | 50 |
| 计算总计 | 88 | >=1/edge |
| 专家 | 8工具+15目录 | 7活跃 |
| 前端页面 | 6 HTML | 10/31 |
| API端点 | 54+ | 全部接线 |
| 权威文档 | 19份 | 完整 |
| as any | 0 | 0 |

## 六、风险

| 风险 | 等级 | 状态 |
|------|------|------|
| 企业事实治理空白 | — | D240已修复 |
| GA无限制访问 | — | D239已修复 |
| D239 ws.sensitivity 未激活 | 低 | 被动防御——调用方不传 sensitivity 字段时跳过检查。后续 workspace 加字段后自动激活。跟踪至 D242 |
| D111 Electron无法启动 | — | D233 DONE ✅ |
| 10/31 客户交付 | 低 | 按计划 |
| 跨企业联邦知识 | 低 | D244待定 |
