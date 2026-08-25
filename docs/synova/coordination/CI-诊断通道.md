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
