# Task Brief: check-brief-vs-code CI验证 + V4.2.9

> 生成: 2026-06-29 16:52 | 分支: feat/prompt-architecture | as any: 0

## 项目身份
同上。

## Q0: 定位

### a) 项目拼图
基础设施层。check-brief-vs-code.sh CI验证脚本 + V4.2.9版本更新。
脚本位于 scripts/ CI配置在 .github/workflows/ci.yml。
属于免疫系统升级。

### b) 文件审计
已有: scripts/checker-review.sh (CI验证脚本模式), .github/workflows/ci.yml (CI配置)
新建: scripts/check-brief-vs-code.sh
扩展: .github/workflows/ci.yml

### c) 决策
新建+扩展。无冲突。

## Q1: 调研
[[engine-core-split-fraud]] — 旧桥接文件绕过。本次用 CI 物理阻断。
[[plan-actual-mismatch]] — 声明与代码不一致。check-brief-vs-code 物理验证。

## Q2: 范围
check-brief-vs-code.sh + CI接线 + 版本号 V4.2.9。
不做: 不改其他CI job、不改pre-commit。

## Q3: 验收
verify: bash scripts/check-brief-vs-code.sh exit 0 (有brief时验证)
verify: grep "V4.2.9" CLAUDE.md > 0

## 本任务在哪一层
基础设施(CI/免疫系统)

## Done
- [x] check-brief-vs-code.sh 脚本
- [x] CI checker-review 接入
- [x] 版本号 V4.2.9
