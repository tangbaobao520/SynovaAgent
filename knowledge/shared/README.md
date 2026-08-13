---
version: "1.0.0"
updated: "2026-06-21"
scope: "global"
source: "PRD §20.2"
status: "stable"
type: "knowledge"
---

# 共享知识单源目录

专家文件只引用不复制。所有8位专家共享的知识存放于此。

## 使用规则
- expert/*/KNOWLEDGE.md 中引用此目录文件，不复制内容
- 引用格式: `参见 knowledge/shared/{filename}.md`
- 同步脚本: `bash scripts/sync-expert-knowledge.sh`

## 文件清单
- 由 sync-expert-knowledge.sh 自动维护
