# Note（implemented）: 三 P1 恢复批——incident-loop POSIX fallback + g12 恢复 + bypass 注释如实化（D561）

> 状态: implemented | 2026-08-29 | deepseek-harness | fix/d561-three-p1-restore
> 关联: D561 / K3 P1-D509 + P1-D535 + P1-D508 / D316（Windows 侧原修复，保持不变）

## 决策
1. **incident-loop.py `_find_bash`/`_bash_env` 平台感知 fallback**：POSIX 平台（macOS/Linux）
   bash 候选扩为 /bin/bash 等 4 个标准路径；`_bash_env` POSIX 分支显式补全 /bin、/usr/bin、
   /usr/local/bin、/opt/homebrew/bin + python3 目录。Windows 分支（D316 修复）零变化。
2. **g12-day-window.test.sh 自 dangling 9cb09dbb 恢复**（D509：main 树 API-merge 误用丢失），
   适配当前 main：输出格式对齐「N 通过, 0 失败」仓库惯例（exit 语义不变）。
3. **check-bypass-log.sh D508 注释如实化**：merge-base 化 = 范围收窄优化，非「6+ 次补记循环
   根治」（已 merge 场景数学恒等）；真根治 = D513 防御性 fetch 刷新 + D451 纯补记豁免。

## 依据（D333）
- 第一性原理: hook 依赖链（bash/cat/grep/python3）在受限 PATH 下的可解析性是平台事实——
  POSIX 规范保证 /bin/bash 恒存，fallback 却只列 Windows 候选 = 平台盲区。
- Anthropic 工程基线: 环境差异必须显式建模（fail-closed 于 Windows 候选 = macOS 恒 degraded）。
- 开源实证: D316 原修复（Windows Git 候选 + env PATH 补全）即同构手法，POSIX 分支为对称补全。
- 收敛: 两参考系一致——平台分支隔离 + 依赖显式补全；注释如实化遵循 M2（声称 vs 事实）零容忍。

## 教训固化
- K3 P1-D535 的根因是 D316 修复的平台盲区（Windows-only 候选）——修一类错时要问「其他平台呢」。
- 注释声称（「根治」）与机制事实（范围收窄）分离是 M2 变体；真根治在 D513 已落地，注释如实回填。
