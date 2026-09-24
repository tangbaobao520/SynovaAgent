# D949 派单件 — 表缺口收口：渲染层测试归属改判 mac（P0-a+）

> 出件：Win-Codex-CTO ｜ 2026-09-25 ｜ 号段 `D947–D951` 内自取 D949
> 归属基线：`docs/synova/coordination/ownership.yaml`（本卡即改它）
> 来源：D948 PLAN §6 P0 影响面矩阵 + CTO 2026-09-25 裁定（P0-a+，由 P0-a 扩为 glob）
> **本卡是 D948 切片 B 的开工前置**。域：**mac**（Win 小队代行，创始人 2026-09-24 授权「两个都在 win 侧执行」）

---

## 一、为什么必须改表（不修则 D948 切片 B 物理过不去）

```
$ python scripts/control-tower/check-ownership.py tests/electron/dual-guide-packaging-guard.test.ts tests/ga-collab-logic.test.ts tests/ga-collab-ui.test.ts electron-renderer/src/lib/api.ts
win  tests/electron/dual-guide-packaging-guard.test.ts
win  tests/ga-collab-logic.test.ts
win  tests/ga-collab-ui.test.ts
mac  electron-renderer/src/lib/api.ts
❌ FAIL 跨域: 变更落在 2 个域 ['mac', 'win'] —— 单个 PR 只许一个域
```

根因两件叠加：① `ownership.yaml` 无 `tests/electron/**` 规则 → 落 `**` 兜底判 win；② 根 `vitest.config.ts:28` `include: ['./tests/**/*.test.ts', ...]` ⇒ **渲染层测试只能住在 `tests/` 下**。

**这不是个案**：实测 ≥3 件根级/`tests/electron/` 测试的 import 主体是 `../electron-renderer/src/**` 却判 win：

```
$ 三件 import 主体（ref=ef5c8caa）
tests/ga-collab-logic.test.ts   → ../electron-renderer/src/stores/ga-collab
tests/ga-collab-ui.test.ts      → ../electron-renderer/src/components/ga-detail-sections
tests/llm-config-frontend.test.ts → ../electron-renderer/src/stores/llm-config + components/{LlmSetupCard,WelcomeScreen}
```

→ 按 CTO 三原则第②条「**测试跟随被测模块**」，被测主体 `electron/**`、`electron-renderer/**` 均 mac ⇒ 其测试归 mac。

---

## 二、写集（单域 mac，3 件 + 卡片豁免）

| 文件 | 动作 | 写者 |
|---|---|---|
| `docs/synova/coordination/ownership.yaml` | 改：新增两条规则（见 §三） | code-a |
| `.github/CODEOWNERS` | 改：**只能由 `--emit-codeowners` 重生成**，禁手改 | code-a |
| `tests/control-tower/check-ownership.test.sh` | 改：补新规则的判别性断言 | code-a |
| `task-state/D949.json` | 卡片 | 队长 |

**不做**：不改 `scripts/control-tower/check-ownership.py`（D733 交付物，只读复用）；不改 `tests/control-tower/check-pr-budget.sh`；不碰 `scripts/**`、`src/**`、`electron-renderer/**`。

---

## 三、规则原文（必须逐字落地，位置在 `**` 兜底行**之后**——表语义「最后匹配者胜出」）

```yaml
  - glob: "tests/electron/**"
    owner: "mac"
    source: "D949：测试跟随被测模块（electron/** 与 electron-renderer/** 均 mac）"
  - glob: "tests/ga-collab-*.test.ts"
    owner: "mac"
    source: "D949：同上（ga-collab-logic/ui 两件被测主体均为 electron-renderer/src/stores|components）"
```

**为什么写成 glob 而不是列单文件**：只列 `ga-collab-logic` 那一件，下一张桌面卡撞 `ga-collab-ui` 时同一堵墙会再出现一次（本卡即为 D948 PLAN 报的 P0-a 原案不足的直接教训）。

---

## 四、完成标准（可执行判据）

| # | 判据 | 命令 / 反例 |
|---|---|---|
| D1 | `tests/electron/**` 13 件全判 mac | `python scripts/control-tower/check-ownership.py $(git ls-tree --name-only <ref> tests/electron/)` → 逐条 `mac` |
| D2 | `tests/ga-collab-logic.test.ts` + `tests/ga-collab-ui.test.ts` 判 mac | 同上，逐条 |
| D3 | **D948 切片 B 候选 8 文件同域 mac** | `... check-ownership.py <B 8 文件>` → `✅ PASS 8 个文件同域: mac`（这是本卡的验收锚点） |
| D4 | CODEOWNERS 与生成器**逐字节**一致 | `python scripts/control-tower/check-ownership.py --emit-codeowners \| diff - .github/CODEOWNERS` → 零输出 |
| D5 | 治理金测试不破 | `bash tests/control-tower/check-ownership.test.sh` → 项数 ≥ base 基线 **58**，EXIT=0（跑 bash 须自带 PATH：`$env:PATH='C:\Program Files\Git\usr\bin;C:\Program Files\Git\bin;'+$env:PATH`） |
| D6 | **反向验证（判别性）**：删掉 §三 两条规则 → D1/D2/D3 **变红** | 删后重跑必须 `FAIL 跨域`，随即还原；给原始输出 |
| D7 | 既有归属零变更 | 除新增两条规则外，`ownership.yaml` 其余行 **逐字节不动**；给 `git diff --stat` |

---

## 五、执行形态（硬字段）

- Agent Teams 组队；队长**不下场写码**；1 独立自验 + 1 独立复核（自验不得由编码兼任）
- 单域 mac 单 PR；≤12 文件；重型验证串行 ≤1
- 工作目录钉死本卡 worktree；禁 `rm -rf`；临时产物只落 `/tmp`
- 回执含**团队成员运行记录**（成员名 · 运行状态 · token · 共享任务 id 与状态）

---

## 六、回执格式

1. D1–D7 逐条原始输出（含 D6 反向验证的红→还原）
2. 团队成员运行记录
3. `git diff --stat` + `ls-remote`（**基准写 `origin/main` 合后值，禁用本地 main**）
4. 未清项（诚实登记）
5. 派单件指纹对账（三条坐标 × 三方值）

---

## 七、红线与退回

- 禁 `--no-verify` / `git stash` / force push；不碰 `scripts/audit/**`
- 单 PR 单域：本卡只许动 mac 文件（含 `task-state/**` 豁免）
- 执行方**不判通过**；终审归 K3
- **本卡未合，D948 切片 B 不得开工**（这是硬依赖，不是建议）

---

## 八、未清项预登记

| # | 项 | 处置 |
|---|---|---|
| 1 | 渲染层测试**通则**（被测主体在 `electron/**`/`electron-renderer/**` 的测试归 mac）尚未成文；本卡只覆盖 `tests/electron/**` + `tests/ga-collab-*.test.ts` | `tests/llm-config-frontend.test.ts` 等仍判 win → 另立治理卡 |
| 2 | `dual-guide-packaging-guard.test.ts`（D716 Win 建）连带改判 mac | 已核其头注自陈「对 `electron/`、`electron-renderer/`、`build-synova.cjs` 只读断言（Mac DSH 域，零写入）」⇒ 改判是**纠正旧误标**，CTO 已批准 |
| 3 | `tests/control-tower/ownership.test.sh` 被引用但文件不存在 | 非本卡引入，登记备查 |
