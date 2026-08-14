# 文档拉平指引（D337, 2026-08-14 创始人定）

> 目标：把 Win 机上所有未提交的项目文档整理入库，让 Mac 侧 DeepSeek Harness
> 看到完整项目知识。执行者：Codex（Win）。执行方式：按铁律 0-3 PR 工作流。

## 一、提交范围三分类

### ✅ 必须提交
- `docs/plans/` — 所有 dev doc / 设计文档 / 研究方案（含 07-06 之后的全部产出）
- `docs/research/` — 研究文档、业界调研
- `docs/specs/` — 规格文档
- `memory/` — 全部教训库文件（当前 git 内仅 20 个，Win 侧如有更多请补全）
- `docs/synova/` — 体系文档、决策记录
- `theory/`、`knowledge/` — 理论与知识库
- `.claude/task-briefs/` — 历史 brief（归档价值；当前敏感信息可脱敏后再提交）

### ❌ 不提交（本地态，进 .gitignore 或留在本地）
- `.env`（密钥）
- `data/`（数据库与备份）
- `synova-*.log`（运行日志）
- `.claude/loop-state.json`、`.claude/current-brief*`、`.claude/.precommit-par/`（session 状态）
- `.codex/control-tower/health.json`、`session-registry.json`（运行状态）
- `node_modules/`

## 二、整理要求

1. **目录归类**：按上述目录放，不新发明目录层级（沿用 docs/ 现有分类）
2. **更新索引**：重新生成 `docs/synova/DOCUMENT-INVENTORY.md`（当前版本停在 2026-07-07，289 文件，已过时）
3. **写导读**：新建 `docs/synova/HARNESS-ONBOARDING.md`（100-200 行），按优先级列出
   新成员（DeepSeek Harness）必读文档清单，至少覆盖：
   - 产品定位与市场（1-3 份）
   - 当前架构现状与理想架构（1-3 份）
   - 最新路线图/在办任务（1-3 份）
   - 最近一个月的重大决策与事故教训（3-5 份）
   - 控制塔体系说明（1-2 份）
   每份附一句话说明"为什么必读"
4. **冲突处理**：若发现 Win 侧文档与已提交版本有冲突/重复，以 Win 侧为准覆盖，
   并在 commit message 注明

## 三、提交流程（PR 工作流 — 先提交 → 再拉平 → 再合流）

> ⚠️ 顺序铁律：未提交文件是全项目最脆弱的东西（唯一副本）。
> 必须先把它们 commit 锁进 git，再动分支。禁止带着未提交文件 pull/切分支
> （git 会报错卡住；更糟的是任何失误都可能弄丢唯一副本）。

```bash
# ── 第一步：先提交（保存文档，锁进保险箱）──
git add -A
git commit -m "docs(WIP): 本地未提交文档存档 — 拉平前快照"
# 注：若被 pre-commit 门禁拦（brief 缺失等），先用 synova-commit 走完整门禁，
#     或问创始人授权；无论如何：先 commit，再动分支。

# ── 第二步：拉平 main（拿到唯一真相）──
git fetch --all
git checkout main && git pull --ff-only
# 若 checkout 被未提交文件挡住 → 回到第一步，把剩余文件也 commit

# ── 第三步：合流（基于最新 main 开同步分支）──
git checkout -b feat/docs-sync-<日期>
git cherry-pick <第一步的 commit>          # 把文档提交带过来
# （若文档 commit 在别的分支上，cherry-pick 其 hash；冲突时问创始人仲裁）
git push ssh feat/docs-sync-<日期>
# 给创始人 PR 链接 → 创始人点 Merge
```

## 四、拉平后 Mac 侧动作（DeepSeek Harness 执行）

1. `git fetch --all && git pull --ff-only`
2. 读 `docs/synova/HARNESS-ONBOARDING.md` 导读
3. 读 `docs/synova/DOCUMENT-INVENTORY.md` 新索引
4. 按导读优先级消化文档，输出"项目全貌理解 v2"给创始人确认
5. 后续任务开工前先查 `docs/synova/coordination/TASK-ROUTING.md`（D336 路由表）

## 五、验收标准

- [ ] `git ls-files "docs/plans/**"` 包含 07-06 之后的全部 dev doc
- [ ] `memory/` 文件数 ≥ 40（或说明为何不足）
- [ ] `DOCUMENT-INVENTORY.md` 重新生成且日期为 2026-08-14 之后
- [ ] `HARNESS-ONBOARDING.md` 存在且含 ≥10 份必读清单
- [ ] 无 .env / data/ / 日志文件混入提交
