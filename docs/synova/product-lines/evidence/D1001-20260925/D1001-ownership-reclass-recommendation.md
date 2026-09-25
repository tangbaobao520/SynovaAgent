# D1001 建议件 — 渲染层测试归属改判（tests/electron/** + tests/ga-collab-*.test.ts → mac）

> **性质声明（最重要）**：本件是「**改判建议 + 证据**」，**不是改表**。
> `docs/synova/coordination/ownership.yaml` 是 **Mac-CTO 单写者**（D1000 派单件 §〇之二 三，2026-09-25），**Win 方不得直接改**。
> 本件**不含任何对表本体的提交**；表改动由 **Mac-CTO** 按本建议执行。
> 出件：`synova-squad-lead`（Win 侧小队队长）｜ 2026-09-25 ｜ 载体：分支 `docs/d948-plan`（域豁免 `docs/synova/product-lines/evidence/**`）
> 旧号：本件原按 **D949** 执行（已产出旧形式交付物，见 §8 处置请求）；按 §〇之二 一，**D949 → D1001**，此后一律用 **D1001**。

---

## §1 建议的表改动（供 Mac-CTO 应用；原文可直接粘贴）

**落点**：`docs/synova/coordination/ownership.yaml` 的 `rules:` 列表 — **追加在 `electron-renderer/**` 规则之后**（实测为 L175 之后）。
**位置要件**：必须在 `**` 兜底规则（实测 **L35**）**之后** —— 表语义「按顺序求值，最后匹配者胜出」。

```yaml
  # D1001 增补（2026-09-25，D1000 §〇之二 三）: 桌面端测试随被测主体归属。
  #   被测 electron/** + electron-renderer/** 均 mac，而 tests/electron/** 此前落 ** 兜底判 win
  #   → 任何一次桌面端改动（源码 mac + 测试 win）必被 D734 判「变更跨域」卡死。
  #   同族：D782 tests/doc-system、D806 tests/project、D914 三类文档。
  #   连带改判 tests/electron/ 13 件为 mac，含 D716 建的 dual-guide-packaging-guard.test.ts
  #   （其头注自陈断言对象是 mac 域资产，改判系纠正旧误标）。
  - glob: "tests/electron/**"
    owner: "mac"
    source: "派生: 测试随被测主体（electron/** + electron-renderer/** 均 mac）；D1000 切片 B 表缺口"
  # tests/ga-collab-*.test.ts 的被测主体在 electron-renderer/src/**（ga-collab.ts 状态机/请求构建
  #   + ga-detail-sections.tsx 展示），同归 mac。**用 glob 而非列单件**：覆盖 logic + ui 两件，
  #   只列一件则下一张卡照旧撞。
  - glob: "tests/ga-collab-*.test.ts"
    owner: "mac"
    source: "派生: 同 tests/electron/**（测试随被测主体 electron-renderer/src/**）；覆盖 ga-collab-logic + ga-collab-ui"
```

**随后必须重跑**（否则治理金测试 §7 逐字节 drift 断言变红）：
```
python scripts/control-tower/check-ownership.py --emit-codeowners > .github/CODEOWNERS
```
预期产物变化：CODEOWNERS **+2 行**（`tests/electron/**` 与 `tests/ga-collab-*.test.ts` 各一行，均 `tangbaobao520`），3420 B → 3420+ 对应增量。

### §1-补 与被作废分支的差异声明（**K3 审计 M-6 的处置**）

K3 `k3_audit.not_established` M-6 登记：「越权分支与建议件**非逐字**（规则本体一致，注释/source 不同）」。**该差异是刻意的，且为改号规则所要求**，声明如下：

| 项 | 被作废分支 `fix/d949-ownership-electron-tests` | 本建议件 §1 | 判定 |
|---|---|---|---|
| **规则本体**（`glob` + `owner` 两字段） | `- glob: "tests/electron/**"` / `owner: "mac"`；`- glob: "tests/ga-collab-*.test.ts"` / `owner: "mac"` | **逐字相同** | ✅ 一致 |
| **`source` 字段** | 含旧号 `D948` / `D949` | 改为 `D1000` + 重写 | ⚠️ **差异，且必须** —— D1000 §〇之二 一：「旧号**不得再用于本方任何新产物**」。若照抄旧文的 `source`，本建议件自身即违规 |
| **注释文字** | 旧注释块 | 重写为面向 Mac-CTO 的采纳指引 | ⚠️ 差异，无害（注释不进机器语义） |

**⇒ 结论**：差异**只**在 `source` 与注释；**规则本体逐字一致**。且该差异是改号后被**强制**的（旧号不得进新产物），不构成「建议件与分支不一致」的缺陷。
**供 Mac-CTO 选择**：若倾向保留旧 `source` 文本，签收后可按 §8 选项 (ii)/(iii) 从分支取原文——但**须先把 `D948`/`D949` 改写为 `D1000`/`D1001`**，否则违反改号规则。

---

## §2 证据链（每条 = 命令 + 原始输出摘要；口径 `ref = origin/main @ 6a714483`）

| # | 证据 | 命令 | 原始输出 | 判定 |
|---|---|---|---|---|
| E1 | **缺口存在**：切片 B 写集被判跨域 | `python scripts/control-tower/check-ownership.py <8 文件>` | `❌ FAIL 跨域: 变更落在 2 个域 ['mac','win']`，`EXIT=1` | ✅ 成立 |
| E2 | **改判后单域** | 同上（建议规则生效的探针表） | `✅ PASS 8 个文件同域: mac（无归属 0，域判定豁免 0）`，`EXIT=0` | ✅ 成立 |
| E3 | **glob 覆盖两件**（CTO 关切点） | `…check-ownership.py tests/ga-collab-logic.test.ts tests/ga-collab-ui.test.ts` | 两件均 `mac` → `✅ PASS 2 个文件同域: mac` | ✅ 成立 |
| E4 | **`dir/**` 语义**：`tests/electron/**` 覆盖 13 件 | `… check-ownership.py $(git ls-files tests/electron/)` | 13 件全 `mac` → `EXIT=0` | ✅ 成立 |
| E5 | **治理件三件均 mac**（⇒ 由 Mac-CTO 执行天然单域） | `… check-ownership.py docs/synova/coordination/ownership.yaml .github/CODEOWNERS tests/control-tower/check-ownership.test.sh` | `✅ PASS 3 个文件同域: mac` | ✅ 成立 |
| E6 | **金测试基线绿（改前）** | `bash tests/control-tower/check-ownership.test.sh`（需 Git 自带 PATH） | `✅ 全部通过: 58 项`，`EXIT=0` | ✅ 成立（= 采纳后必须保持的底线） |
| E7 | **CODEOWNERS 与 emit 逐字节一致** | Python 捕获 stdout 原始字节后比对 | `BYTE_IDENTICAL=YES`（3420 B / SHA256 `3d0e07a5c019876f…`） | ✅ 成立（**禁用 PowerShell `>`**，其 UTF-16LE 会假报漂移） |
| E8 | **判别性（删掉即红）** | 沙箱 yaml 副本删除两条新规则后重跑 | `❌ FAIL 跨域 ['mac','win']`，`MUTANT_EXIT=1` | ✅ 成立（判据真读数据，非 grep 型静态判据） |

**glob 语义依据**：`scripts/control-tower/check-ownership.py:111-123 glob_match()` —— `dir/**` 走前缀匹配、含 `*` 的落 `fnmatch.fnmatchcase` ⇒ `tests/ga-collab-*.test.ts` 可用（E3 实证）。

---

## §3 连带影响（采纳前须 Mac-CTO 知悉）

| 项 | 影响 | 依据 |
|---|---|---|
| `tests/electron/` **13 件改判 mac** | 含 D716 Win 建的 `dual-guide-packaging-guard.test.ts` | E4 |
| `.github/CODEOWNERS` **必须同批重生成** | 治理金测试 §7 是**逐字节**断言 | E7 |
| `tests/control-tower/check-ownership.test.sh` | **无需改动**（先跑后判：58/58 绿，不枚举这些路径） | E6 |
| 未来新件自动入 mac | `tests/ga-collab-*.test.ts` 是**族覆盖**（有意设计，非特例豁免） | §1 注释 |

---

## §4 未证实项 / 风险（诚实登记）

1. **未跑全量 vitest / CI**：本件为治理表建议，证据均为 `check-ownership.py` 直调 + 金测试；**全量回归未跑**。
2. **E2 的 PASS 是在沙箱 yaml 副本上取得**（原表未改）；真实表采纳后须由 Mac-CTO 按 §5 复跑确认。
3. **`--emit-codeowners` 的产物字节未在真实表上复跑**（E7 为副本口径）；采纳后须复跑比对。
4. **未评估**该改判对**并行在跑的其他 mac 线卡**的影响（若有 mac 卡正在使用 `tests/electron/**` 的 win 归属假设，会受影响）。建议 Mac-CTO 在改表前扫一遍在跑分支。

---

## §5 建议采纳后的验收命令（供 Mac-CTO 执行后自证）

```bash
# 1) 单域（4 文件：表 + CODEOWNERS + 金测试 + 卡片）
python scripts/control-tower/check-ownership.py \
  docs/synova/coordination/ownership.yaml .github/CODEOWNERS \
  tests/control-tower/check-ownership.test.sh task-state/D1001.json

# 2) 治理金测试必须 58/58（需 Git 自带 bash + PATH）
export PATH="/c/Program Files/Git/usr/bin:/c/Program Files/Git/bin:$PATH"
bash tests/control-tower/check-ownership.test.sh      # 期望 ✅ 全部通过: 58 项（或更多）

# 3) CODEOWNERS 逐字节（禁 PowerShell >）
python - <<'PY'
import subprocess, pathlib
out = subprocess.run(["python","scripts/control-tower/check-ownership.py","--emit-codeowners"],
                     capture_output=True).stdout
tracked = pathlib.Path(".github/CODEOWNERS").read_bytes()
print("BYTE_IDENTICAL:", out == tracked, len(out), len(tracked))
PY

# 4) 切片 B 写集必须同域 mac（D1000 切片 B 的硬前置判据）
python scripts/control-tower/check-ownership.py \
  electron-renderer/src/stores/auth-session.ts electron-renderer/src/stores/ga-collab.ts \
  electron-renderer/src/components/RightPanel.tsx electron-renderer/src/components/LoginPanel.tsx \
  electron-renderer/src/lib/api.ts electron-renderer/src/stores/app-store.ts \
  tests/electron/d948-identity-chain.test.ts tests/ga-collab-logic.test.ts
# 期望 ✅ PASS 8 个文件同域: mac
```

---

## §6 旧交付物处置请求（**须 CTO 裁定，我不擅自处置**）

按旧口径（D949），Win 小队**已产出并 push** 一个**直接改表**的分支：

| 项 | 值 |
|---|---|
| 分支 | `fix/d949-ownership-electron-tests`（tip `f828311c`） |
| 提交作者 | `Synova-Win`（`ee6b0c8d` author/committer 均为 Synova-Win） |
| 实际改动 | `docs/synova/coordination/ownership.yaml` **+16 行**、`.github/CODEOWNERS` **+2 行**、`task-state/D949.json`、`.claude/task-briefs/…`、`.claude/bypass.log` |

**冲突**：D1000 §〇之二 三 明写「`ownership.yaml` 是 Mac-CTO 单写者，**Win 方不得直接改**」。该分支**正是** Win 方对表本体的直接改动（内容与 §1 建议等价）。

**处置选项（请 CTO 选一）**

| 选项 | 内容 | 代价 |
|---|---|---|
| **(i) 推荐** | **作废该分支**（不合并、不 cherry-pick）；D1001 交付物以**本建议件**为准，Mac-CTO 据 §1 自行改表 | 丢弃一个已通过 58/58 与逐字节 drift 的分支；但内容已在 §1 完整保留，无损 |
| (ii) | 保留该分支为**参考补丁**，由 Mac-CTO 复核后**以其名义**落地 | 需 CTO 明确「参考补丁不构成 Win 单写者越权」，否则规则被自己破例 |
| (iii) | 书面豁免（按「不追溯」处理），但**该分支仍不得直接合并**（合并即 Win 改表） | 留下一个永久不可合并的孤儿分支 |

**我的建议：(i)** —— 规则刚立，第一个动作就破例会使其失效；而 §1 的建议内容与证据已等价完备。

---

## §7 自验结论

- 本件为**建议 + 证据**，**未改表本体**（可核：本分支不含 `ownership.yaml` / `.github/CODEOWNERS` 的任何改动）。
- 证据 E1–E8 全部为命令原始输出；未证实项 4 条已登记。
- **不予判定**：D1001 的采纳与否归 **Mac-CTO**；通过与否归 **CTO 收件闸 + K3 终审**。
