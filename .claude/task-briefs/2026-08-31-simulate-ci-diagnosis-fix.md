# simulate-ci 正常路径内层输出诊断黑洞修复（CTO 自修）

> 派单: CTO 自办 | 2026-08-31 | 类型: 控制塔测试诊断能力修复
> #CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
L0 控制塔。simulate-ci.test.sh「正常路径」把内层 simulate-ci.sh 输出丢 /dev/null——D563/D564 验收中 Windows simulate-ci 红但内层失败测试名不可诊断（3 轮盲猜的根因之一）。

### b) 文件审计
- tests/control-tower/simulate-ci.test.sh 正常路径段（唯一修改点）

### c) 决策
捕获内层输出，失败时拼 ❌ 行进断言信息（CI ::error annotation 直接暴露失败测试名）。

## Q1: 调研
D521 工具2 契约；诊断黑洞 = M1 同型（信息丢失）。

## Q2: 范围
做什么：
- 修改 tests/control-tower/simulate-ci.test.sh：正常路径捕获输出 + 失败诊断
不做什么：
- 不改 scripts/audit/K3-AUDIT-PROTOCOL.md 等审计文件：审计红线
- 不改 simulate-ci.sh 本体（行为零变化）

## Q3: 验收
入口：bash tests/control-tower/simulate-ci.test.sh
结果：7/7 绿（本地 + CI 双平台）

## 架构层:

L0 控制塔（tests/control-tower/）

## Done 标准
- [x] 本地 7/7 verify: bash tests/control-tower/simulate-ci.test.sh 2>&1 | grep "7 通过"
