---
status: implemented
date: 2026-08-21
task: D466
tags: [control-tower, bypass-log, fail-closed, tag-bypass-wiring, cross-platform, 减负]
---

# D466 — check-bypass-log 注释同步 + tag-bypass-wiring 测试跨平台修复

## 决策
控制塔减负审计落地项 2：消除注释-代码漂移 + 修复测试跨平台失败（不碰铁律）。

## 理由
1. **check-bypass-log.sh 注释漂移**：头部注释写 fail-open exit 0，代码是 fail-closed exit 2（D414/U1c 修复 M1 假 PASS 时改了代码没改注释），误导开发者。同步注释 + 测试断言（用例 5 认 fail-closed）。
2. **tag-bypass-wiring 用例 6/7 跨平台失败**：macOS 系统自带 /usr/bin/python3，测试 CLEAN_PATH 只剔除含 "python" 的目录但漏掉 /usr/bin，导致 synova-commit 的 PYBIN 遍历（python3→python→py）先命中系统 python3，回退到 shim 永不触发。修法：shim 同时提供 python + python3，且用 sys.executable 绝对路径（不依赖 python 在 PATH）。

## 结果
tag-bypass-wiring 24/24（原 4 失败）+ check-bypass-log 4/4 不回归。
