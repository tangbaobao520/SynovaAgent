# D577 evidence 索引 + 产品线验收点映射（§10.2，CT-53 验收点级）

> 任务 D577 | 2026-09-05 | 分支 feat/d577-sentinel-threshold-wiring
> 路径说明: spec DS8 提议路径 `docs/synova/audit-reports/evidence/` 与 `.codex/control-tower/evidence/`
> 均被 .gitignore L76 `evidence/` 全局忽略（synova-commit `git add` 暂存失败实测），故落盘于本目录
> （同域、非忽略、随提交入库）；先例: D524 evidence JSON 入库 docs/synova/product-lines/evidence/（2c0b1f0f）。

## 文件清单

| 文件 | 内容 |
|---|---|
| DS8-flip-physical-verification.md | 改盘 0.2→0.9 → crit 消失 → 恢复（red 1 次 + green 3 次幂等 + 盘面字节级恢复证明） |
| T1-T10-red-green-evidence.md | T1-T9 逐用例 red 原因 + green 结果 + 全量回归与 pristine main 基线对账 + tsc 28=28 |
| wiring-and-hygiene-grep-evidence.md | §8 接线 grep（2 生产调用点）+ DS9 卫生双证 + §5.1 写集对账 + manifest diff + as-any=0 |

## 产品线验收点映射（兑换由 CTO/K3 走 redeem 流程，本任务供给验收点级 evidence）

| 点 | 定义（product-lines.yaml） | 验收点级证据 |
|---|---|---|
| 7-2 | 哨兵全量注册（manifest 挂载无死代码） | DS4+DS9：30+9 判定点全部接线（§4.2 A/B 组，T8 零裸阈值 + grep 双证）+ T4 registry 全链路（threshold-injection.test.ts）+ wiring-and-hygiene §2 |
| 8-1 | 阈值真实触发（读 manifest 配置，不硬编码） | DS8 flip 物理验证（DS8-flip-physical-verification.md：改 manifest → findings 变化 → 恢复，3 次幂等）+ DS9 |
| 10-3 | P0 哨兵 manifest 挂载，阈值真实触发（资本循环线） | 4 个 P0 哨兵：cash-runway/revenue-health（D356 已接）+ customer-demand-shift/key-person-risk（本任务接线：T1/T4/T7 + flip；key-person-risk 见 threshold-injection.test.ts ALLOWLIST 自检命中 + git diff aggregate）+ DS7 覆写闭环（T5/T9） |

## 审计员独立复跑入口

```
npx vitest run tests/sentinel/threshold-injection.test.ts            # T1-T9 + T8 卫生（常驻）
D577_FLIP_TEST=1 npx vitest run tests/sentinel/threshold-manifest-flip.test.ts   # DS8（独占运行）
npx vitest run tests/sentinel/                                       # 回归（含 D356 三文件）
npx tsc --noEmit                                                     # 28=28 基线（错误文件清单见 wiring §5）
```
