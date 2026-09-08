# D593 报告落盘 物理证据包（2026-09-08/09）

> 任务: D593 — L1-P2 报告落盘 + 桌面报告/哨兵呈现 + 401 对齐
> spec: docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D593-report-persistence-20260908.md（§10 DS1-DS9）
> 分支: feat/d593-report-persistence-p2（worktree .synova-wt-d593，基线 95e1c9fa = origin/main）
> 本目录全部证据可由 K3 独立重跑（幂等；无本机路径假设——scratch 目录 + 固定端口 3098/9202）

## 文件清单

| 文件 | 内容 | 对应 DS |
|---|---|---|
| red-vitest.log.txt | **实现前**两新测试文件实跑日志：20 failed / 1 passed（唯一 passed = 用例 4 未知 id 404，现状语义本就正确）——red 先证 | DS1（red 段） |
| D593-run-ds2.sh | DS2 一键复现 runner（LLM 替身 OpenAI 兼容假端点 + 真实六阶段引擎 + 物理重启） | DS2 |
| ds2-consult-sse.log.txt | 段1 真 consult SSE 全帧（complete 帧 report.reportId = rpt_org-d593-ds2_mtsveva9） | DS2 |
| ds2-server-phase1.log.txt | 重启前 server 运行日志（scratch db） | DS2 |
| ds2-server-phase2.log.txt | kill -9 后同 scratch db 重启的 server 日志 | DS2 |
| ds2-restart-readback.log.txt | **核心证据**：重启后 GET report 200（body 含 reportId/teamId）+ markdown 200 + 列表 total=1 含该 reportId + ghost 对照 404 | DS2/DS3 |

## K3 独立重跑步骤

```bash
# 前置: Node 22（better-sqlite3 ABI=127）；仓库根执行
bash docs/synova/audit-reports/D593-report-persistence-evidence-20260908/D593-run-ds2.sh
# exit 0 = DS2 通过；*.log.txt 就地刷新（覆盖写）

# DS1 两新测试文件全绿（green 段）
npx vitest run tests/routes/diagnosis-report-persistence.test.ts tests/electron/right-panel-report-sentinel.test.ts

# DS6 白名单（集成证明，含于上文件用例 6）
# DS2 物理证据 = ds2-restart-readback.log.txt（重启后 HTTP_STATUS=200 + reportId 匹配 + 列表 total≥1）
```

## red→green 对照（spec §7）

| 阶段 | 结果 | 证据 |
|---|---|---|
| red（实现前，2026-09-08 23:47） | 20 failed / 1 passed | red-vitest.log.txt（列表路由 404 / reportId 读回 404 / checkpoint 零行 / 白名单 401 / fetchLatestReportId 等导出不存在） |
| green（实现后，2026-09-09 00:25） | 21 passed / 0 failed | 全量 vitest 日志（见完成报告）+ 本 README 重跑命令 |

## 替身模式诚实声明

DS2 使用 OpenAI 兼容假端点（D592 先例；spec §10 DS2 明示允许）。诊断报告由真实六阶段引擎
（synova-diagnosis-engine-impl）产出——token 计量 missingUsageCount=1 如实反映替身无 usage 字段；
断言对象是**持久化与重启存活**（HTTP 状态/键匹配/列表 total），非 LLM 内容质量。
