# Git 完整性补全计划（Mac 加入前）

> 2026-08-14 | Codex 制定 | 目的：Mac 加入项目前，确保 git 仓库承载完整项目信息
> 状态：待执行 | 关联：ROLES.md / AUDIT-PROTOCOL.md / AUDIT-FINDINGS-LEDGER.md

## 一、背景与目标

Mac 即将加入项目。当前 git 仓库**大量关键文档从未提交**（工作区 327 个 untracked + 12 个 modified），
Mac clone 后将缺失：K3 全部审计报告、coordination 分工/审计制度、权威偏差登记册、147 个 dev doc、
大量权威文档（含 html 交付物）。本计划的目标是让 git 仓库成为项目信息的**唯一权威载体**。

## 二、现状盘点（2026-08-14 实测）

| 类别 | 数量 | 状态 |
|------|:---:|------|
| 未跟踪文件（untracked） | 327 | 从未进 git |
| 已跟踪但改动（modified） | 12 | 改了没提交 |
| 未推送提交（origin..HEAD） | 0 | 已提交的都已同步 |
| 审计报告 | 6 | 整个目录 untracked |
| coordination 文档 | 10 | 整个目录 untracked |
| 权威文档 .md | 40+ | untracked |
| 权威文档 .html | 112 | 被 `*.html` 忽略 |
| dev doc | 147 | untracked |
| 根目录审计报告 .html | 6 | 被 `*.html` 忽略 |

## 三、.gitignore 规则审计与修正

### 3.1 已确认的问题

| # | 现状规则 | 问题 | 修正 |
|---|---------|------|------|
| 1 | `*.html`（仅放行 app/） | 忽略根目录 6 个第三方审计报告 + docs 下 112 个权威文档 html——**html 是交付物，误伤** | 保留 `*.html` 默认忽略，加 `!/*.html` + `!docs/**/*.html` 放行 |
| 2 | `*.ps1`、`*.cmd` | 忽略 `bin/synova.cmd`、`scripts/setup.ps1`、`synova.cmd`、`install-path.ps1` 等安装/启动脚本——**正经代码被误伤** | 删除全局忽略，改加 `.claude/worktrees/` 目录级忽略 |
| 3 | `Dockerfile` | 忽略 Dockerfile（文件真实存在）——误写 | 删除该行 |
| 4 | `docs/research/*.md`、`docs/research/*.html` | 指向旧路径 `docs/research/`（含 2 个旧 md），非 `docs/synova/research/` | 保留（旧路径隔离），或按需清理——待确认 |

### 3.2 新增排除规则（运行时/敏感产物，明确不进 git）

```gitignore
# 企业事实数据（敏感，不进 git）
.codex/enterprise/facts/
# 本地设置与环境快照
.claude/settings.local.json
.claude/workflow-state.json
.codex/env-snapshot.json
.codex/settings/
# 控制塔运行时产物
.codex/control-tower/tmp/
.codex/control-tower/session-registry.json
.codex/control-tower/health.json
.codex/control-tower/*.corrupt-*
# 审计运行时产物（区别于 docs/synova/audit-reports/ 正式报告）
.codex/audit/
.codex/audit-reports/
# 临时 brief 与 worktree 副本
.claude/task-briefs/*-auto.md
.claude/worktrees/
```

## 四、分类清单

### 4.1 该进 git（必须提交）

| 目录/文件 | 数量 | 说明 |
|---------|:---:|------|
| docs/synova/audit-reports/ | 6 | K3 审计报告 D328-D331 + 全链路审计 |
| docs/synova/coordination/ | 10 | ROLES/AUDIT-PROTOCOL/台账/决策参考/接口策略/并行纪律/K3 材料/审计任务书 |
| docs/synova/research/*.md | 40+ | 权威文档 01-18 + AUTHORITY-DEVIATION-REGISTRY-v1/v2 + A/B/C 线 + DeepSeek 哲学 |
| docs/synova/research/**/*.html | 112 | 权威文档 html 交付物 |
| 根目录 *.html | 6 | 第三方审计委托书/报告、架构裁决、TUI 审计报告 |
| docs/plans/codex/implementation/*.md | 147 | dev doc |
| docs/synova/DASHBOARD-CN.md / DASHBOARD.md | 2 | 双仪表盘（modified） |
| .claude/skills/synova-audit/ | 1 目录 | 审计 skill |
| .claude/workflows/ | 1 目录 | workflow 定义 |
| scripts/control-tower 新文件 | 6 | 控制塔组件 |
| tests/control-tower 新文件 | 2 | 测试 |
| scripts/workflow 新文件 | 3 | 工作流脚本 |
| .claude/task-briefs/ 非 auto | 3 | D291/D329/D331 brief |
| Dockerfile + bin/synova.cmd + scripts/*.ps1 + synova.cmd | 若干 | 恢复被误忽略的构建/安装脚本 |

### 4.2 不进 git（运行时/敏感，加 .gitignore）

- `.codex/enterprise/facts/`（企业数据）
- `.claude/settings.local.json`、`.claude/workflow-state.json`
- `.codex/env-snapshot.json`、`.codex/settings/`
- `.codex/control-tower/tmp/`、`session-registry.json`、`health.json`、`*.corrupt-*`
- `.codex/audit/`、`.codex/audit-reports/`
- `.claude/task-briefs/*-auto.md`、`.claude/worktrees/`

## 五、分批提交计划

> 每批走 `synova-commit`（过 pre-commit 门禁 + bypass 对账），逐批 push。
> 注意并行 session（Claude code）活跃，提交前先确认暂存区无他人写集（staging-guard）。

| 批次 | 内容 | 说明 |
|:---:|------|------|
| 1 | 修正 .gitignore | 加运行时/敏感排除 + 放行 html/ps1/cmd + 修 Dockerfile |
| 2 | 审计报告 6 + coordination 10 | "大脑记忆"最先入仓，Mac 至少拿到分工制度 + 全部审计发现 |
| 3 | 权威文档 .md 40+ | 权威文档 + 偏差登记册 |
| 4 | 权威文档 html 112 + 根目录 html 6 | html 交付物 |
| 5 | dev doc 147 | 可按日期再拆 2-3 小批，避免单次过大 |
| 6 | 仪表盘 + 品牌替换 9 文件 + task-brief + scripts/tests 新文件 | 收尾 |

## 六、决策记录

| 决策 | 结论 | 来源 |
|------|------|------|
| `.codex/enterprise/facts/` 是否进 git | ❌ 不进 | 创始人 2026-08-14 |
| 权威文档/审计报告 html 是否进 git | ✅ 进（html 是交付物，长内容用 html 承载） | 创始人 2026-08-14 |
| Windows 脚本 .ps1/.cmd 是否恢复跟踪 | ✅ 恢复（正经安装/启动脚本） | Codex 建议，待创始人确认 |
| docs/research/ 旧路径 2 个旧 md | ⏳ 待确认（保留忽略 or 一并入 git） | 待创始人 |

## 七、执行注意事项

1. **不无脑 `git add .`**——327 untracked 里混着敏感企业数据与运行时产物，必须按 §4 分类分批 add。
2. **并行 session 协调**——提交前 `git status` 确认暂存区，遇并行 session 抢占先确认对方是否活跃。
3. **门禁合规**——每批走 synova-commit（12 组 pre-commit + bypass 对账），不用 `--no-verify`。
4. **version.log**——本计划属 chore，若涉及控制塔版本不动 VERSION.md，只追加 version.log 记录。
5. **完成标准**——全部批次完成后 `git status` 干净（仅剩应被忽略的运行时产物）、`origin..HEAD` 空、双机 clone 能拿到全部 §4.1 文档。
