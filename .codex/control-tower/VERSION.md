# 控制塔 VERSION — 版本与变更记录

> 控制塔产品契约（设计文档 §2.6/§2.7）。版本只增不减；任何门禁/工具行为变化必须 bump（PATCH 起步）；bump 与代码同 commit。

## 版本规则

```
版本号: MAJOR.MINOR.PATCH
- PATCH (第三位): 小升级 — bug 修复/门禁微调 → 4.6.0 → 4.6.1
- MINOR (第二位): 中升级 — 新机制/新组件/新门禁组 → 4.6.0 → 4.7.0
- MAJOR (第一位): 大改版 — 架构重构/产品化里程碑 → 4.6.0 → 5.0.0
```

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
