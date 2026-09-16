# CI 诊断通道 — 本地无 token 时如何读 CI 失败（D521/工具1）

> 2026-08-24 立 | 归属: CTO | 触发: D520 复盘「CI 红白等 30 分钟盲猜」——本机无 gh CLI / GitHub token 时，CI 失败输出其实有公开通道可读。

## 一、原理

GitHub 公开仓库的 **check-runs annotations API 匿名可读**（无需 token）。workflow command `::error title=X::消息` 会把消息写进 annotations。控制塔门禁失败输出已统一带 `::error` 前缀（D521 接线，pre-commit-check.sh hard_check + 终局 verdict），CT 测试 job 失败时也可用同款命令带输出。

## 二、操作（curl 模板，全程匿名）

```bash
REPO=tangbaobao520/SynovaAgent
BRANCH=feat/xxx

# 1. 找分支最新 run（status/conclusion/id）
curl -s "https://api.github.com/repos/$REPO/actions/runs?branch=$BRANCH&per_page=1" \
  | python3 -c "import json,sys; r=json.load(sys.stdin)['workflow_runs'][0]; print(r['id'], r['status'], r['conclusion'])"

# 2. 找失败 job id
RID=<上一步 id>
curl -s "https://api.github.com/repos/$REPO/actions/runs/$RID/jobs" \
  | python3 -c "import json,sys; [print(j['id'], j['name'], j['conclusion']) for j in json.load(sys.stdin)['jobs'] if j['conclusion']=='failure']"

# 3. 读该 job 的 annotations（::error 消息——含门禁点名/失败行）
JID=<失败 job id>
curl -s "https://api.github.com/repos/$REPO/check-runs/$JID/annotations" \
  | python3 -c "import json,sys; [print(a.get('title',''),'::',a.get('message','')[:400]) for a in json.load(sys.stdin)]"
```

## 三、注意

- `actions/jobs/{id}/logs`（完整日志）**需要 token**——没有 token 时用 annotations，已够定位门禁级失败（点名到检查项和文件行）。
- 测试 job 的逐用例输出不在 annotations 时，临时给 job 加 `::error title=$t::$(tail -10 out)` 诊断段（D520 实证两次定位），**用完即撤**。
- 配套：`bash scripts/control-tower/simulate-ci.sh` 在 push 前做 CI 等价模拟——本地能抓的错不送 CI（D520 复盘工具 2）。

## 四、何时不该用

- 机密仓库 annotations 需鉴权 → 此通道失效，需申请 token。
- 测试逻辑级 debug（非门禁点名）→ 用 simulate-ci 本地复现，不靠 CI 日志。

## 五、debug 回传纪律（D533，2026-08-26 立）

> 背景: D529 期间曾把 CI debug 回传直接推到工作分支（synova-mac 人工提交，被误判为"机器人提交"），
> 污染分支历史 + 干扰 merge。控制塔纪律如下：

1. **任何 CI debug 回传必须推独立 `ci-debug/*` 分支**（如 `ci-debug/d529-logs`），**永不动工作分支**。
   工作分支只承载功能变更；debug 产物（临时日志、诊断输出、临时脚本）一律走 ci-debug/*。
2. **首选 curl/gh 日志通道**：凭证已共享（`.credentials.yaml` 的 `GITHUB_TOKEN`，见 D533 ①），
   用 `curl -H "Authorization: token $GITHUB_TOKEN" .../actions/jobs/<id>/logs` 直接拉日志，
   或 `gh run view <id> --log`（如已装 gh CLI）。不需要把日志 commit 进仓库。
3. debug 产物用完即撤（临时分支删除），不留仓库垃圾；与 `simulate-ci.sh` 本地复现互补——
   能本地抓的错不送 CI，送 CI 的 debug 走独立分支。

---

# PART B — 仪表盘自动更新链路（D786，2026-09-16 立）

> 回答一个问题：**「数字自动刷新」这条链怎么走、断了怎么查。**
> 建立背景：D774 收口验收（D786 派单）实测发现 bot PR 自 2026-09-07 起永久 blocked、
> 产物停更 3 天+无人发现（派单 F1-F7）。
> 决策 Note：`memory/notes/implemented/2026-09-16-d786-dashboard-channel-watchdog.md`

## B.1 这条链现在怎么走（通道设计 b，2026-09-16 起）

```
┌─ 触发 ─────────────────────────────────────────────────────────────┐
│ push 到 main / 每周五 09:00 UTC / 手动 workflow_dispatch            │
└────────────────────────────────────────────────────────────────────┘
   ↓
product-progress.yml（进度产物）/ dashboard-auto.yml（控制台产物）
   ↓ 刷新产物（refresh-all / generate-dashboard）
   ↓ 有变化 → force push bot 分支 auto/product-progress（或 auto/dashboard）
   ↓ 【不再由 bot 开 PR】
┌─ CTO session 显式合并（人工=明确的一步，不静默卡死）─────────────────┐
│ 1. 用 PAT 从 bot 分支开 PR（真实凭据 → 12 个必需检查正常报告）       │
│ 2. 等 CI 全绿（check-runs 非零且全 pass）                            │
│ 3. API squash 合并（合并是 CTO 的工作，D570）                        │
└────────────────────────────────────────────────────────────────────┘
   ↓
┌─ 兜底看门狗（断了 3 天内必有人知道）───────────────────────────────┐
│ progress-freshness-watchdog.yml 每日 01:30 UTC 跑                   │
│ check-progress-freshness.py：generated_at 距今 > 3 天               │
│   → exit 1 → job 红灯 + Actions 失败邮件（告警可见）                │
│ 产物缺失/JSON 损坏 → exit 2 同样红灯（查不了 ≠ 新鲜，fail-closed）  │
└────────────────────────────────────────────────────────────────────┘
```

CTO 合并 bot 分支的标准命令（token 在 `~/.dsh/.credentials.yaml` 的 `GITHUB_TOKEN`）：

```bash
# 1. 开 PR（PAT = 真实凭据，CI 会正常触发）
curl -s -X POST -H "Authorization: token $TOKEN" \
  "https://api.github.com/repos/tangbaobao520/SynovaAgent/pulls" \
  -d '{"title":"chore(D371): 产品进度自动更新","head":"auto/product-progress","base":"main"}'
# 2. 查检查是否报告（必须非零！零 = 通道又断了，见 B.2）
SHA=$(git ls-remote git@github.com:tangbaobao520/SynovaAgent.git refs/heads/auto/product-progress | cut -f1)
curl -s -H "Authorization: token $TOKEN" \
  "https://api.github.com/repos/tangbaobao520/SynovaAgent/commits/$SHA/check-runs" | python3 -c "import json,sys;print(json.load(sys.stdin)['total_count'])"
# 3. 全绿后合并
curl -s -X PUT -H "Authorization: token $TOKEN" \
  "https://api.github.com/repos/tangbaobao520/SynovaAgent/pulls/<PR号>/merge" \
  -d '{"merge_method":"squash"}'
```

## B.2 断链根因档案（防再犯）

**症状**（下次见到 = 同一病）：
- PR 作者 = `github-actions[bot]`，`mergeable_state: blocked`，创建后 `check-runs total_count: 0` 且 `statuses total_count: 0` 永不变化；
- 分支保护要求的必需检查一个都不报告，PR 无限挂起；
- 产物（product-progress.json 的 `generated_at`）多天不更新且无告警。

**根因**：workflow 用 `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` 执行 `gh pr create`。
GitHub 平台设计（官方文档 "Triggering a workflow from a workflow"）：**由 GITHUB_TOKEN 触发的事件
（除 workflow_dispatch / repository_dispatch）不会触发新的 workflow run**（防递归）。
→ bot 创建的 PR 上，任何 `pull_request` 触发的 workflow 都不跑 → main 分支保护的 12 个必需检查
（Architecture Check / Checker Review / Control Tower Gate ×2 / Golden Case F1 / Integration
Contract / Test-Kit ×2 / TS+Lint+Iron Laws / Vitest ×2 / npm audit）**永不报告** → PR 永久 blocked。
**这不是配置错误，是平台行为；PR 必须由真实凭据（PAT / GitHub App / 人）创建才能拿到检查。**

历史实证：#404（auto/product-progress，2026-09-07 创建，head 6395b014 check-runs=0）、
#403（auto/dashboard，同症状）——两 PR 于 2026-09-16 由 D786 关闭（前置 + T2）。

**为什么旧设计的 D373 自愈救不了**：D373 只处理「有分支无 PR」的悬挂态，不处理
「有 PR 但检查永不报告」的僵尸态——僵尸 PR 在旧代码眼里是"健康"的。

## B.3 诊断流程（下次断能查，按序）

1. **看门狗先说话**：Actions 页 `Progress Freshness Watchdog (D786)` 变红 / 收到失败邮件
   → main 上产物 `generated_at` 已 >3 天。本地复现：
   `python3 scripts/product-lines/check-progress-freshness.py`（exit 1 = 过期，exit 2 = 产物坏了）。
2. **查 bot 分支是否还在产出**：Actions 页 `Product Progress (A1-A5)` / `Dashboard Auto (D439)`
   最近 run 是否绿；`git ls-remote origin auto/product-progress` 是否存在。
3. **查是否有僵尸 PR**：开 PR 的人是谁？`github-actions[bot]` + check-runs=0 = B.2 病
   （新代码不应再产生；若出现 = 有人把 `gh pr create` 加回来了）。
4. **CTO 合并环节断了**（bot 分支有新提交但没人开 PR）：按 B.1 标准命令走 1-2-3。
5. **上游断**：refresh-all 本身红（证据/脚本问题）→ 查 `rerun-evidence-summary-<date>.json`
   与 D774 流水线文档（scripts/product-lines/README.md）。

## B.4 为什么不选方案 (a)（PAT/GitHub App 开 PR）——升级路径

| | (b) 现行：分支 + CTO 显式合并 | (a) 升级：PAT/App token 开 PR |
|---|---|---|
| CI 必需检查 | ✓（PR 由 PAT 创建，真实凭据） | ✓ |
| 安全 posture | 零新增凭据面 | 需向 repo secret 写入能开 PR 的 token |
| 合并节奏 | 随 CTO 节奏（周报/看板节奏） | 可全自动 |
| 断链可见性 | 看门狗 3 天红灯 | 看门狗 3 天红灯 |

**未采 (a) 的原因**：当前唯一可用凭据是创始人个人宽权 classic PAT——单方面写入 repo secret
意味着任何未来 workflow 都能以创始人全部权限行事（安全 posture 变更，CTO 不自决）。
**升级判据**：创始人愿意后，创建**最小权限 fine-grained PAT**（仅本仓库
`contents:write` + `pull_requests:write`）→ 配为 repo secret（如 `SYNC_PR_TOKEN`）→
两个 workflow 的末步骤改回 `gh pr create`（env 用该 secret）→ 删除 B.1 的 CTO 手工开 PR 步骤。
看门狗两条路线通用，无需改动。

## B.5 相关文件索引

| 文件 | 角色 |
|---|---|
| `.github/workflows/product-progress.yml` | 进度产物刷新 + bot 分支（不再开 PR） |
| `.github/workflows/dashboard-auto.yml` | 控制台产物 + bot 分支（不再开 PR） |
| `.github/workflows/progress-freshness-watchdog.yml` | 每日新鲜度看门狗（>3 天红灯） |
| `scripts/product-lines/check-progress-freshness.py` | 看门狗脚本（三态退出：0 绿 / 1 过期 / 2 降级） |
| `tests/control-tower/check-progress-freshness.test.sh` | 看门狗密封测试（ci.yml canary，双平台） |
| `scripts/product-lines/rerun-evidence.sh` | 证据保鲜流水线（D774；产物刷新的正源） |
| `memory/notes/implemented/2026-09-16-d786-dashboard-channel-watchdog.md` | 决策 Note（铁律 49） |
