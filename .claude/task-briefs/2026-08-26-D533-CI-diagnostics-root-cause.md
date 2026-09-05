# Task Brief: D533 CI-diagnostics-root-cause

> 生成: 2026-08-26 | 任务: D533 | 认领: 并行 CTO（控制塔线）
> 参考: D333 决策四步（第一性原理→Anthropic→开源实证→收敛）
> dev doc: docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D533-ci-diagnostics-20260825.md

#CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
CI 调试可达性根治（控制塔 slice）。D529 复盘：真正机制病根 = ① GitHub token 未落位（.credentials.yaml 不存在，日志 403）② .gitattributes 缺 eol 规则（CRLF 永久脏，15 个测试文件挡 checkout）③ debug 回传无纪律。审计后收敛 5 项 → 3 项（③④ 非真正问题取消）。
### b) 文件审计
- `.gitattributes`：origin/main 已有 `*.sh text eol=lf` + `*.py text eol=lf`（D520 加），但 `git add --renormalize` 从未跑 → 15 个 CRLF blob 永久脏（新 worktree 实测复现）
- `scripts/audit/*.py`：2 个 CRLF 文件（check-gates-v2.py / self-diagnosis.py）——K3 红线禁碰，需 `-text` 豁免
- `docs/synova/coordination/CI-诊断通道.md`：CI 诊断通道文档，③ 纪律落点
- `~/.dsh/.credentials.yaml`：已有 DEEPSEEK/MOONSHOTAI/ZAI keys（0600），① 的 GITHUB_TOKEN 落点
### c) 决策
复用：.gitattributes 既有 eol 规则 + renormalize（治本）；.credentials.yaml 补条目；CI-诊断通道.md 加纪律段。无冲突。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
- 铁律 0-3（worktree 隔离）、铁律 34（feature branch）：本任务在独立 worktree `chore/d533-ci-diagnostics` 执行，不动主树脏暂存区
- memory/2026-08-20-d460：credentials.yaml 惯例 = ~/.dsh/.credentials.yaml（key 不入库，0600）
- 铁律 0-5 审计红线：scripts/audit/ 永不修改 → `.gitattributes` 加 `scripts/audit/** -text` 豁免（字节级不变，零噪音）
- Anthropic 决策链：一行 .gitattributes 规则防一类（CRLF），token 一行配置（凭证可达），文档一条纪律——最小机制，不新增门禁/脚本
参考：Anthropic 工程基线（最小机制防一类）+ 第一性原理（真正障碍 = 凭证可达 + 行尾规范化）

## Q2: 范围 — 正确的最简方案
做什么：
- .gitattributes — 追加 `scripts/audit/** -text` + `scripts/control-tower/*.py -text`（K3/CT-40 红线保护，既有 `*.sh/*.py text eol=lf` 保留）
- scripts/doc-system/check-doc-truth.sh — git add --renormalize 规范化（CRLF→LF）
- scripts/doc-system/doc-categories.sh — git add --renormalize 规范化（CRLF→LF）
- scripts/doc-system/doc-registry-gate.sh — git add --renormalize 规范化（CRLF→LF）
- scripts/doc-system/doc-staleness.sh — git add --renormalize 规范化（CRLF→LF）
- scripts/doc-system/doc-triage.sh — git add --renormalize 规范化（CRLF→LF）
- scripts/doc-system/generate-chronicle-monthly.sh — git add --renormalize 规范化（CRLF→LF）
- scripts/doc-system/install-chronicle-schedule.sh — git add --renormalize 规范化（CRLF→LF）
- scripts/jtbd-dedup-v2.py — git add --renormalize 规范化（CRLF→LF）
- scripts/jtbd-dedup.py — git add --renormalize 规范化（CRLF→LF）
- docs/research/growth-diagnostics/_build.py — git add --renormalize 规范化（CRLF→LF）
- docs/research/growth-diagnostics/gen_epsilon.py — git add --renormalize 规范化（CRLF→LF）
- tests/control-tower/brief-template-decision.test.sh — git add --renormalize 规范化（CRLF→LF）
- tests/doc-system/doc-registry-gate.test.sh — git add --renormalize 规范化（CRLF→LF）
- docs/synova/coordination/CI-诊断通道.md — 加 ci-debug/* 独立分支回传纪律
- .codex/control-tower/VERSION.md — bump V5.1.2（D533 控制塔行为变更，PATCH）
- ~/.dsh/.credentials.yaml — 补 GITHUB_TOKEN 条目（本地 0600，不 commit）
- task-state/D533.json — 回填 impl.commit + 证据
不做什么：
- 不改 scripts/audit/（K3 红线，-text 豁免保证零 diff）
- 不改 scripts/control-tower/env_validator.py / inject-context.py 内容（-text 豁免，字节不变）
- 不改 src/（产品代码）
- 不新增控制塔脚本
- 不装 gh CLI（可选工具，curl + token 即可）

## Q3: 验收 — 入口 → 交互 → 结果
入口：新 worktree `chore/d533-ci-diagnostics`（源自 origin/main）
处理：.gitattributes 豁免 → renormalize → CI 文档纪律 → token 落位 → curl 拉日志
结果：
- ① `curl -H "Authorization: token $GITHUB_TOKEN" .../actions/jobs/<id>/logs` 拉到最近失败 run 日志
- ② `git status` 零噪音（15 个 CRLF 文件全部规范化，audit 文件 -text 豁免）
- ③ 文档 grep "ci-debug" 有独立分支纪律条目

## 架构层: scripts（控制塔）/ 开发环境治理
## Done 标准
- [ ] verify: `git status --porcelain | wc -l` 仅剩预期 staged 文件，无 unstaged 噪音
- [ ] verify: `git diff origin/main -- .gitattributes` 只含 `scripts/audit/** -text` 追加
- [ ] verify: `grep -c "ci-debug" docs/synova/coordination/CI-诊断通道.md` > 0
- [ ] verify: `curl -H "Authorization: token $GITHUB_TOKEN" .../logs` 返回 200 + 日志内容
- [ ] verify: `git diff origin/main --stat` 只含 .gitattributes + CRLF 规范化 + 文档 + task-state
