# Task Brief: D379: path-dependency 哨兵空壳补实现（派活登记）

> 生成: 2026-08-16 | 分支: feat/d379-path-dependency | 认领: 🛠 synova-dsh（编码线）
> 来源: D378 审计发现（extensions/sentinels/path-dependency 有 manifest 无实现）
> **规格归属：本任务 spec（SYNOVA-IMPL dev doc）由 📋 synova-devdoc 线产出，编码线拿到 dev doc 后实现。本 brief 仅作任务板派活登记，不含实现规格。**

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
path-dependency 哨兵属 strategy 专家，manifest 已存在（`extensions/sentinels/path-dependency/manifest.json`）但 entryPoint 与 aggregate 缺失，`sentinel-loader.ts` 注册报错（当前 45 活跃哨兵实际注册 44/45）。属哨兵切片（v4 分工归 DSH 编码线）。

### b) 文件审计
- 现状: `extensions/sentinels/path-dependency/manifest.json` 存在，实现文件缺失
- 归属: 哨兵切片（src/sentinel/ + extensions/sentinels/ = DSH 编码线领地）
- 参考: 同组 strategy 哨兵结构

### c) 决策
manifest 是接口契约，实现填空（细节由 dev-doc 线在 spec 中定义）。参考：第一性原理（manifest 即契约）。收敛。

## Q1: 调研 — 决策链 + 执行约束

### a) 决策链
① dev-doc 线出 SYNOVA-IMPL spec（契约/测试先行）→ ② 编码线实现 → ③ 接线验证（loader 注册 45/45）→ ④ K3 审计。
引用铁律 47/48（契约优先 + 测试非空壳）、M3（接线）。

### b) 执行约束
- 实现必须与 manifest 契约一致（entryPoint/exportKey/thresholds 不改）
- compute 三路径测试（正常/降级/边界），expect() 断言

### c) 决策参考系
参考：第一性原理。收敛。

## Q2: 范围 — 正确的最简方案

做什么（编码线，待 dev doc 到位后）：
- extensions/sentinels/path-dependency/computes/detect.ts
- extensions/sentinels/path-dependency/aggregate.ts
- 对应测试（三路径）

不做什么：
- 不改 extensions/sentinels/path-dependency/manifest.json（契约冻结）
- 不改其他哨兵目录
- 不改 src/sentinel/（loader 自动注册，无需改）

## Q3: 验收 — 入口 → 交互 → 结果

入口：sentinel-loader registerLoadedSentinels() 扫描
处理：path-dependency 动态 import 成功
结果：45/45 哨兵注册成功（无 entryPoint 报错）；detect-path-dependency 三态正确

## 架构层: L3 洞察（extensions/sentinels 文件驱动）

#CRITERIA: A

## Done 标准
- [ ] 注册日志 45/45（无 path-dependency entryPoint 报错）
- [ ] vitest 三路径通过（正常+降级+边界，expect 断言）
- [ ] dev doc 由 synova-devdoc 线交付（spec 先行）
