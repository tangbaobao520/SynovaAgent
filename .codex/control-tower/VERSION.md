# 控制塔 VERSION — 版本与变更记录

> 控制塔产品契约（设计文档 §2.6/§2.7）。版本只增不减；任何门禁/工具行为变化必须 bump（PATCH 起步）；bump 与代码同 commit。

## 版本规则

```
版本号: MAJOR.MINOR.PATCH
- PATCH (第三位): 小升级 — bug 修复/门禁微调 → 4.6.0 → 4.6.1
- MINOR (第二位): 中升级 — 新机制/新组件/新门禁组 → 4.6.0 → 4.7.0
- MAJOR (第一位): 大改版 — 架构重构/产品化里程碑 → 4.6.0 → 5.0.0
```

## V4.6.1 (2026-08-05) — D316 修复（incident-loop 跨平台 + version.log 补写）

> Codex 审计（SYNOVA-IMPL-D316）发现 3 缺陷，逐一实测核实后修复。

- **变更**: PATCH bump — bug 修复（行为变化必须 bump）
- **缺陷 A (P1)**: incident-loop.py verify() 硬编码 `["bash",` — 纯系统 PATH（CI/任务计划/非 Git Bash 启动的 python）下 WinError 2 → verify 恒 degraded，学习闭环不可用
  - `_find_bash()` — shutil.which → Git 安装显式路径 → None（fail-open degraded）
  - `_bash_env()` — 自包含 subprocess 环境（Git bins + sys.executable 目录 + WindowsApps），hook 依赖链 bash/cat/python3 全部显式可达
  - 同款修复 attach.py `_run_parseable`（dev doc 遗漏，审计补漏）
  - 测试: 受限 PATH 断言（red degraded → green closed，8/8）
- **缺陷 B (P1)**: version.log 缺失 — 补写 4.6.0 首发 + 4.6.1 两条，五件套齐全
- **缺陷 C (P1)**: D313-D315 共 4 提交未推送 — 随本版本推送落库
- **P2-1**: hook-git-detect.test.sh EXIT trap 清窗（中断残留 → 下次首测失败）
- **关联 incident**: INC-20260802-stash（verify 闭环案例）
- **作者**: Claude (D316)
- **验证**: incident-loop 8/8 | hook-git-detect 13/13 | pre-commit 12 组 | 推送后 origin..HEAD 空

## V4.6.0 (2026-08-04) — 控制塔独立化正式首发

> M1-M5 全部落地 + 独立化底座 + 日志五件套 + 学习闭环。控制塔从"session 触发的脚本集合"升级为**独立常驻系统**（hook 轻量触发，不真常驻——常驻 daemon 延后到产品化阶段）。

- **变更**: 控制塔 V4.6.0 独立化完成（D311-D314 全部交付）
- **D313 (M3 brief 契约 + M5 编码)**:
  - `brief_parser.py` — 同源解析器库（Q2 include/exclude + #CRITERIA + 架构层 + Done；消灭 G12 awk vs resolve-commit-brief python 双副本，4 方共用）
  - `check-brief-parseable.sh` — 填完 brief 立即验证（#CRITERIA 必填/架构层/Done/模板自检）
  - `devdoc_writeset.py` + `check-dev-doc-write-set.sh` — 写集声明 vs 代码 grep（M3b）
  - `generate-task-brief.py` — 模板同源（`## 架构层:` 标题 + `#CRITERIA: A` 字段 + V4.6.0）
  - `check-silent-swallow.sh` — 静默吞错扫描器（level-0/1/2 + --strict/--utf8/--diff）
  - UTF-8 强制 — 47 个 .sh 头块 + 21 个 .py reconfigure + settings.json env 兜底
- **D314 (M4 基线豁免 + 独立化底座)**:
  - `verify-incremental.sh` L2 — tsc 基线豁免（baseline-check.sh --tsc，存量 28 不阻断新增阻断）
  - `verification-state.json` — M4b（全量 vitest ≤1 次/任务）
  - `control_tower_log.py` — 日志五件套写入器（runtime/gate/incident/degraded/version）
  - `attach.py` — SessionStart 轻量 attach（register + 日志 + self-health + parseable；<2s fail-open）
  - `self-health.py` — 控制塔自身健康五维（组件/信号/版本一致性/日志/资源）
  - `incident-loop.py` — 学习闭环（record/suggest/verify；INC-20260802-stash 已闭环可追溯）
  - settings.json — SessionStart + PostToolUse verify-incremental + env 块
- **验收**: §四 17 条全过（测试先行 6 套 48 断言 red→green；fail-open 实测；版本一致性实测；vitest ≤1；日志五件套；pre-commit 12 组无 --no-verify）
- **关联 incident**: INC-20260802-stash（D312 闭环）、INC-20260802-D300/D292/D286（D311 闭环）
- **作者**: Claude (D313+D314)
- **路线图（延后项）**: 常驻 daemon（产品化阶段）；CI 基线判定接线（ci-failures.json 只登记）；D309/D310 存量清理（_extinct 25 + admin-knowledge）；npm audit 决策；loop-score.sh 预存乱码修复

## 变更记录

### V4.6.0-WIP (2026-08-02) — D311 M1 多会话协调

- **变更**: 控制塔 V4.6.0 独立化第一阶段（M1 多会话协调）
- **关联 incident**: INC-20260802-D300（并行 session 覆盖 brief/暂存被卷走/中间态污染/空等 7h）、INC-20260802-D292（并行声明与实际写集不符）、INC-20260802-D286（"零共享"实为 15 个 src/ 文件重叠）
- **新增机制**:
  - `session_registry.py` — 会话注册表（register/write-set/claimants/attribution/gc/phase + fail-open + 损坏自愈 + 双层互斥）
  - `verify-parallel.sh` — 并行声明物理验证（dev doc 写集表解析/4 形态清洗/两两比对/fail-open）
  - `staging_guard.py` — 暂存区隔离（他人写集 → block；committed 忽略；杂散 → warn；fail-open）
  - `wait_manager.py` — 并行等待管理（CP1-CP4 阶段/错峰提示/依赖提示/等待显式化）
  - `pre-push-check.sh` — 门禁 3 改基（`origin/feat/prompt-architecture..HEAD`）+ 门禁 4 中间态警告 + 门禁 5 并行声明验证
  - `synova-commit` — 新增 `--session-id` + staging-guard 硬阻断 + 显式路径 commit + 写集 committed + 阶段 CP4
  - `VERSION.md` — 本文件（控制塔产品契约起点；正式首发在 D314）
- **写集表格式契约**（verify-parallel 依赖，未来 dev doc 必须遵守）:
  - 写集表标题: `### N.N 写集 (N 修改 + M 新建)`（正则 `^#{2,4}\s*\d+(\.\d+)*\s*写集`）
  - 表头: `| 文件 | 操作 | 说明 |`，第一列支持: 纯路径 / `[text](url)` 链接 / 行号后缀 `L750` / 计数 `(N 个)` / 目录级（`/` 结尾）
- **验证**: session-registry 12/12 | verify-parallel 13/13 | staging-guard 8/8 | wait-manager 7/7 测试通过
- **作者**: Claude (D311)

### V4.6.0-WIP (2026-08-03) — D312 M2 hook×git 兼容 + 官方基线工具 + U4

- **变更**: 控制塔 V4.6.0 独立化第二阶段（M2 + U4 脚本清理）
- **关联 incident**: INC-20260802-stash（git stash/pop 间隙被 hook 写文件 → pop 冲突，39 tracked + 615 untracked 卷入）
- **新增机制**:
  - `hook-git-guard.sh` — git 操作写窗口守卫库（git_op_window_active/enter/exit + TTL 300s + 标记文件 + fail-open）
  - `hook-git-detect.sh` — PreToolUse(Bash)+PostToolUse(Bash) hook（classify_command → stash/gitop/none；ban-stash 提示；写/清窗口；exit 0 永不阻断）
  - `baseline-check.sh` — 官方基线工具（tsc/测试失败/审计三基线；快照基线法存量 vs 新增；--seed/--update-baseline/--json；SYNO_ 注入缝；fail-open）
  - `settings.json` + `.codex/hooks.json` — 新增 Bash matcher（Claude + Codex 双侧防护）
  - `hook-block-write.sh` / `hook-check-memory.sh` — source guard + SKIP_HOOK_WRITES 包裹仓库内写点（L37/L39/L323/L118/L136-144；/tmp 证据保留）
  - AGENTS.md — 铁律 0-3 禁止 git stash（替代方案: baseline-check / worktree / synova-commit）
- **修复**: U4 — pre-commit-check.sh 分母统一 /12（10 处）+ 头部注释 9→12 组
- **验证**: baseline-check 13/13 | hook-git-detect 13/13 | ban-stash 6/6 测试通过；真实 seed 28 条 tsc 存量 → "存量 28 + 新增 0"
- **作者**: Claude (D312)
- **正式首发**: D314（含日志五件套/自身健康/daemon 轻量触发）
