---
状态: implemented
日期: 2026-09-09
决策: Mac 质量第一批三机制——① D652 evidence 引用入库铁律（task-state 引用路径必须 git 跟踪，fail-closed）② D653 合入即绿门禁（main 红列表基线快照存 git + 新增匿名红检测）③ D657 测试零副作用（vitest 生命周期快照+白名单恢复现场）
理由: K3 D651 评估 Mac 侧 C7/C2 失分点均为"信号钝化"同型——引用不可见证据 = 声明降级（M3/D577 做对过一次但无机制强制）；main 留红无归属 = 红常态化信号失效（CT-39 只查 run 级红灯，套件级红列表无基线可对比）；测试污染工作树 = fresh clone 不可信（实测 extensions/industries/saas-tech/thresholds.json tracked 文件被测试改写 aggregatedAt）。三处都用最少机制收敛：脚本化 fail-closed 门禁 + 密封测试，把"靠自觉"变"物理拦截"。
---

# Mac 质量第一批三机制（D652/D653/D657）

## 触发场景

K3 D651 双线质量评估（2026-09-09）Mac 侧失分点：
- C7：task-state/D551、task-state/D575 引用 evidence/D551、evidence/D575，git 全历史零记录（M3/D577 做对过——落 docs/synova/audit-reports/ 非忽略目录——但无门禁强制）。
- C2：D593 在 main 留红测试；check-ci-stale-red.sh 只能事后告警 run 级红灯，拦不住"新红进入 main"。
- 零副作用：全量测试向工作树写 heartbeat.json/thresholds.json（fresh clone 复现）。

## 决策内容

1. **D652 check-evidence-cited.sh**：解析本次变更触碰的 task-state/*.json 中所有 `*evidence*` 键值 + `audit.report` → 提取仓库路径 token → `git ls-files` 校验跟踪态。缺失 → 点名 + exit 1；无引用 → exit 0；脚本自身失败 → exit 2（degraded）。**不溯及既往**：只校验 staged/diff 触碰的条目（存量 evidence/ 顶层引用被 .gitignore L76 全局忽略属历史遗留，文件被触碰时即须补入库）。
2. **D653 check-main-green.sh**：基线快照 tests/control-tower/main-red-baseline.txt（CI 口径实测 @ 93209c57：5 文件 23 红）+ 豁免登记 main-red-exemptions.txt（带任务号/理由）。当前红 − 基线 − 豁免 > 0 → 新增匿名红 → 点名 + exit 1 + 写 CTO 待办（MAIN-RED-NEW.md 带 FIRST_SEEN）。CI test job 失败分支接线：既有失败若含基线外匿名红 → 阻断（强化现有"pre-existing 不阻断"逻辑——pre-existing 但不在基线 = 新红入 main，必须拦）。
3. **D657 vitest globalSetup**：测试前快照 git status → teardown 对比 → 白名单运行时文件（extensions/industries/*/thresholds.json、.codex/heartbeat.json）tracked 改写恢复 / untracked 删除；白名单外新增只告警不删（防误删用户数据，铁律 11）。另：SYNOVA_DATA_DIR 指向 mktemp 临时目录（消费方 src/config.ts 已支持）。**不改 src/ 与 packages/**——写入方源码不动，恢复现场在测试基建层完成。

## 参考系

参考：Anthropic（fail-closed 门禁三态 + hermetic tests）/第一性原理（引用不可见=声明降级 → git ls-files 物理校验；漂移机器可验 → 基线存 git）+ 结论：三机制收敛于"脚本化 fail-closed + 密封测试"。

## 相关 D#

D652 / D653 / D657（task-state/ 各有登记）；先例：D577 evidence 落盘（evidence_path_note）、D544 P1-2（evidence 未入库审计发现）、CT-39（run 级红灯监测，本批补套件级）。
