# Task Brief: P0-1 Slice 1 — 修复 sentinel 适配器+路由 3 处 tsc 错误

> 生成时间: 2026-06-14
> 分支: feat/prompt-architecture
> 父任务: P0-1 全量 tsc 清零
> 本 Slice: 修复 3 处简单类型错误

## 项目身份（每次重读）

- SynovaAgent = 组织数字孪生诊断 + 持续增长导航系统。
- 五层架构：L1(交互)→L2(编排)→L3(洞察)→L4(本体)→L5(存储)

## 本任务在哪一层

L3 (sentinel/adapters/) + L1 (routes/)。
改动: 修复函数调用多余参数 + 类型收窄，不涉及逻辑变更。
无跨层风险。

## 文档引用

- 铁律 0-2: tsc 零错误是 pre-commit 硬阻断
- 铁律 38: as any 零容忍 — 修复时使用类型守卫，不用 as any

## 接口审计

- data-silos-sentinel.ts: queryNodes() 调用多传了 2 个参数
- financial-impact-sentinel.ts: queryNodes() 调用多传了 1 个参数
- routes/sentinel.ts:65 参数类型 string | string[] → 需收窄为 string

## 数据流

无数据流变更。本次仅修复类型错误。

## 用户旅程

开发者: git commit 时 tsc 阻断项减少 3 个。

## Done 标准

- [x] 入口可触达: tsc --noEmit 中这 3 个文件不再报错
- [ ] 链路走通: vitest 无回归
- [ ] 结果可见: git commit + push

## 验证命令
```bash
npx tsc --noEmit 2>&1 | grep -E "data-silos-sentinel|financial-impact-sentinel|routes/sentinel"  # 期望零输出
```
