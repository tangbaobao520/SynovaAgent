## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
Synova = AI 诊断 Agent。D290 在控制塔审计体系（C）。
audit-check.py 是审计器的 Python 原生实现，替代 subprocess/rg/bash 调用，解决 Windows 兼容。
### b) 文件审计
复用: scripts/audit/audit-check.py（已存在，11 项检查结构完整）
扩展: 无新文件 — 仅修复既有实现
### c) 决策
修复审计结论中的 3 主要问题 + 次要问题

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
引用铁律 0-2/7/24+31/33
- D290 审计结论: PASS 计数恒 0 / whitelist 后缀不匹配 / 动态 import 盲区
- lru_cache 解决 wiring O(n²) 全仓扫描性能

## Q2: 范围 — 正确的最简方案
做什么：
- scripts/audit/audit-check.py: PASS 计数修复（pass_() 加入全部 11 check）
- scripts/audit/audit-check.py: whitelist 后缀归一（rstrip .ts）
- scripts/audit/audit-check.py: 动态 import 正则支持 import('../l4/...')
- scripts/audit/audit-check.py: check_architecture 尊重 targets 参数
- scripts/audit/audit-check.py: lru_cache 文件读取缓存（--full 5.5min→72s）
- scripts/audit/audit-check.py: 删除死导入 + docstring 修正 + 文件尾换行

不做什么：
- 不修改其他 audit 脚本（check-secrets.sh 等）
- 不修改 src/ 任何文件

## Q3: 验收 — 入口 → 交互 → 结果
入口: python scripts/audit/audit-check.py --target "src/routes/enterprise.ts"
交互: 11 项检查逐项输出
结果: PASS 计数显示非零 / graph-bridge 无误报 / diagnosis-launcher L230/L242 动态 import 被捕获

## 架构层: L0 进化（审计工具层，独立于五层）

## Done 标准: 至少一条可验证的完成标准
[ ] PASS:9 显示（非恒 0）
[ ] conversation-engine graph-bridge import 不出现在违规列表
[ ] diagnosis-launcher L230/L242 的 await import('../l4/...') 被捕获为违规
[ ] --full 耗时 < 120s
[ ] tsc 零新增错误
[ ] check-gates-v2 PASS
