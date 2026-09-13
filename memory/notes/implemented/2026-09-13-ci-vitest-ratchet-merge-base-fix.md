# D721 决策记录：CI 存量失败棘轮的变更集基准修正 + 放行可见化

> 日期: 2026-09-13 | 任务: D721 | 类型: 控制塔 CI 门禁修复（治理变更，铁律 49）
> 触发: #513（D711 D-1 决策文档）PR 永红复盘

## 一、问题（两个，均由实测证据确证）

### F2 — 变更集基准在合并提交上算错（PR 永红）
`.github/workflows/ci.yml` 的 Vitest 作业有一层**存量失败棘轮**：失败用例若不在「本次改动」集合内，
判为历史遗留并放行。判据原为：

```bash
CHANGED=$(git diff --name-only HEAD~1..HEAD ...)
```

当 HEAD 是**合并提交**时（CTO 刷新分支的标准动作 `git merge origin/main`），`HEAD~1` = 分支尖端，
于是 `HEAD~1..HEAD` = **被并入的 main 全部改动** → 存量红被算成「本 PR 新增红」→ PR 永红。

**实证**：#513 head `bf6ac999` 与 `5aae38fc`（当时 main）`git diff` 为 **0 个文件**（内容完全相同），
CI 却判 3 个「新增失败」；重跑（run 34741372885 attempt=2）同样失败 → 非 flaky，是判据确定性错误。

### F1 — 存量红被静默放行（仓库级假绿）
同一机制让 main 自己的红灯长期隐形。实测 main `021897a0` 的 Vitest(2/2) 日志：

```
Test Files  3 failed | 286 passed | 1 skipped (290)
Pre-existing test failures from unchanged files — not blocking
```

作业结论 = **success**。即「main 全绿」是推断，不是事实（铁律 47 的镜像：结论必须由日志证明）。
三个真红（本地 vitest 实测复现，与 CI 逐条一致）：
`tests/agent/expert-file-loader.integration.test.ts`（断言 8 位专家，仓库实为 6）、
`tests/l3/graphbridge-wiring.test.ts`（`expected +0 to be 1`）、
`tests/electron/use-streaming-conversation.test.ts`（`Cannot find package 'react-markdown'`）。

## 二、决策（D333 四步收敛）

1. **第一性原理**：棘轮的存在理由是「避免历史红压垮当前 PR」——它必须回答的问题是
   *「这个失败是不是本 PR 引入的？」*。基准错，答案就错。
2. **Anthropic 工程基线 / 开源实证**：判定「本分支引入了什么」的标准做法是三点差
   `git diff $(git merge-base base head)..head`（同仓 `merge_writeset_gate.py` 即用 merge-base，D708 先例）。
3. **收敛**：
   - **F2 → 修判据**：改用 `merge-base(refs/remotes/origin/main, HEAD)..HEAD`；origin/main 不可用时回退旧判据**并打 `::warning::`**（降级可见）。
   - **F1 → 不取消棘轮、不收紧阈值**，改为**放行可见**：`::warning::` + 放行文件名清单 + 指向 backlog 登记项。
     取消棘轮会让 main 立刻全红并压垮编码线——正是 V4.5.1 教训（门禁误拦 → `--no-verify` → 全线失效）。
   - **红本身**：另行处理（react-markdown → D717 在途；expert 数漂移需先裁意图；graphbridge → 新登记）。

## 三、验证（可复核）

- `tests/control-tower/ci-ratchet-base.test.sh`（新增，12 断言，已接线进 ci.yml 白名单）：
  沙箱构造「main 前进 + 分支合并 main」的合并提交，**固化反例**（旧判据确实纳入 main 并入的文件）、
  验证新判据排除并入文件、保留本分支改动、无合并分支上新旧等价、降级带告警、放行列出文件名。
- `bash tests/control-tower/ci-ratchet-base.test.sh` → 12 通过 0 失败。
- YAML 合法性：`node -e "require('js-yaml').load(fs.readFileSync('.github/workflows/ci.yml','utf8'))"` → ok（9 个 job）。

## 四、教训（写入体系，避免同类第二次）

1. **修别人的红之前，先证明红是谁的**：用「内容零差异 + 判据输出」两条硬证据区分「PR 引入」与「基准算错」。
2. **降级机制必须可见**：静默放行让 main 假绿了很久，直到一次误判才暴露——这正是铁律 11 要防的。
3. **CTO 的常规动作也会被自己改的门禁反咬**：刷新分支（merge main）改变了 PR 的形状，门禁必须对「合并提交」这种形状正确。
4. **`HEAD~1..HEAD` 只在「刚提交完的单提交语境」成立**（同仓 `synova-commit`/`post-commit` 用途正确），
   一旦用在 PR/分支语境即错——已在本单注释中固化边界。

## 五、遗留

- `PLAN-main-vitest-preexisting-red`（P1）：三个真红必须烧掉，勿长期依赖放行。
- `PLAN-graphbridge-wiring-red`（P2）：产品缺陷 vs 测试期望漂移，待编码线判。
- `PLAN-expert-count-drift`（存量）：8 位是意图还是文档漂移，需产品侧裁定。
