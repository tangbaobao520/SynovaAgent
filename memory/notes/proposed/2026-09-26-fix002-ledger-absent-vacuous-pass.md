---
状态: proposed
日期: 2026-09-26
决策: 账本不随仓走（D735/D970 Stage 2）之后，「本机无任何账本来源」一律判「无绕过记录」**显式放行 exit 0**，不再按旧行为 exit 1 拒推。
理由: 旧实现把「.claude/bypass.log 不存在」当作执行证据链缺失 → exit 1（fail-closed）。#796 删除该文件的 git 跟踪、D970 Stage 2 停写旧路径之后，新 clone（账本不在树里 + 本机无残留）上**任何来源都不存在** —— 这是**正常态而非异常态**。fail-closed 在此态退化为「所有新 clone 全员拒推」（台账 FIX-002 的原始症状，verifier Exp-B/Exp-2 复现）。「本机零登记」与「登记被删」在物理上不可区分：本机从未产生过绕过登记时，本机也从未产生过可对账证据 —— 对账无据可依不等于证据链断裂，故判「无绕过记录」放行。
---

# FIX-002 / D331 读面对账：无账本来源 → 显式放行（vacuous pass）

## 触发场景（实测，非推断）

新 clone 态（账本不在树里且本机无残留）跑对账器：

```
$ git clone --no-hardlinks /Users/wane/SynovaAgent /tmp/repro796
$ cd /tmp/repro796 && git checkout 41b97740
$ bash scripts/control-tower/check-bypass-log.sh; echo rc=$?
⚠ fetch 失败——base 可能陈旧（push URL 不更新 tracking ref）；建议 git fetch origin 后重试
❌ bypass.log 不存在: /private/tmp/repro796/.claude/bypass.log
  执行证据链缺失 — 请确认提交均经 synova-commit（含 COMMITTED 记录）或一次性补记
rc=1
```

账本是否在树里（同一 clone 实测）：

```
$ git ls-files scripts/control-tower/ | grep -i ledger
scripts/control-tower/bypass-ledger.sh
$ ls -la .claude/ | grep -i bypass
-rw-r--r--@ 1 wane wheel 4419 .claude/bypass.log.archive      # 只有归档，无 bypass.log
```

⇒ #796（删除 `.claude/bypass.log` 跟踪）先合、D970 Stage 2 之后，**每个新 clone 的每次推送都会被门禁 7 拒绝**。

## 决策内容（读面改动，最小必要）

`scripts/control-tower/check-bypass-log.sh`：

1. 删除「`$LOG` 不存在 → exit 1」这条**无条件**硬失败。
2. 改为「**本机无任何账本来源**（旧路径 + per-session + 冻结归档全部 `-f` 不存在）→ 判「无绕过记录」放行 exit 0」，输出**列出已查来源**并追加 `.claude/degraded-events.log`（显式，非静默；**不用 `|| true` 掩盖任何真实失败**）。
3. **红路径一条不减**：只要存在任一来源，范围内的未登记提交仍 exit 1；显式 `SYNO_BASE_REF` 不可解析仍 exit 1；`git log` 失败仍 exit 2；非显式 base 不可解析仍 exit 2。
4. 顺序约束：**显式 base 有效性检查先于「账本态」判定** —— 放行路径不得掩盖调用方给错引用（D414/U1c 原语义）。
5. 测试 `tests/control-tower/check-bypass-log.test.sh` 补成对反例（见回执 §⒝）；同时把 D508 沙箱块的子 shell 退出码回传父计数器（原实现块内失败不上报 = 假绿）。

## 与 D970 Stage 2 的关系（口径差异，已上报 CTO 裁决）

D970（#799）读面定义为「空范围 = vacuous pass；**有提交待对账但全部来源不可读 → exit 1**」。本决策与它在「范围非空 + 无来源」这一态**结论相反**。两分支改同一文件，合入时必冲突，需 CTO 择一收敛。本 Note 记录 #796（FIX-002 判据）侧的口径与理由；不自称两口径已一致。

## 残留缺口（不因本决策消失）

- 「他机/他工作区产生的登记只落其本机 `.sessions/<sid>/bypass.log`」这一缺口仍存在（D970 选甲案时已显式登记），本决策不使其恶化、也不解决。
- 本机账本被**人为删除**时，本决策与本机从未登记不可区分 ⇒ 该态放行。这是本决策已知代价；替代方案（区分「从未存在」与「被删」）需账本存活证明（提交 trailer / git notes），属后续卡。

## 参考系

第一性原理（可对账 ≠ 必须存在对账对象；「无对象」与「对象丢失」不可由 `-f` 区分）+ Anthropic 基线（门禁的 fail-closed 语义应绑定「确实有东西要检查」）+ 开源实证（本地缓存在新 clone 上必然为空，CI/Git 生态以「无本地态 → 跳过」为常规）+ 收敛检查（台账 FIX-002 判据要求新 clone 态 rc=0；保留全部既有红路径以不削弱门禁）。
