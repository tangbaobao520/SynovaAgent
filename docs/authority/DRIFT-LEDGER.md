# DRIFT-LEDGER.md — 文档漂移台账

> 用途：记录 `check-doc-truth.sh` 发现的文档-事实不一致，逐项跟踪修复（开发线认领，走 task brief）。
> 检测命令：`bash scripts/doc-system/check-doc-truth.sh`（每项修复后重跑，目标全绿）
> 创建：2026-08-19 | 维护：DSH 架构线

---

## 当前状态

- 硬检查 4 项：C1 专家数 / C2 门禁组数 / C3 版本一致 / C4 路径存在
- 2026-08-19 首跑：检出 5 处漂移 → **已修复 2 处**（专家数），**剩 3 处待开发线修复**

## 已修复 ✅

| # | 位置 | 问题 | 修复 | 日期 |
|---|---|---|---|---|
| 1 | CLAUDE.md（3 处：数据流×2 + 五层架构） | 声称 8 位专家（D282 前老名单 strategy/org/...） | 改为 7 位（registry v2.0 名单：host + 6 cycle） | 2026-08-19 |
| 2 | knowledge/shared/README.md | "所有8位专家" | 改为 7 位；updated 2026-08-19 | 2026-08-19 |
| 3 | CLAUDE.md（Loop Engineering 章节） | "pre-commit 8 组" 7 处（V3.7 时代内容）vs 实际 13 组 | 章节级同步：8 组表→13 组表（对照 AGENTS.md）、执法架构/时机表/Windows 兼容/Anthropic 工作流/物理强制说明/Git Hooks 全部更新 | 2026-08-20 |
| 4 | LOOP.md | "8 组硬阻断" ×2 + 版本 V4.4.5；**且整个文件是 GBK 编码** | 重写为 UTF-8 + 同步 V4.5.1（组数 13、版本 V4.5.1、活跃循环表、基础设施表） | 2026-08-20 |
| 5 | CLAUDE.md 流程约束行 | "8组物理阻断"（无空格写法） | 改为 "13组物理阻断" | 2026-08-20 |

## 待修复 🔴（已全部清零 ✅）

~~无~~ —— 真相验证 2026-08-20 起全绿（exit 0）。

## 警告（不阻断）

| # | 说明 |
|---|---|
| W1 | 文档头部 V4.5.1 vs 最新 git tag V4.8.0——控制塔版本（V4.x.y tag）与 Loop Engineering 版本（文档头部）是两个轴，需创始人/开发线决策是否统一口径 |

## 修复后验收

```bash
bash scripts/doc-system/check-doc-truth.sh     # 全部硬检查通过（exit 0）
bash tests/doc-system/check-doc-truth.test.sh  # 5/5 通过
```

---

*本台账是治理机制 #2 的配套记录；新增漂移由 check-doc-truth.sh 检出后在此登记。*
