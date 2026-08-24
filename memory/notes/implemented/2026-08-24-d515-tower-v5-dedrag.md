# D515 控制塔 V5.0.0 减负重构 — 执行教训

> 提取自: D515 三批 13 项执行过程（spec: docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D515-tower-v5-dedrag-20260824.md）
> 主题: 治"拉扯"的任务自己不被拉扯 + 门禁收敛的实施教训

## 决策与教训

1. **硬阻断收敛 = 改语义不改判定**：hard_check → soft_check 只改计数器归属（HARD_FAIL → SOFT_COUNT），判定代码、❌/⚠️ 输出、组结构原样保留——`--check` 报告与 K3 审计依赖这些输出。K3 审计链路（GATEKEEPER bypass 强信号、检查器执行失败 exit 2、task-state 状态机）零触碰。
2. **`--check` 的失败信号要跟着语义走**：synova-commit --check 原用 `grep ❌` 判失败——soft_check 的子脚本输出仍含 ❌ 会误报。改为只认 pre-commit 的硬失败结尾标记「提交已拒绝」（该串仅硬失败路径输出）。
3. **bash 保留变量名是隐形炸弹**：Q2 行号定位首版用 `LINENO` 做循环变量——bash 每行自动覆写 LINENO，报错行号恒等于脚本自身行号（121）。改用 `QLN`。教训：`LINENO/FUNCNAME/PIPESTATUS` 等保留名永不作用户变量。
4. **多 pathspec 的 git restore 不是原子保险**：`git restore --staged -- A B` 在 B 不在 index 时整体失败，A 留在暂存区——测试探针泄漏到下一场景，表现为"莫名 as any 硬拦"。清理必须逐文件 + `rm --cached` 兜底。
5. **测试套件有共享态**：control-tower 测试共享 `.codex/control-tower/session-registry.json` 与 tracked 文件（bypass.log/CTO-HEALTH/founder-console）。全套跑完后必须清 registry、checkout 被测写的 tracked 文件、删生成的测试 brief——否则真实提交被 staging-guard 误拦（D331-test 写集）或 G12d 误拦（生成物）。write-set-check 反向对账读真实暂存区：staging 非空时跑它必红，属环境性红灯非回归。
6. **快速通道判定只认显式信号**：SYNO_FASTLANE 由 synova-commit 在 `--files` 唯一且为 bypass.log 时 export——绝不在 pre-commit 侧裸看暂存区（D414 自动 add 会把正常提交误送快速通道）。实测纯补记 1s（原 90-120s）。
7. **D511 并行冲突处置**：D511（组 14 版本守卫）impl_done 未合并时，D515 基于 origin/main 开工；两者对 pre-commit-check.sh 的改动区域不重叠（D515 改组 1-13 语义 + 头部，D511 尾部加组 14），合并顺序任一在前均可，冲突预期为纯上下文级。
