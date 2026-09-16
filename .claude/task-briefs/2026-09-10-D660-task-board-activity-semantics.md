# Task Brief: D660 task-board-activity-semantics

> 生成: 2026-09-10 | 任务: D660 | 认领: CTO (DeepSeek Harness)
> 来源: 创始人 2026-09-10 派单「任务看板逻辑重审与重排」——三列新语义 + 活动判定

#CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
控制塔域：`dsh/plugins/task-board-adapter`（DSH web profile 插件，Host 端），把 Synova
任务体（task-state/D###.json + 多源快照）单向镜像到 dsh-web-ui 任务看板（5 列：
backlog 待规划 / todo 待办 / running 进行中 / done 已完成 / failed 失败）。
运行链路：lib/index.js 定时同步 → scripts/derive-board-sources.py 五源快照
（origin/main 权威）→ lib/sync.js 映射 → loopback API import。
### b) 文件审计（2026-09-10 实读）
- `dsh/plugins/task-board-adapter/lib/sync.js` L31-39 映射（2026-09-08 版：claimed/spec_done→running，impl_done→todo）；L128-151 mapToBoardTask；L180-199 backlog→todo；L311-333 T-*→todo；L258-282 产品线 0 verified→todo
- `dsh/plugins/task-board-adapter/scripts/derive-board-sources.py` L105-123 task-state 源；L67 MAIN_REF；无分支活动扫描（本次新增）
- `dsh/plugins/task-board-adapter/test/sync.test.js` 37 个 node:test；`test/derive.test.sh` 13 断言
- `scripts/control-tower/alloc-task-id.sh` L133-141 CT-63 远端分支扫描模式（`git branch -r --format='%(refname:short)'` + `grep -ioE 'D[0-9]+'`）——活动信号参考
- 板插件（已安装 @linxin666/dsh-client-ui-task-board）：5 列原生支持 `backlog`（client.js L26/47-50/1498）——板端无需改
- 证据：`~/.dsh/profiles/web/node_modules/@synova/task-board-adapter/lib/sync.js` = 8-23 旧副本（md5 ≠ 仓库版）；ledger-v2.json running 93 = 87 D#（impl_done 57 + claimed 6 + Win 派生 24）+ 6 L## → **旧映射数据**
- 现状：task-state 184 = audited 107 / closed 14 / impl_done 57 / spec_done 3 / claimed 3；5 个 claimed/spec_done 实测全部 48h 无活动（D488/D490/D491 分支最后提交 169h+；D559/D583 无远端分支）→ 新口径 running ≈ 0 + 6 产品线卡
### c) 决策
复用现有五源快照架构 + 新增第⑥维「分支活动」进 task_state 条目（backward-compatible 加字段）；claimed/spec_done 基础映射落 todo、有活动证据才升 running（无证据默认 todo = 安全方向）。板插件不动。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
- 铁律 47/48：契约优先（活动判定三态函数先写 JSDoc 契约 + red→green 测试）
- 铁律 11/24/31：降级——git 扫描失败 → 无证据 → todo（绝不静默虚高 running；M1 fail-open 教训）
- D502 复核契约：降级轮（无 snapshot）零删除 + claimed/spec_done 落 todo 不回退旧口径
- D328 三态退出码：derive 扫描失败记 errors 不硬失败（其余四源照常）
- CT-63 模式：分支名匹配 D# 用 `\bD(\d+)\b` 大小写不敏感；48h 窗口 = 创始人定
- 业界：Kanban 的 WIP 列应按「信号活动」而非「声明状态」判定（看板核心 = 可视化真在途工作，防僵尸卡）
参考：第一性原理（活动判定 = git 物理事实，非状态字段声称）+ CT-63 已验证模式；结论 = for-each-ref 单次取全远端分支 committerdate 比逐分支 git log 便宜且等价

## Q2: 范围 — 正确的最简方案
做什么：
- 修改 dsh/plugins/task-board-adapter/lib/sync.js — 映射改 2026-09-10 语义（活动判定三态 + backlog 列）
- 修改 dsh/plugins/task-board-adapter/scripts/derive-board-sources.py — 新增分支活动扫描
- 修改 dsh/plugins/task-board-adapter/test/sync.test.js — 三态新测试 + 旧断言更新
- 修改 dsh/plugins/task-board-adapter/test/derive.test.sh — 活动扫描三态用例
- 修改 dsh/plugins/task-board-adapter/README.md — 映射表更新
- 修改 task-state/D660.json — 本任务登记
- 修改 docs/synova/coordination/审计发现台账-DSH-CTO.md — D660 交付 + 控制塔缺陷登记（发现即登记）
不做什么：
- 不改 task-state/D397.json（僵尸关闭为上轮 #469，本任务零触碰其他 task-state）
- 不改 scripts/audit/（K3 红线）、不写审计标准
- 不改 src/（产品代码归编码线）
- 不改已安装板插件 @linxin666/dsh-client-ui-task-board（板端 5 列已支持 backlog）
- 不改 Win 派生/产品线/L00 其余映射（超出本次三列语义）

## Q3: 验收 — 入口 → 交互 → 结果
入口：`cd dsh/plugins/task-board-adapter && npm test`（node --test + derive.test.sh）
处理：sync.js 映射 + derive 快照挂活动信号 → 本地模拟 syncOnce（真实快照 + stub fetch）输出逐列计数
结果：① 37+ 单测全绿；② 本地模拟：新口径 running ≤ 10、backlog 列含 16 PLAN-* + 41 T-*、todo 含 57 impl_done + 5 无活动 claimed/spec_done；③ 重装插件 + 重启 dsh web 后 ledger 重同步（running 93 → ≤10、backlog 列可见）

## 架构层: scripts（控制塔域 / DSH web profile 插件，非 L1-L5）

## Done 标准
- [ ] verify: cd dsh/plugins/task-board-adapter && npm test → 0 fail（37 回归 + 新三态）
- [ ] verify: python3 scripts/derive-board-sources.py --repo-root . --out /tmp/snap-d660.json && node 模拟脚本 → running 计数 ≤ 10 且 backlog 计数 ≥ 57
- [ ] verify: 重装（install.sh 或 dsh plugin add）+ 重启 dsh web 后 ledger running ≤ 10、backlog 列可见（板 UI）
