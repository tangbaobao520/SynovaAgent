# 文档真相防线 D1/D2 接入 pre-commit + doc-system 测试入 CI canary（D782）

> 状态: proposed | 日期: 2026-09-15 | 决策: 把零调用的 D1/D2 防线真正接进 pre-commit 附加块；tests/doc-system/ 6 测试入 CI control-tower-tests；接线前先清 D1 六项硬失败（导航层文档对齐 registry v3.0/13 组/V5.2.7） | 依据: K3 2026-09-14 权威文档一致性专项审计 §7.2 收割 2/3、§12.3「可直接开工、无需裁定」清单（P1-07/P1-08）

## 一、触发（审计实证，非推测）

K3 2026-09-14 专项审计（35 条不自洽，FAIL）对防线清单（§7.1）的判定：

- **D1** `scripts/doc-system/check-doc-truth.sh`：已实施，**零调用**（`grep -n` pre-commit 零命中；`git log -S` 全历史零命中——从未接過）
- **D2** `scripts/doc-system/doc-registry-gate.sh`：已实施，零调用
- **D3** `tests/doc-system/*.test.sh`（6 个）：存在，**零 runner**（CI control-tower-tests 只跑 tests/control-tower/ 33 个）
- W1/W2 接线断言（doc-registry-gate.test.sh L64-65）**红 ≥25 天无人见**
- DRIFT-LEDGER.md 手写台账 25 天未重跑，且其声称的「LOOP.md 8-20 已重写 UTF-8+V4.5.1」**从未合入**（git log 仅 2 提交，最后 ff322850）——M2 声称 vs 事实

这是 **M3（机制建成未接线）第 3 次复发**（D329 P2-2 首次 → 本审计），且 K3 §10.3 Anti-bloat 裁定：不新增 M 类，强化 M3 覆盖域（防线脚本/测试必须有 runner 调用点）。

## 二、决策内容（三件事，接线优先于新机制）

1. **接线前先转绿**（防 M9 永久红→信号衰减）：修 D1 六项硬失败的根因——AGENTS.md/CLAUDE.md/knowledge/shared/README.md 专家数 7/7/8→6（registry v3.0：host+5 问题域，ARCHITECTURE.md PR#444 权威口径）；CLAUDE.md/LOOP.md 组数 8→13（pre-commit 自声明真值）；LOOP.md 版本轴 V4.4.5→V5.2.7（C3 三文档一致）。全部属 K3 §12.3「可直接开工、无需裁定」的 P1-07/P1-08。
2. **pre-commit 附加块**（同 D734 接入模式）：组 13 后追加「D782 文档真相防线」命名块调用 D1/D2。**不动 13 组编号**——「全部 13 组通过」自声明行是 C2 的真值来源，改组数连锁打破三文档声明。本地 soft_check（D515 分工）+ SYNO_CI=1 自动转硬（D516）。fastlane 通道不经本块（CI 为权威）。
3. **CI canary 扩容**：control-tower-tests 的 for 列表追加 6 个 doc-system 测试（W1/W2 从此有 runner，25 天红灯不可再隐形）。

## 三、验收（可证伪，D782 PR 正文贴原始输出）

- doc-registry-gate.test.sh：7 通过/2 失败 → **9 通过/0 失败** ✅（实测 2026-09-15）
- 反向：摘线（git show HEAD 版）→ W1/W2 必红（7/2 复现审计前）；恢复 → 9/0 ✅
- D1 exit 0（六项硬失败清零）✅；pre-commit 内 D1/D2 块实际运行输出可见 ✅
- time：HEAD 3.019s → 接线 3.314s（**+0.3s ≤ +5s**）✅
- 顺带：D1/D2 两脚本清 BOM（接线后输出直进提交流，噪音行不可留）；grep-oP-regression ratchet 清单同步删 2 行（12 待清，38/0 绿）

## 四、已知开口（显式登记，不静默）

1. **docs-only PR 的 D1 CI 权威缺位**：quality job 对 docs-only PR 跳过 Iron Laws 步骤（D515 设计）→ 纯文档 PR 的 D1 只剩本地软提示。改 docs-only 判定牵连 D515 设计，另行立项（不折入本单）。
2. mac 本地 BSD 兼容修复（sed -i / touch -d / declare -A bash3.2）在 D782 PR-2 批处理；CI（ubuntu/windows GNU 环境）当前即绿。
3. doc-system 剩余 5 文件 BOM 在 D782 PR-3 批清理（ratchet 清单收尾）。
4. system-registry + I1/I2/I3 校验器（AD01/AD12/AD03 样板）在 D782 PR-4——校验器只报冲突不定对错，K3 §8 待裁定项（E-08/E-10/E-11/E-12 编号取舍等）仍归创始人。

## 五、迁移计划

本 PR 合并后：proposed → implemented（git mv）；task-state/D782.json 回填 impl。后续 PR-2/3/4 合并后更新本 Note 开口清单。
