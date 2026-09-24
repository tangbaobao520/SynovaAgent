# D948 切片 A + D949 独立复核 — REVIEW-EXEC（对抗性，非点头）

> 复核人：`reviewer`（task-9）｜ 唯一写入文件 = 本文件 ｜ **不写产品代码、不施加变异体**（写集限制）
> 复核时点：**2026-09-25**（口径见各段）｜ 主仓库 `origin/main = 6a714483`；本地 `main = 1a1cccc8`（**落后**，见 §8）
> 复核对象（均已 push，`ls-remote` 亲测）：
> - 切片 A：`feat/d948-identity-chain-server` = **`e551dc837897d7d078b173ec7890ab5740d04a42`**，base `ef5c8caa`，工作树 `.synova-wt-d948-server`（HEAD 同）
> - D949：`fix/d949-ownership-electron-tests` = **`f828311ceecf9eda63d857fffb37c92fae4e7417`**（真实提交 `ee6b0c8d`），base `origin/main@6a714483`（`git merge-base --is-ancestor 6a714483 f828311c` → `0` = 真祖先 ✅），工作树 `.synova-wt-d949-ownership`（HEAD 同）
> - 自验件：`T-V-slice-a.md`（verifier-tv，278 行）
> **措辞纪律**：本件只给「自验结论 / 可提请独立审计 / 退回」，**不含"审计通过"**——审计结论只认 K3。通过与否归 **CTO 收件闸 + K3 终审**。

---

## §0 结论摘要

| # | 复核项 | 结论 |
|---|---|---|
| 1 | 写集对账 | `[通过]`（切片 A 9 件 = 声明 8 + `bypass.log` 自动产物；D949 5 件 = 声明 3 实变更 + brief + `bypass.log`）＋ 2 条登记（§1.4/§1.5） |
| 2 | 域 | `[通过]` 切片 A `✅ PASS 7 同域 win`；D949 `✅ PASS 2 同域 mac`（均含豁免项，见 §2） |
| 3 | 判据可证伪性 | **`[阻塞]` 1 条**（§3.8：派单 §六 要求的「部门**大小写/空白差异**一律 fail-closed」**无任何判据**）+ `[建议]` 3 条 |
| 4 | A6 拒绝分支是否被删 | `[通过]`（`auth.ts:526-531` 语义完整保留，且 diff 在该区零删除） |
| 5 | N1 / FG-6 | `[通过]`（4 个涉身份夹具**全部**先覆写再断言；FG-6 判别器在场且可红——verifier M4/M5b 已实跑，我核其判定边界见 §5.3） |
| 6 | D949 专项 | `[通过]`（CODEOWNERS **逐字节一致**我独立复现；金测试 **58/58 EXIT=0**；切片 B **8 文件 PASS mac**；"改坏即红"我独立复现） |
| 7 | 红线 | `[通过]`（`detected-bypass` 计数**跨 base/两个 HEAD 恒为 19** ⇒ 零新增；`scripts/**` 零触碰；新增行 `as any`=0） |
| 8 | 回执基准 | `[通过]`（切片 A 回执写 `ef5c8caa..HEAD`；D949 的 `base` 字段写 `origin/main 6a714483`）＋ **`[阻塞·M6]` 1 条**（§8.5：自验件 `T-V-slice-a.md` **未入库**）＋ 1 条 `[建议]`（§8.3） |
| — | 独立实跑 | 我自跑：切片 A 靶向 **4 文件 / 141 passed / exit 0**；D949 金测试 **58/58**；域判定 3 组；CODEOWNERS 字节比对；D949 mutant yaml 反证。**未跑全量套件**（派单约束） |

**退回判定：不建议退回**（唯一 `[阻塞]` 是**判据覆盖缺口**，补断言即可，不涉及已实现逻辑错误）。
**但有 1 条必须在 CTO 收件前补**（§3.8）——它是「派单明确要求的判据 → PLAN 收窄 → 实现继承」的链式丢失，不补则"三路径边界"验收不完整。

---

## §1 写集对账（逐文件）

### 1.1 切片 A —— 实际 9 件 vs 声明 8 件

```
$ git diff --name-only ef5c8caa..e551dc83
.claude/bypass.log                                            ← 声明外（自动产物）
.claude/task-briefs/2026-09-25-D948-slice-a-identity-chain.md ← 声明内（task-6 第 8 项）
src/middleware/auth.ts                                        ← 声明内 1
src/middleware/rbac.ts                                        ← 声明内 2
src/routes/auth.ts                                            ← 声明内 3
tests/middleware/auth.test.ts                                 ← 声明内 4
tests/middleware/rbac.test.ts                                 ← 声明内 5
tests/routes/auth.test.ts                                     ← 声明内 6
tests/routes/d948-department-visibility.test.ts               ← 声明内 7（R2 新建）
$ (共 9 行) | git diff --stat → 9 files changed, 1102 insertions(+), 16 deletions(-)
```
**判定 `[通过]`**：声明内 8 件**全部在场、零缺项、零越界到产品面**；第 9 件 `.claude/bypass.log` 是 D521 post-commit hook 自动产物。

### 1.2 `bypass.log` 出现的可接受性 → `[通过]`（三条依据，缺一不可）

1. **它是 hook 自动写的，不是人写的**：`ownership.yaml` 把它列在**域判定豁免**名单（`docs/synova/coordination/ownership.yaml:187-192` 注释实证：「`.claude/bypass.log` 出现在**每一个**分支（post-commit hook 自动登记，D521）→ 不豁免则每个 PR 都被判跨域」）。我实测本轮两支均为 `domain-neutral`（§2）。
2. **内容只是 PASS 登记，不是绕过**：切片 A 新增 4 行全为 `COMMITTED | pre-commit PASS (hook 层登记)`（见 §7.1 原文）；且 `detected-bypass` 计数**不变量**（§7.2）。
3. **它不遮蔽任何判据**：不参与功能、不被测试引用。

⇒ **可接受**。**但 `[建议]`**：回执必须显式写「第 9 件为 D521 hook 产物，非人写变更」，否则 K3 按写集逐文件核验会把它记为越界（verifier §1.3 已如此登记，本席认同）。
**另 `[建议]`**：分支末端有 **4 个** `chore: bypass COMMITTED 登记 (auto hook, D521)` 提交（`70a6fbcd/81f868bf/0e558c12/e551dc83`），使提交面 8 提交中一半是 hook 噪音；若 CTO 要求「一提交一变更」的干净面，建议 squash——**不影响正确性**。

### 1.3 D949 —— 实际 5 件 vs 声明 4 件

```
$ git diff --name-only 6a714483..f828311c
.claude/bypass.log                                          ← 声明外（自动产物）
.claude/task-briefs/2026-09-25-D949-ownership-electron-tests.md ← 声明外（code-b 已报备，见下）
.github/CODEOWNERS                                          ← 声明内 2
docs/synova/coordination/ownership.yaml                     ← 声明内 1
task-state/D949.json                                        ← 声明内 4
$ 共 5 行 | 5 files changed, 107 insertions(+)
```
- 声明内的 **`tests/control-tower/check-ownership.test.sh` 未被改动** —— 这**符合** task-7 的明文授权（"若需随规则更新断言（**先跑再判**，无需要则不动）"）：我实测金测试在**不改该文件**的前提下 **58/58 绿**（§6.2），故"不动"是正确决策，**不是缺项**。
- 多出的 task-brief：code-b 在 brief 的 Q0 写明依据 —— **`commit-msg-check.sh` 的 D328 认领制硬阻断**（暂存文件归属 D935 与本卡声明 D949 不一致 → `synova-commit --check` exit 1），该 brief 是**门禁要求的认领凭据**，非新增交付面。
**判定 `[通过]`** ＋ `[建议]`：该第 5 件应在 `task-state/D949.json` 的 `write_set` 字段里**回落登记**（该字段现已列为 4 件，见 §8.3 同源问题）。

### 1.4 `[建议]` `task-state/D948.json` 不在切片 A 分支

```
$ git ls-tree e551dc83 task-state/D948.json      → （空）exit 0
$ git ls-tree origin/docs/d948-plan task-state/D948.json → 100644 blob 6d867648…
```
派单 §五 A 表把该文件列为 A 的写者=队长文件；实测它**不在 A 分支、而在队长分支 `docs/d948-plan`**。
⇒ 这正是我在 `REVIEW-PLAN.md §3.1` 提出的「**同一文件跨分支二次写，须择一**」的**落地形态**（择一 = 只写在队长分支），**处置正确**。但 CTO 收件闸若按"写集 ⊆ 分支变更"逐文件对账，会缺这一件 ⇒ **回执必须写明它落在 `docs/d948-plan`**（verifier §六-1 已登记，本席认同并提升为"回执必写项"）。

### 1.5 `[建议]` PR 预算

切片 A：产品/测试 7 件 + 治理 2 件 = **9 ≤ 12** ✅。D949：任务件 3 + 治理 2 = **5 ≤ 12** ✅。两 PR 单域（§2）。**预算无问题。**

---

## §2 域（自跑原始输出）

```
$ python scripts/control-tower/check-ownership.py .claude/bypass.log \
    ".claude/task-briefs/2026-09-25-D948-slice-a-identity-chain.md" \
    src/middleware/auth.ts src/middleware/rbac.ts src/routes/auth.ts \
    tests/middleware/auth.test.ts tests/middleware/rbac.test.ts \
    tests/routes/auth.test.ts tests/routes/d948-department-visibility.test.ts
·   domain-neutral  .claude/bypass.log
·   domain-neutral  .claude/task-briefs/2026-09-25-D948-slice-a-identity-chain.md
win  src/middleware/auth.ts
win  src/middleware/rbac.ts
win  src/routes/auth.ts
win  tests/middleware/auth.test.ts
win  tests/middleware/rbac.test.ts
win  tests/routes/auth.test.ts
win  tests/routes/d948-department-visibility.test.ts
✅ PASS 7 个文件同域: win（无归属 0，域判定豁免 2）      [exit=0]
```
```
$ python scripts/control-tower/check-ownership.py .claude/bypass.log \
    ".claude/task-briefs/2026-09-25-D949-ownership-electron-tests.md" \
    .github/CODEOWNERS docs/synova/coordination/ownership.yaml task-state/D949.json
·   domain-neutral  .claude/bypass.log
·   domain-neutral  .claude/task-briefs/2026-09-25-D949-ownership-electron-tests.md
·   domain-neutral  task-state/D949.json
mac  .github/CODEOWNERS
mac  docs/synova/coordination/ownership.yaml
✅ PASS 2 个文件同域: mac（无归属 0，域判定豁免 3）      [exit=0]
```
**判定 `[通过]`**：切片 A 单域 **win**、D949 单域 **mac**，均与声明一致；`无归属 0` 意味着**没有任何文件落 `**` 兜底**（说明两张表的显式规则已覆盖本轮全部路径）。

---

## §3 判据可证伪性（A1–A7 逐条 + 假绿/假红挑出）

> 前提：variant（改坏即红）由 **verifier 实跑**（`T-V-slice-a.md` §3，8 个变异体，全部"先断言落地 → 红 → `git checkout --` → porcelain 空 + 字节级复原"）。**我未施加任何变异体**（task-9 写集只许写本文件，改产品代码即越界）⇒ 我的判据复核 = **读断言 + 读 variant 归属逻辑 + 自己跑绿腿**；凡属"逻辑推断未实跑"者，我一律标注。

| 判据 | 断言载体（我核过的原文） | 改坏是否真红 | 判定 |
|---|---|---|---|
| **A1** | 真 HTTP `POST /api/auth/login` → `decodePayload(token)['department']`（`tests/routes/auth.test.ts:211-216`）+ `verifyJwtToken` 双证（`:218-220`）；**不等于** HTTP 200 | verifier **M6**（删 `routes/auth.ts` 的 `department:` 行）→ 2 红，其中正路径红而 HTTP 仍 200 ⇒ 证明裁判是 payload 不是状态码 | `[通过]` |
| A1 反回声 | ① 降级：记录 `''` ⇒ 载荷**无该键**（`:227`）；② 边界：body 塞 `department:'executive'` ⇒ 载荷仍无该键（`:232-238`） | M6 之外，这两条把「客户端回声」与「归一漏做」两条假绿路径都钉住 | `[通过]`（**这正是我在 `REVIEW-PLAN §FG-1` 要求的正解，已落地**） |
| **A2** | `rbac.test.ts` D948 组：`extractRbacContext({auth:{…department:'marketing'}})` → `department==='marketing'`（`:425-427`）**且**「**成对判据（防"恒真/恒假"）**」（`:439`） | verifier **M1**（`rbac.ts` 改回 `undefined`）→ 9 红 | `[通过]`。**我特别核了 A2 的"自证式判据"风险**（把 department 传进去再读出来）：若无成对判据，硬编码 `'marketing'` 的变异体能骗过它；实测 `:439` 的成对判据在场 ⇒ 硬编码/恒真会被打红 ⇒ **A2 不属假绿** |
| **A3** | 腿 1 真 HTTP `GET /api/workspaces/:id/context` → 200 + department；腿 2 链式探针 → `/mine` **含** subMkt **且含** parentId（防"恒空"） | 收窄型（删 `w.department===dept`）→ A3 红（verifier M1/§4.1 归属表）；A-recon `M9` 同型 | `[通过]` |
| **A4** | 腿 1 异部门 → **403 + body.error='access denied'**；腿 2 **不含** subMkt + **含** subSalesId/subSales + **反向负控**（marketing 的 /mine 亦不含 sales） | **过宽型**（`workspaces-api.ts:286` → `true`）= verifier **M2** → **A4 红（腿 2 + 反向负控）、A3 两条腿保持绿** ⇒ 归属干净 | `[通过]`（**我在 `REVIEW-PLAN §18.2-A` 的二次更正已被正确实现**：A4 的负向断言与 A3 的正面断言**分离到不同 describe**，才使"过宽型只打 A4"成立） |
| **A5** | 单元：`noDeptCtx{userId:'nodept-1'}` × `WS_MKT{owner:'admin-1'}` → access/modify 均 false；双空串 / 单侧空串；**对照**（同部门非属主 → true）；**A5-b** 属主本人 → true（`:381-388`）；HTTP 腿：`T_NODEPT` → 403 + `/mine` 无部门工作区（`:390-405`） | 去掉 `isSameDepartment` 非空收窄 → 边界红（verifier M1 组/PLAN 阶段）；**假红风险已消除**：`ws.owner !== ctx.userId`（owner='admin-1' vs userId='nodept-1'/'m-x'） | `[通过]`（**我在 `REVIEW-PLAN §I-4` 提的假红约束已落地**） |
| **A6** | 单元（判别主体）+ HTTP 互补（`:409-443`）；**留痕断言在场**：`tests/middleware/auth.test.ts:741-745`「仅 `x-synova-token=admin:marketing:u1` → 返回 null **且留痕 `AUTH_REJECTED`**」（`codesSince` 捕 logger） | verifier **M3/M3b** → rbac/auth 单元共 9 红（含"成对判据防恒真恒假"）；**HTTP 两条在 M3b 下仍绿** | `[通过]`（口径问题见 §9-Q1） |
| **A7** | 真 HTTP `POST /api/auth/refresh`，旧 token 放 **`Authorization: Bearer`**（非白名单 —— 我复核白名单只有精确 `/api/auth/login`、`/api/auth/register`，`auth.ts:107-108`）；断言新 token 载荷仍有部门 | verifier **M7** → 1 红 | `[通过]` |

### 3.8 `[阻塞]` 派单要求的「部门**大小写 / 空白差异**」边界**无任何判据**（唯一阻塞项）

**派单 §六「三路径夹具」原文要求**：
> 边界（空串部门、`undefined` 部门、**部门大小写或空白差异** → **一律 fail-closed，不得命中**）

**我的实测（穷举两个夹具文件的全部相关字面量）**：
```
$ git grep -in "toLowerCase|trim()|'Marketing'|' marketing'|'MARKETING'|whitespace|大小写|空白" \
      e551dc83 -- tests/routes/d948-department-visibility.test.ts tests/middleware/rbac.test.ts
（除普通 'marketing'/'sales' 字面量外，**大小写/空白变体零命中**）
```
- 现有 A5 边界只覆盖：`''`（双空）、单侧 `''`、`undefined`（ctx 侧）、以及 A5-b 的 owner 析取。**`'Marketing'` vs `'marketing'`、`' marketing'` vs `'marketing'` 两种变体都没有断言。**
- **链条可追**：派单 §六 要求 → `PLAN.md`（`0950d771`）§3 A5 行把边界收窄为「`''`、`undefined`、双空、仅一侧空」（删掉了"大小写或空白差异"）→ 实现继承该收窄 ⇒ **判据随卡面一起丢失，且无人登记该收窄**。
- **为什么危险**：`isSameDepartment`（`rbac.ts:231-237`）现在是**严格相等**，所以两种变体**当下**确实 fail-closed。但**没有任何判据锁住这个性质** ⇒ 若后续有人为支持工单加 `.trim().toLowerCase()` 归一化，**不会有一条测试变红**，而语义会同时被放宽（空白/大小写不再区分部门）。这正是"判据缺失 → 改坏不红"的假绿类。
- **该改哪一句（补断言即可，无需改产品代码）**：在 `tests/routes/d948-department-visibility.test.ts` 的 A5 describe 内追加：
  ```ts
  it('边界: 大小写差异不得命中', () => {
    expect(canAccessWorkspace(mkCtx('Marketing'), WS_MKT)).toBe(false);
    expect(canModifyWorkspace(mkCtx('Marketing'), { department: 'marketing', owner: 'admin-1' })).toBe(false);
  });
  it('边界: 首尾空白差异不得命中', () => {
    expect(canAccessWorkspace(mkCtx(' marketing'), WS_MKT)).toBe(false);
    expect(canAccessWorkspace(mkCtx('marketing'), { visibility: 'department', department: 'marketing ', owner: 'admin-1' })).toBe(false);
  });
  ```
  并在 `T-V-slice-a.md` §七（未证实项）与本回执中把「大小写/空白边界」从"未覆盖"改为"已补"。
  **同时建议 CTO 知悉 PLAN 对该边界的收窄**（§3.8 链条），以便判定是"补判据"还是"改派单"。

### 3.9 `[建议]` 变异体归属不构成单射（不影响 A3/A4 结论，但影响"每条判据各带 1 变异体"的表述强度）

verifier §4.1 已诚实登记：过宽型 **M2** 除打红 A4，还**顺带打红 A5 的 `/mine` 腿与 A6 的 `/mine` 腿**（因为二者也含负向断言）。
**我的补强判定**：这说明 A3/A4/A5/A6 在 `/mine` 过滤表达式上**共享同一个观测面**，因此**它们不是彼此独立的判据**；"A3 绿/A4 红"的干净归属**只对 A3/A4 这一对**成立。
⇒ `[建议]`：回执不要写成"A1–A7 各带 1 个 1:1 变异体"；应写成"A3/A4 为成对正负判据（收窄型打 A3、过宽型打 A4）；A5/A6 的 `/mine` 腿与 A4 共享过滤面，故 M2 会连带打红——已登记为预期串扰"。

### 3.10 `[建议]` `login` 响应体 `payload` 未含 `department`

`routes/auth.ts` 的 diff 只改签发载荷，响应体 `payload: { userId, role, orgId, expiresAt, jti }` 未加 `department`。
- 对 A1 **无影响**（A1 解 token，不看响应体）✅；
- 但**切片 B 的 `auth-session.ts` 若打算从响应体读部门**，会拿到 `undefined` ⇒ 只能解 token 或再请求。
⇒ `[建议]`：在切片 B 的接口契约里明确「部门只从 token 载荷取」，或补 `payload.department`（**属产品面决策，本席不擅自要求**）。

---

## §4 A6 拒绝分支是否被删 → `[通过]`

```
$ git grep -n "self_reported_token_header_ignored|x-synova-token" e551dc83 -- src/middleware/auth.ts src/middleware/rbac.ts
e551dc83:src/middleware/auth.ts:500: * 已删除 `x-synova-token` 自报分支——该 header 不经验签即可自封 `role`
e551dc83:src/middleware/auth.ts:524:  // D947: 原 x-synova-token 自报分支已删除——无验签的 `role:orgId:userId`
e551dc83:src/middleware/auth.ts:526:  if (req.headers?.['x-synova-token'] !== undefined) {
e551dc83:src/middleware/auth.ts:528:      { code: 'AUTH_REJECTED', reason: 'self_reported_token_header_ignored' },
e551dc83:src/middleware/auth.ts:529:      '安全判据: 被拒绝 — 忽略未验签的 x-synova-token 自报凭据（fail-closed）',
e551dc83:src/middleware/rbac.ts:115: * 本函数**不再读取** `x-synova-token` / `query.token` 等自报凭据——此类字符串
```
HEAD 版原文（`:526-534`）：
```ts
526:  if (req.headers?.['x-synova-token'] !== undefined) {
527:    log.warn(
528:      { code: 'AUTH_REJECTED', reason: 'self_reported_token_header_ignored' },
529:      '安全判据: 被拒绝 — 忽略未验签的 x-synova-token 自报凭据（fail-closed）',
530:    );
531:  }
532:
533:  return null;
534: }
```
**判定 `[通过]`**：① 拒绝分支**物理在场**；② `git diff ef5c8caa..e551dc83 -- src/middleware/auth.ts` 在该区域**零删除行**（该文件新增 23 行全在 `JwtPayload`/`AuthRequestContext`/`extractAuthFromRequest` 三处，未触碰 `:515-534`）⇒ **不存在"为凑 grep 而删拒绝逻辑"**；③ 留痕断言在单元级实跑为绿（`auth.test.ts:741-745`），且 verifier **M3** 显示"复活自报"会打红该用例（含该留痕用例）⇒ 拒绝逻辑**被判据守护**，不是"接线未被执行"。

---

## §5 N1 / FG-6

### 5.1 `[通过]` 「先覆写再断言」在 **4 个**涉身份夹具中全部成立（我逐文件核）

| 夹具 | 证据（原文行） |
|---|---|
| `tests/routes/d948-department-visibility.test.ts` | `:198-204` 保存→覆写 `JWT_SECRET`/`DEV_MODE='false'`/`SYNOVA_ORG_ID`；`:206-207` **再**断言；`:266-272` `afterAll` 复原 |
| `tests/routes/auth.test.ts` | `savedEnv.JWT_SECRET/DEV_MODE` → 赋值 `'d948-auth-test-secret-0123456789'`/`'false'` → 断言两条（先设后断）；另有 `delete process.env.JWT_SECRET` 的子用例**带 prev 复原**（三态测试用） |
| `tests/middleware/auth.test.ts` | `:58-61` 形态：赋值 + 两条断言（**D947 既有模板**，队长亲跑 34/34 绿） |
| `tests/middleware/rbac.test.ts` | 同上：赋值 `'d947-test-secret-0123456789'`/`'false'` + 两条断言 |

⇒ **无一处断言 ambient env**；`vitest.config.ts:58-63` 的全局 `DEV_MODE='true'` 被就地覆写。**N1 要求满足。**

### 5.2 `[通过]` FG-6 判别器在场

`d948-department-visibility.test.ts` FG-6 组（`:452-476`）：① 无效 Bearer → 401（**dev-admin 姿态下会 200/admin**）；② 无 Authorization → 401；③ `readAuth` 的 `sub !== 'dev-admin'`、`jti !== 'dev-mode-no-jwt'`（`:362` 逃生口字面量）；④ 环境自证 `DEV_MODE==='false'` && `JWT_SECRET` ≥16。
另：夹具还有**独立的空转守卫**——`beforeAll` 自证 `pickWorkspace(s1.body).owner === 'admin-1'`（`:262`），使"环境滑向 dev-admin"会**整文件红/跳过而非静默绿**（verifier M4 实测 **18 skipped + exit 1**，非静默）✅。

### 5.3 `[建议]` FG-6 判别力的**精确边界**（verifier 已登记，我复核后收紧措辞）

verifier §4.3 实测：**M5b**（只在分支体内给未验签请求注入 dev-admin + `next()`）使 FG-6 两条 401 断言**变红**，但第三条 `验签身份 ≠ dev-admin` **保持绿**（它只覆盖已验签路径）。
⇒ **正确表述应为**：FG-6 能抓「**未验签请求被放行**」，**不能单独抓**「**已验签请求被替换成 dev-admin**」（后者由 `:262` 的 owner 自证 + M4 的整文件红覆盖，且**非静默**）。verifier 已在 §4.3 写明此边界 ⇒ 本席**认同其诚实度**，仅建议把该边界同步进回执，避免被读成"FG-6 全覆盖 dev 姿态"。

---

## §6 D949 专项（我自己重跑）

### 6.1 `[通过]` CODEOWNERS 与 `--emit-codeowners` **逐字节一致** —— 且我**先踩了假漂移坑**

> ⚠️ **方法自误（必须写入，供 K3 复核我的口径）**：我第一次用 PowerShell `>` 重定向落盘 emit 输出，得到 `emit=6326 bytes vs tracked=3420 bytes` 的"**漂移**"——**这是我自己的方法误差**：PowerShell 的 `>` 默认写 UTF-16LE，字节数近乎翻倍。队长预告的坑（"必须用 bash 的 `>`"）**被我自己复现了一次**。

**改用字节保真口径**（Python 捕获 stdout 原始字节，绕开任何 shell 重定向）：
```
$ python -c "import subprocess,pathlib,hashlib
r=subprocess.run(['python','scripts/control-tower/check-ownership.py','--emit-codeowners'],capture_output=True)
out=r.stdout; tracked=pathlib.Path('.github/CODEOWNERS').read_bytes()
print(len(out), hashlib.sha256(out).hexdigest()[:16]); print(len(tracked), hashlib.sha256(tracked).hexdigest()[:16]); print('BYTE-IDENTICAL:', out==tracked)"

emit   bytes=3420 sha256=3d0e07a5c019876f
tracked bytes=3420 sha256=3d0e07a5c019876f
BYTE-IDENTICAL: True
```
⇒ **`[通过]`**：`.github/CODEOWNERS` 与生成器输出**逐字节相同**（3420 bytes / 同一 SHA256）。**队长与 verifier 的声称成立**，我独立复现。

### 6.2 `[通过]` 治理金测试 **58/58 绿**（原始输出）

```
$ $env:PATH='C:\Program Files\Git\usr\bin;C:\Program Files\Git\bin;'+$env:PATH
$ bash tests/control-tower/check-ownership.test.sh *> /tmp/d949-gate.txt ; echo $LASTEXITCODE
0
  ── 9. 生产接线（铁律 0-2 WIRE CHECK）──
    ✅ 接线: CODEOWNERS 头声明由 check-ownership.py 生成（产物消费成立）
  ═══════════════════════════════════════════════════════════
    ✅ 全部通过: 58 项
  ═══════════════════════════════════════════════════════════
```
⇒ **58 项全绿、EXIT=0**；**无需**改 `tests/control-tower/check-ownership.test.sh`（该文件未改动是正确决策）。

### 6.3 `[通过]` 切片 B 8 文件 **PASS mac**（D949 的放行判据）+ 连带改判

```
$ python scripts/control-tower/check-ownership.py electron-renderer/src/stores/auth-session.ts \
  electron-renderer/src/stores/ga-collab.ts electron-renderer/src/components/RightPanel.tsx \
  electron-renderer/src/components/LoginPanel.tsx electron-renderer/src/lib/api.ts \
  electron-renderer/src/stores/app-store.ts tests/electron/d948-identity-chain.test.ts tests/ga-collab-logic.test.ts
mac ×8
✅ PASS 8 个文件同域: mac（无归属 0，域判定豁免 0）      [exit=0]

$ python scripts/control-tower/check-ownership.py tests/electron/dual-guide-packaging-guard.test.ts \
    tests/electron/right-panel-report-sentinel.test.ts tests/ga-collab-ui.test.ts tests/ga-collab-logic.test.ts
mac ×4  ✅ PASS 4 个文件同域: mac                        [exit=0]
```
⇒ **D949 真实放行切片 B**（含我 `REVIEW-PLAN §1.4` 指出的**根级 `tests/ga-collab-logic.test.ts`**，由 `tests/ga-collab-*.test.ts` glob 覆盖 ✅）；13 件连带改判抽查 4 件全 mac ✅。

### 6.4 `[通过]` 规则**落点顺序**正确（我核了 `**` 兜底的行号）

```
$ Select-String -Path docs/synova/coordination/ownership.yaml -Pattern '"\*\*"'
L35: - glob: "**"                     ← 兜底
$ ... -Pattern "tests/electron/\*\*|tests/ga-collab-\*"
L184: - glob: "tests/electron/**"     ← 在 L35 之后 ✅
L191: - glob: "tests/ga-collab-*.test.ts"
```
表语义"按顺序求值，**最后匹配者胜出**" ⇒ 新规则必须在兜底之后才生效；实测 L184/L191 > L35 ✅，且**6.3 的实测结果反证生效**（否则仍判 win）。

### 6.5 `[通过]` D949 的「改坏即红」我**独立复现**（用 /tmp yaml 副本，未触碰任何仓内文件）

```powershell
# 取 ownership.yaml → 文本级删掉两条 D949 规则 → 落 /tmp/d949-mutant.yaml
orig_len=9743 mut_len=8731 ; 变体内两条 glob 命中数 = 0
$ python scripts/control-tower/check-ownership.py --yaml /tmp/d949-mutant.yaml <上列 8 文件>
mac  electron-renderer/src/stores/app-store.ts
win  tests/electron/d948-identity-chain.test.ts
win  tests/ga-collab-logic.test.ts
❌ FAIL 跨域: 变更落在 2 个域 ['mac', 'win'] —— 单个 PR 只许一个域
[exit=1]
```
⇒ **判据真读数据、非 grep 型静态判据**（删规则即红，`--yaml` 沙箱不污染仓库）。`task-state/D949.json` 的 `evidence.discriminative_fixture` 声称属实 ✅。

---

## §7 红线

### 7.1 `[通过]` `--no-verify` 迹象：零（`bypass.log` 新增行原文）

```
$ git diff ef5c8caa..e551dc83 -- .claude/bypass.log | Select-String '^\+[^+]'
+2026-09-25T02:20:43+08:00 | COMMITTED | pre-commit PASS (hook 层登记) | HASH=8421d416…
+2026-09-25T02:26:50+08:00 | COMMITTED | pre-commit PASS (hook 层登记) | HASH=85aaa132…
+2026-09-25T02:35:21+08:00 | COMMITTED | pre-commit PASS (hook 层登记) | HASH=e959656c…
+2026-09-25T02:45:45+08:00 | COMMITTED | pre-commit PASS (hook 层登记) | HASH=091cb329…

$ git diff 6a714483..f828311c -- .claude/bypass.log | Select-String '^\+[^+]'
+2026-09-25T02:13:53+08:00 | COMMITTED | pre-commit PASS (hook 层登记) | HASH=ee6b0c8d…
```
5 行**全部**是 `COMMITTED | pre-commit PASS`，**无一行 `detected-bypass`** ✅。

### 7.2 `[通过]`（并**订正 verifier 的措辞**）`detected-bypass` 计数**不变量**

```
$ git show <ref>:.claude/bypass.log | Select-String "detected-bypass" | Measure → 计数
ef5c8caa (切片 A base)   : 19
e551dc83 (切片 A HEAD)   : 19
f828311c (D949 HEAD)     : 19
```
⇒ **两个分支各新增 0 条 `detected-bypass`**（计数跨 base/HEAD 恒为 19 = 均系基线既有）。
**订正**：verifier §1.3 的措辞「**无 `detected-bypass` 行**」若被读成"**整个文件**没有绕过记录"，**不准确**——文件里**有 19 条历史 `detected-bypass`**，只是**均非本卡引入**。正确表述：**"本轮新增行零 `detected-bypass`；全文件 19 条为基线既有（base 与 HEAD 计数相同）"**。⇒ 结论不变（无绕过），但**口径须如此写**，否则 K3 抽查该文件会看到 19 条而怀疑。

### 7.3 `[通过]` `scripts/**` / `scripts/audit/**` 零触碰

```
$ git diff --name-only ef5c8caa..e551dc83 -- scripts/     → （空，0 件）
$ git diff --name-only 6a714483..f828311c -- scripts/     → （空，0 件）
```
⇒ 两支均**未触碰** `scripts/**`（含 `scripts/audit/**` K3 红线、`scripts/control-tower/**`）。D949 是**改数据表 + 重跑生成器**，没改校验脚本 —— **正是正确做法**（改脚本才能过测试 = 自证式作弊）。

### 7.4 `[通过]` 类型安全：新增行 `as any` / `as never` / `as unknown as` = **0**

```
$ git diff ef5c8caa..e551dc83 -- src/ tests/ | Select-String "as any|as never|as unknown as"
+ * 铁律 38: 零 `as any` / `as never` / `as unknown as`。
+ * 铁律 38：零 `as any` / `as never` / `as unknown as`（收窄一律单步 `as` + 内联类型）。
+/** 从响应体读工作区（内联类型断言，零 as any / as never / as unknown as） */
+ * 路由表不在 express 的公开类型里 ⇒ 先落到 `unknown` 变量再**单步** `as`（不用 `as unknown as`，铁律 38）。
```
⇒ **4 处命中全为注释/文档文字**，**代码零违规** ✅（我按行核过；我的正则先过度匹配了注释，故此处逐行列出以免误读）。
**附带闭环（verifier §六-6 的担心）**：`tests/middleware/rbac.test.ts:162/:182` 有**存量** `} as any)`（base 即存在、diff 内**零新增**）。我实测 `scripts/pre-commit-check.sh` 的组 1 自陈口径为「**1a. as any 零容忍 — 只拦本次变更新增的 as any（存量独立治理）**」⇒ **存量不拦、不构成 CI 风险**。⇒ verifier 的"未实测门禁扫描粒度"由**门禁源码自陈**闭环，**[建议]** 在回执中注明该口径。

### 7.5 `[通过]` `git stash` / force push：零迹象
两个工作树收尾 `git status --porcelain` 均**空**（我复核 `.synova-wt-d948-server` 与 `.synova-wt-d949-ownership`：无残留改动、无 stash 痕迹）；verifier 与 code-b 均自陈"未 stash/未 force push/未切分支"；分支 tip 与 `ls-remote` 一致（§0）⇒ **无强推改写痕迹**（远端 hash 与本地 HEAD 相同，非"本地领先被强推覆盖"形态）。

---

## §8 回执基准

### 8.1 `[通过]` 切片 A：基准写 `ef5c8caa`
verifier `T-V-slice-a.md` §1.2 原文标题即 `` `git diff --stat ef5c8caa..HEAD` ``，输出 9 文件 / 1102 insertions ✅；我自跑 `git diff --stat ef5c8caa..e551dc83` **逐行一致** ✅。

### 8.2 `[通过]` D949：基准写 `origin/main`
`task-state/D949.json` 字段 `"base": "origin/main 6a714483"` ✅；我实测 `origin/main = 6a7144839d5deda92166ac4541c205fed78b7e1e` 且为 `f828311c` 的祖先 ✅；`git diff --stat 6a714483..f828311c` = 5 files / 107 insertions ✅。

### 8.3 `[建议]` 但**没有一份 D949 回执落仓**，且 `write_set` 字段与实际不符
```
$ git grep -ln "D949" origin/main -- docs/synova/product-lines   → exit 1（零命中）
```
- D949 的证据目前**只存在于** `task-state/D949.json` 的 `evidence` 字段 + brief，**没有独立回执文档**落 `docs/synova/product-lines/**`。按 M6「收尾三件必须提交进仓库并给路径」，若 CTO 收件闸要求"回执可检"，这里会缺。
- 且 `task-state/D949.json` 的 `write_set` 数组列了 **4 件**（含 brief），而 task-7 的声明是另 4 件（含 `tests/control-tower/check-ownership.test.sh`）⇒ **两处 write_set 表述不一致**。
⇒ `[建议]`：在 D949 侧补一段简短回执（或把 `task-state/D949.json.evidence` 提升为随卡证据文件），并把口径统一为「**实际变更 5 件 = 3 任务件 + brief（D328 认领凭据）+ bypass.log（hook 产物）；`check-ownership.test.sh` 经实测无需改动**」。

### 8.4 `[建议]` 本地 `main` 落后 `origin/main` **83** 提交（且仍在扩大）
```
$ git rev-list --left-right --count origin/main...main
83	0                       ← origin/main 有 83 个提交不在本地 main；本地 main 无独有提交
（`REVIEW-PLAN` 阶段同口径实测为 `69  0`；`origin/main` 已从 11458279 推进到 6a714483）
```
本轮两支**均未误用本地 `main`** ✅（§8.1/§8.2）。但该环境事实仍成立，任何后续回执若写 `git diff --stat main` 都会掺入 **83 个无关提交** ⇒ **[建议]** 沿用 `REVIEW-PLAN §8.3` 的"基准必写明"纪律（切片 A=`ef5c8caa`；其余=`origin/main`）。

### 8.5 `[阻塞·M6]` 自验件 `T-V-slice-a.md` **尚未入库**（复核时点实测）

```
$ git status --porcelain      （在 .synova-wt-d948-lead）
?? docs/synova/product-lines/evidence/D948-20260924/REVIEW-EXEC.md     ← 本件（我即将提交）
?? docs/synova/product-lines/evidence/D948-20260924/T-V-slice-a.md     ← verifier 的自验件，untracked
```
⇒ **verifier 的独立自验报告未 commit、未 push**。本件 §3/§5/§9 大量引用它（8 个变异体原始输出、A4/A5/N1/FG-6 专项判定）——**若 CTO 收件闸按仓库路径取件，该引用不可读**，等于"自验存在但无物理凭据"。
**该改哪一句 / 谁来做**：由**队长**把 `T-V-slice-a.md`（以及本件）一并 commit + push 到 `docs/d948-plan`（verifier 按纪律不自 commit，正确；但**收尾人必须补上**）。M6 要求「收尾三件必须提交进仓库并给路径」——当前 **diff/自验结论/遗留清单 中"自验结论"这一件缺物理落点**。

---

## §9 答 lead 六个重点问题（逐条表态）

**Q1（A6 口径）**：**我认同 verifier 的口径，但要把它的结论从"HTTP 结构性无判别力"收紧为"对『自报作为兜底复活』无判别力；对『自报优先/覆盖验签身份』有判别力"。**
- 我核到的实据：`M3b`（在 `rbac.ts:133` 前插兜底分支、**保留 `req.auth` 优先**）⇒ rbac 单元 9 红、`d948-*.test.ts` 的 A6 两条 HTTP 断言全绿 ⇒ 对**兜底类**确实构造性无判别力，verifier 的证明成立。
- **但**夹具里还有一条更强的构造：`d948-department-visibility.test.ts:425-443`「**有效 Bearer(staff, 无部门) + 同请求自报 `admin:marketing:u1`**」→ 断言 `auth.role==='staff'`、`auth.department===undefined`、`readRbac(req).role==='staff'`。若实现把自报头**优先**（或让它覆盖/合并进 `req.auth`/`req.rbac`），该用例**必红**。verifier 只测了兜底类（M3b），故其"构造性不可能"**过宽**。
  - **诚实标注**：该结论是**逻辑推断，我未实跑**（施加变异体超出我的写集；属 verifier 的活）。**建议**加一个变异体 **M3c（自报优先：把自报解析插到 `if (req.auth)` 之前）**，预期 **`d948-*.test.ts:425-443` 红**——一旦实跑为红，A6 就拥有**单元（兜底类）+ HTTP（优先类）两个互补判别面**，K3 即便按派单字面（HTTP + 留痕）核验也站得住。
- **对"K3 会不会判 A6 不成立"的直接回答**：按派单字面「带 `x-synova-token` 且无 Bearer → 角色≠admin（且留痕）」，HTTP 面拿到的是 **401 + `code:'UNAUTHORIZED'`**，**"role≠admin"是空真**（没有 role 可言），且**留痕是 `missing_or_invalid_authorization_header`（另一个 reason），不是 `self_reported_token_header_ignored`** ⇒ 若 K3 严格按"留痕必须是自报头那条"核验，**有被判不成立的真实风险**。**故本席支持 CTO 必须就此出一句裁定**，并在回执中把 A6 的证据组织为：「判别主体=单元级 M3/M3b（红）＋ 留痕=单元级 `codesSince` 含 `AUTH_REJECTED`（绿且可红）＋ HTTP 面=互补（401 + `:425-443` 的优先类判别）」。
- **另**：`M3b` 下 A6 的 HTTP 腿全绿这一点，**必须写进回执的"已登记偏差"**，而不是留作读者自行发现。

**Q2（A1–A7 可证伪性）**：见 §3 全套。**仍然存在问题的只有 1 条硬缺口（§3.8 大小写/空白边界无判据）**；其余我特别核过的三条"历史假绿/假红"**均已闭环**：A1 的回声与归一（`:227/:232-238`）、A3 的 owner/admin 析取短路（改成"负面断言归 A4 + 反向负控"，M2 实证 A3 绿/A4 红）、A4 的过宽型（M2 实跑）。
⇒ 我**未能**再找到第二条与 §3.8 同级的"改坏不红"缺口（我穷举了：4 个夹具文件的全部断言、8 个变异体的覆盖点、白名单端点、empty/undefined/case/whitespace 四类边界、payload-vs-200、grep-型静态判据）。

**Q3（写集对账 + `bypass.log` 判定）**：`bypass.log` **可接受**（§1.2 三依据）；切片 A 实际 9 件（声明 8 + 自动产物 1）；D949 实际 5 件（声明 3 实变更 + brief + 自动产物），`check-ownership.test.sh` **未改动属正确**（先跑后判，58/58 已绿）。**两处 `[建议]`**：回执把自动产物显式标注；D949 的 `write_set` 字段与实际对齐。

**Q4（A6 拒绝分支是否被删）**：**未被删**（§4：`:526-531` 在场 + 该区零删除行 + 留痕有判据守护）⇒ **不阻塞**。

**Q5（红线 + `detected-bypass`）**：零 `--no-verify`（5 新增行全为 PASS 登记）；**`detected-bypass` 计数 base/HEAD 恒为 19 ⇒ 零新增**（**但要订正 verifier "无 detected-bypass 行"的措辞**，§7.2）；零 `scripts/**` 触碰；新增 `as any` = 0；两工作树 clean。⇒ `[通过]`。

**Q6（回执基准）**：两支**均写明基准且无误用本地 `main`**（切片 A=`ef5c8caa`、D949=`origin/main 6a714483`）✅；**建议**补 D949 的落仓回执文档（§8.3）。

---

## §10 我未能覆盖 / 未证实的复核面（诚实登记）

1. **未施加任何变异体**：task-9 写集只允许写本文件 ⇒ 所有「改坏即红」结论均基于 **verifier 的实跑原始输出 + 我的归属逻辑复核**，**非我自跑**。凡我做的逻辑推断（§9-Q1 的 `:425-443` 优先类判别力）已显式标注。
2. **未跑全量套件 / 13 组门禁 / CI**：按派单"只跑靶向"。我实跑范围 = 切片 A 靶向 **4 文件 / 141 passed**（§0）+ D949 金测试 **58/58**（§6.2）+ 域判定 3 组 + mutant yaml 反证。**`vitest run` 全量与 CI 严格门禁结果未证实**。
3. **未独立复现 verifier 的 8 个变异体**（含 M4/M5b 的 18 skipped 与 3 红）：我核其**表述自洽性**与**归属逻辑**，未重跑。
4. **切片 B（桌面端）完全未验**：`electron-renderer/**` 实现、`vitest.config.ts` include 上限、`tests/electron/**` 13 件全量改判（我只抽查 4 件）、B1–B4 判据 —— 均**不在本轮范围**。
5. **`/mine` 的真 HTTP 正路径依然不可达**（D947 L-28 已裁"本卡不修"）：我复现了"恒 404"的**静态成因**与 A 分支夹具的**探针形态**，但**修 ordering 后的真 HTTP 行为未验**（属另立卡）。
6. **用户可见结果未验**：切片 A 只到服务端判据层；"打开部门工作区看到本部门内容"仍受 `REVIEW-PLAN §2` 的 **W1/W2/W3** 阻断 ⇒ 回执必须沿用 **「功能回退（部分恢复，未闭环）」** 措辞（**不得**写"已知限制"或"部门可见性已可用"）。
7. **`degraded:true` 的消费方链路未验**（`tests/routes/auth.test.ts` 有 `JWT_SECRET` 不可用 → 500+degraded 用例且绿，但调用方是否消费未跟踪）。
8. **`department` 未进 login 响应 `payload`**（§3.10）：属产品面决策，我未判其是否必要。

---

## §11 我的方法自误（两次，均已更正 —— 供 K3 复核我的口径）

| # | 现象 | 真因 | 更正 |
|---|---|---|---|
| 1 | 首轮 `Measure-Object -Line` 报 `auth.test.ts` = **44 行**（据此怀疑 PLAN P20） | PowerShell `Measure-Object -Line` **漏算空行为 0** | 真值 **50 行**（`ReadAllText` + `\n` 计数）；PLAN/派单**均正确**。行数一律用 `ReadAllText`。**已在 `REVIEW-PLAN.md §11` 撤回** |
| 2 | 本轮 PowerShell `>` 落盘 emit → `emit=6326B vs tracked=3420B`，看似 CODEOWNERS **漂移** | PowerShell `>` 默认写 **UTF-16LE**，字节数近乎翻倍 | 改用 **Python 捕获 stdout 原始字节** → `BYTE-IDENTICAL: True`（3420B / 同 SHA256）。**队长预告的坑被我自己踩了一次**；结论已按字节保真口径给出 |

**教训固化给全队**：本仓库任何"**字节级/行数级**"判据，**一律**用 (a) Python/`bash` 原生重定向 + `ReadAllBytes`/`cmp`，或 (b) `ReadAllText` + 显式换行计数；**禁用** PowerShell `>`（编码）与 `Measure-Object -Line`（空行）。

---

**自验结论**：切片 A 与 D949 的**实现正确性、域归属、红线、D949 三项验收（CODEOWNERS 逐字节 / 58-58 金测试 / 切片 B 8 文件 PASS mac）** 我独立复现**一致**；判据层**仅 1 条 `[阻塞]`**（派单 §六 要求的「部门大小写/空白差异一律 fail-closed」**无判据**，补 4 条断言即可，不涉产品代码）。
**本件为「可提请独立审计」**——但**前提是**：① §3.8 的边界断言补上（或 CTO 明确裁定 T-V 口径）；② A6 口径由 CTO 出一句裁定并在回执中按 §9-Q1 组织证据；③ `bypass.log`/`task-brief` 等自动与报备产物在回执中显式标注。
**不判"通过"**；是否进 CTO 收件闸、是否**退回**，判定权归 **CTO 收件闸 + K3 终审**。本件**未触碰任何产品代码、未施加变异体、未 commit 本文件之外的内容**。
