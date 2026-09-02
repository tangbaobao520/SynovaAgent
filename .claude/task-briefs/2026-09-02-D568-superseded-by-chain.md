# D568 — enterprise-fact superseded_by 语义实现（K3 18-5）

> 派单: CTO | 2026-09-02 | 执行线: 编码 session | 来源: K3 产品线 17 点批（18-5 🟡）
> 类型: FIX（声明/实现脱节——注释与代码矛盾）
> #CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
scripts/control-tower/enterprise-fact-store.ts：L72 version 递增存在；L81 supersededBy 恒 null（全仓库无代码设为非 null）；L82 注释「不覆盖 — 后续可通过 version 链追溯」vs L85 同路径 writeFileSync 实际覆盖——语义矛盾：每文件单条被覆盖，version 链无处追溯。

### b) 文件审计
- scripts/control-tower/enterprise-fact-store.ts L68-96（writeFact 主路径）
- 调用方: weekly-selfcheck / 哨兵写入路径（grep writeFact）

### c) 决策
按注释声明实现真实版本链：version N+1 写入时，旧条目标记 supersededBy=<新 id> 且保留（文件名带版本后缀或目录分版本），查询默认返回链头。注释与实现一致化。

## Q1: 调研
D551 supersede 先例（ga-calibration 版本链语义）；L4-3 归因（语义脱节 bash 拦不住——需 spec 级声明 + 测试锁定）。

## Q2: 范围
做什么：
- 修改 scripts/control-tower/enterprise-fact-store.ts：版本链真实实现（旧条目保留 + supersededBy 回填 + 默认查链头）
- 新增 tests/（版本链三断言：写入→更新→旧条目 supersededBy 非空 + 可追溯 + 默认读链头）
- 修改 task-state/D568.json：回填

不做什么：
- 不改调用方语义（写入路径行为兼容）
- 不改 scripts/audit/：审计红线

## Q3: 验收
入口：vitest 新增测试
处理：先红（现状覆盖式写入，旧条目丢失）→ 实现链 → 绿
结果：三断言绿 + 调用方回归绿

## 架构层:

L5 存储（enterprise-fact 版本链）+ 控制塔工具层

## Done 标准
- [x] 版本链测试绿 verify: npx vitest run tests/ 2>&1 | grep -E "superseded" | head -1
- [x] 注释一致 verify: grep -c "不覆盖" scripts/control-tower/enterprise-fact-store.ts | xargs test 1 -le
- [x] 回填 verify: python3 -c "import json; d=json.load(open('task-state/D568.json')); assert d['status']=='impl_done'"
