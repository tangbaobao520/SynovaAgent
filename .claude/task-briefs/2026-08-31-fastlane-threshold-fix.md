# fastlane-bypass-only 性能断言阈值 3s→10s（CTO 自修）

> 派单: CTO 自办 | 2026-08-31 | 类型: 控制塔测试稳定性修复（非版本 bump：纯测试断言调整，行为面不变）
> #CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
L0 控制塔 canary 密封测试。D515 项2 的 fastlane-bypass-only.test.sh `<3s` 性能断言对负载机器（CTO Mac 实测 4s）与 simulate-ci 冷沙箱（Windows CI 模拟）过脆，红态阻塞 PR #314 Windows gate——D563/D564 验收发现，非交付代码缺陷。

### b) 文件审计
- tests/control-tower/fastlane-bypass-only.test.sh L9 注释 + L39 断言（唯一阈值处）

### c) 决策
阈值 3s→10s。断言意图 = 证明 fastlane 快于原 90-120s；10s 仍严格证明意图（D333：第一性原理——断言验证机制存在，非微基准）。

## Q1: 调研
D333 四步；CI 时间断言脆性（Anthropic 基线：性能断言给宽界）。

## Q2: 范围
做什么：
- 修改 tests/control-tower/fastlane-bypass-only.test.sh：阈值 3s→10s + 注释记录根因
不做什么：
- 不改 scripts/audit/K3-AUDIT-PROTOCOL.md 等审计文件：审计红线
- 不改 fastlane 机制本身（行为零变化）

## Q3: 验收
入口：bash tests/control-tower/fastlane-bypass-only.test.sh
结果：8/8 绿（本地 + CI 双平台 job 级）

## 架构层:

L0 控制塔（tests/control-tower/）

## Done 标准
- [x] 本地 8/8 verify: bash tests/control-tower/fastlane-bypass-only.test.sh 2>&1 | grep "8 通过"
