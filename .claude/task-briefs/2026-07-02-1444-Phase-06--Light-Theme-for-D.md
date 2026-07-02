# Task Brief: Phase 0.6 浅色主题 Light Theme for Desktop

> 生成: 2026-07-02 14:44:41 | 分支: feat/prompt-architecture | as any: 0

## 项目身份
SynovaAgent — 驻扎企业的 AI 诊断系统。
诊断是手段，增长才是目的。
核心问题：这家企业的增长卡在哪里？现在该做什么？
五层架构: L1交互 → L2编排 → L3洞察 → L4本体 → L5存储

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
- [x] 纵向（改 L1 交互层 UI）
本任务属于 L1 交互层。在现有 electron-renderer/ 暗色主题基础上增加浅色主题。
文件：electron-renderer/src/styles/global.css（CSS 变量覆盖）
     electron-renderer/src/stores/app-store.ts（theme 状态）
     electron-renderer/src/App.tsx（theme-light class 绑定）
     electron-renderer/src/components/TitleBar.tsx（切换按钮）

### b) 文件审计
无冲突。

### c) 决策
复用现有暗色主题系统，增加 .theme-light CSS 类覆盖变量。

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链
  ① CSS 变量覆盖（不改已有 dark 变量）
  ② Zustand store + toggleTheme
  ③ App.tsx class 绑定
  ④ TitleBar 按钮
  ⑤ 验证：Vite build + tsc

### b) 本任务执行约束
- rule: "浅色主题通过 .theme-light class 覆盖 CSS 变量实现"
  verify: grep -rn .theme-light electron-renderer/src/styles/global.css | wc -l
- rule: "默认启动仍为暗色主题"
  verify: grep -rn "theme.*dark" electron-renderer/src/stores/app-store.ts

## Q2: 范围 — 正确的最简方案是什么？

做什么：light theme CSS 变量 + store + toggle + build
不做什么：不改变暗色主题，不改变布局，不改变行为

## Q3: 验收 — 入口 → 交互 → 结果

入口：点击标题栏 ☀️/🌙 按钮
处理：Zustand toggleTheme → App.tsx 添加 .theme-light class → CSS 变量切换
结果：UI 从暗色切换到浅色，所有面板/文字/边框颜色更新

## 本任务在哪一层
Layer1（electron-renderer/ UI 层 — 仅修改 CSS 变量 + Store + TSX 组件）

## Done 标准
- [ ] 点击 ☀️ 按钮切换到浅色主题
- [ ] 点击 🌙 按钮切换回暗色主题
- [ ] Vite build 成功 + tsc 零错误
- [ ] CI success
