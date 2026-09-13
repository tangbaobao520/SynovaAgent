---
状态: proposed
日期: 2026-09-14
决策: 模块域划分收敛为单一机器权威源 docs/synova/coordination/ownership.yaml，CODEOWNERS 降级为其生成产物（drift 逐字节断言）；域校验器 scripts/control-tower/check-ownership.py 采用三态退出码 + 「无归属不阻断、检查失败必阻断」语义。
理由: 域划分此前零机器消费者（只有人读的 TASK-ROUTING.md + 顺序错误的 CODEOWNERS），CTO 2026-09-13 因此两次派错线（D728/D729 写集 100% 落 Win 域却派给 Mac）。同一事实留两个源必然漂移，故只留一个权威源 + 生成产物 + 逐字节漂移门禁。
---

# ownership 机器化（D733）

## 触发场景

2026-09-13，CTO 在同一天两次把写集落在 Win 域的派单发给 Mac 线（D728「证据层接线实现」写集
`src/evidence/**` + `src/routes/**` + `src/agent/{conversation-engine,diagnosis-launcher,engine-context}.ts`
+ `src/server.ts`；D729 的 `src/l4/graph-bridge.ts` + `src/agent/post-diagnosis-processor.ts`）。
CTO 当场核归属后出裁决书（commit `9aaf0c68`）并自认「pre-dispatch-check 的机械项抓不到这类错」。

根因不是人疏忽，是**缺机器权威源**：域划分只写在 `docs/synova/coordination/TASK-ROUTING.md`（纯 Markdown，
零机器消费者）；`.github/CODEOWNERS` 是第二个人工维护的副本，且 Win 域用 `src/` 兜底却把它排在
`src/sentinel/`/`src/cron/`/`src/mcp/` **之后** —— CODEOWNERS 官方语义是「最后匹配者胜出」，
所以那三条 Mac 例外被 `src/` 吞掉（当日 `require_code_owner_reviews=false`，故无功能差异，一旦建三团队即错）。

## 决策内容

1. **单一权威源**：`docs/synova/coordination/ownership.yaml` —— 34 条 `glob → owner(mac|win|k3)`，
   每条带 `source:` 字段逐条回溯 `TASK-ROUTING.md` 行号（§一 L27-L40 + §串行点 L58-L65 + L49）。
2. **CODEOWNERS 是产物不是源**：由 `check-ownership.py --emit-codeowners` 生成，测试逐字节断言
   （drift 门禁）。顺序修正为「宽规则在前、例外在后」，与 CODEOWNERS 语义对齐。
3. **三态退出码**（D328）：`0` 通过 / `1` 越域或跨域 / `2` 检查执行失败（yaml 缺失、语法非法、
   未知 owner、无输入）—— 失败绝不与通过混同。
4. **无归属 = 明示不阻断**：无规则匹配的文件打 `⚠️ 无归属规则匹配` 但不计阻断。这是刻意设计，
   使「删默认规则 → 越域变绿」这一反向验证可做；配套由测试断言「`default` 规则必须恰有一条」
   兜住结构性风险（删兜底会让测试红，而不是让门禁静默变绿）。
5. **解析复用不重写**：本机实测 `python3 -c "import yaml"` → `ModuleNotFoundError`（PyYAML 不可用）。
   复用仓内既有 `scripts/product-lines/productline_yaml.py`（严格 YAML 子集解析器，零三方依赖，
   自带 D333 决策记录与契约头），不重写第二个解析器。
6. **域判定豁免 `domain_neutral`**（D734 前置）：`.claude/bypass.log` / `.claude/task-briefs/**` /
   `task-state/**` / `memory/notes/**` / `.claude/gate-hits.log` / `.codex/**` 在两种模式下都不判域。
   实测依据：抽样 origin 上 3 个真实分支（`feat/win-d704-*`、`fix/d726-*`、`feat/mac-d716-*`），
   `.claude/bypass.log` 出现在**每一个**分支（post-commit hook 自动登记，D521），且各线的 task brief 都解析为 mac ——
   不做豁免则 D734 的单域判定对每个 PR 都误报跨域，门禁当场失效。
7. **owner 三值不落 GitHub 账号**：`github:` 段集中映射 mac/win/k3 → `@tangbaobao520`（三团队未建，
   保持现状零行为变化）。

## 派单与仓内硬门禁的两处冲突（本 Note 记录处置，供 CTO/K3 复核）

| 冲突 | 派单写的 | 仓内物理门禁要求 | 处置 |
|---|---|---|---|
| 反向验证 | 「把 ownership.yaml 的**默认规则**删掉 → 两条验收必须变绿」 | 同时要求「**Win 域必须显式列出**」 | 两者对 `src/` 路径互斥：若另设 `src/** → win` 规则，删兜底后 src 文件仍被 `src/**` 命中 → 仍是红的。**取验收为准**（可证伪的那条），`src/` 归属由带 `territory` 字段的兜底规则给出，Win 的非 src 领地（extensions/packages/synova_worker/docs/plans）仍逐条显式列出 |
| 测试文件名 | `tests/control-tower/ownership.test.sh` | `ct-test-gate.sh:18/45` 硬编码配对规则 `scripts/control-tower/<name>.py ↔ tests/control-tower/<name>.test.sh` | **取门禁为准**，改名 `tests/control-tower/check-ownership.test.sh`（否则 CT-40 判「缺配对测试」硬阻断提交） |

两处都不是自由裁量，而是「可证伪的验收 / 物理门禁」优先于文档措辞；两处均已在 task brief 与 PR 描述中显式声明。

## 反向验证（原文见 tests/control-tower/check-ownership.test.sh §5）

```
权前: python3 scripts/control-tower/check-ownership.py src/server.ts --owner mac    → exit 1（红）
删兜底规则块后:  同上                                                            → exit 0（绿，含 ⚠️ 无归属明示）
还原（sha256 一致）后: 同上                                                       → exit 1（红）
```

## 相关 D#

D733（本 Note）· D734（PR 预算门禁，消费本校验器的单域模式）· D728/D729（触发本决策的两次派错线）
· D730（CTO 已登记的改进项「写集 × 域归属交叉校验」——本 Note 即其落地）
