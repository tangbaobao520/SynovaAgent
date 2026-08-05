# D315 — D313 M5 UTF-8 批量头块收尾提交

任务 ID: D315 | Agent: claude-code | 会话: 2026-08-05-D313-D314 | 2026-08-05

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
D313 M5 编码交付了 UTF-8 强制（check-silent-swallow.sh --utf8 + utf8.test.sh）并声称"批量后 40 个 CI .sh 全带头块"，但批量修改**从未提交**——D313/D314 提交只含各自写集，38 个文件的头块/reconfigure 修改悬在工作区。本任务 = 把这批已完成的机械修改正式落库。

### b) 文件审计
`git diff` 按内容分类：27 个 .sh 为 `# D313 M5 UTF-8 强制` 头块（3 行），11 个 .py 为 `sys.stdout.reconfigure(encoding="utf-8")`。均已在工作区完成，本任务**零代码改动，纯暂存 + 提交**。

### c) 决策
独立 brief 认领（D313-D314 brief 排除项含 baseline-check.sh → 新 brief include 认领收尾，G12 按认领制判定）。

## Q1: 调研 — 决策链 + 执行约束

### a) 决策链
① 验证 — `bash scripts/workflow/check-silent-swallow.sh --utf8` 工作区现状
② 暂存 — 38 文件全量 `git add`
③ 门禁 — pre-commit 12 组（G12 按本 brief Q2 include 判定）
④ 提交 — synova-commit

### b) 执行约束
- 铁律 0-2: 测试先行 — utf8.test.sh 已在 D313 交付（red→green 10/10），本任务不新增测试（零代码改动）
- 铁律 35: 自动化优先 — 无新逻辑，纯落库
- #CRITERIA: A（机械批量，无风险）

## Q2: 范围 — 正确的最简方案是什么？

做什么（38 个文件，全部为已完成的 UTF-8 头块/reconfigure 修改，零逻辑改动）：
- scripts/checks/check-empty-modules.sh
- scripts/checks/check-test-quality.sh
- scripts/control-tower/baseline-check.sh：含 tr -d '\r' 修复，D313 M5 同批
- tests/control-tower/baseline-check.test.sh：TMP_REL 相对路径，UTF-8 批量同批
- scripts/control-tower/context-injector.sh
- scripts/control-tower/external-auditor.sh
- scripts/control-tower/contract-archiver.py
- scripts/control-tower/dev_doc_gatekeeper.py
- scripts/control-tower/emit-signal.py
- scripts/control-tower/env_validator.py
- scripts/control-tower/generate-dashboard.py
- scripts/control-tower/inject-context.py
- scripts/control-tower/product-health.py
- scripts/control-tower/write_lock.py
- scripts/hooks/hook-enforce-loop.sh
- scripts/workflow/check-boundaries-incremental.sh
- scripts/workflow/check-dataflow-alignment.sh
- scripts/workflow/check-spec.sh
- scripts/workflow/check-test-first.sh
- scripts/workflow/checkpoint-deploy.sh
- scripts/workflow/checkpoint-design.sh
- scripts/workflow/checkpoint-impl.sh
- scripts/workflow/checkpoint-runtime.sh
- scripts/workflow/decide-next.sh
- scripts/workflow/grep-refs.sh
- scripts/workflow/hook-check-task-scope.sh
- scripts/workflow/hook-post-tool-use.sh
- scripts/workflow/install-post-commit.sh
- scripts/workflow/loop-context.sh
- scripts/workflow/loop-score.sh
- scripts/workflow/loop-sync.sh
- scripts/workflow/post-merge-cleanup.sh
- scripts/workflow/run-auditor.sh
- scripts/workflow/scope-check.sh
- scripts/workflow/task-start.sh
- scripts/workflow/wire-check.sh
- scripts/audit/check-gates-v2.py
- scripts/audit/completion-engine.py
- scripts/audit/self-diagnosis.py

不做什么（含文件路径）：
- 不改 docs/synova/DASHBOARD.md、docs/synova/DASHBOARD-CN.md（生成器输出，运行时产物）
- 不改 extensions/industries/saas-tech/thresholds.json、extensions/industries/test-write/thresholds.json（运行时 aggregatedAt）
- 不改 .claude/bypass.log（运行时状态文件，无扩展名无法声明为排除文件路径）
- 存量 11 个缺头块的非本批 .sh 不在本批范围（dev-doc-gatekeeper.sh、check-golden-regression.sh 等——非本批，D313 声称的 40 个之外的存量）

## Q3: 验收 — 入口 → 交互 → 结果

入口：`bash scripts/workflow/check-silent-swallow.sh --utf8`（D313 M5 门禁）
处理：38 文件 git add → pre-commit 12 组 → synova-commit
结果：`git log` 含 D315 提交；提交后工作区仅剩运行时/生成物修改

## 架构层: 基础设施
L1-L5 之外 — 控制塔脚本（scripts/）。零逻辑改动，纯头块/reconfigure 落库。

## Done 标准
- [ ] `bash scripts/workflow/check-silent-swallow.sh --utf8` 返回 exit 0
- [ ] git log 存在 feat(D315) 提交，且 38 个文件已不在工作区 diff（除运行时文件外无残留）
