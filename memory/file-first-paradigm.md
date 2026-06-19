---
name: file-first-paradigm
description: 文件优先设计范式 — 知识在文件不在代码，双 Claude 协同
metadata:
  type: project
---

# 文件优先设计范式

## 核心原则
知识存在于 markdown 文件，不在 TypeScript 代码中。双 Claude 协同：
1. **文件优先 Claude** — 从 expert/ 目录加载 markdown 知识文件，构建 prompt 上下文
2. **本体 Claude** — 使用电子病历进行推理

## Phase 0-2 交付
### Phase 0 — 文件加载引擎
- FileScanner: 扫描目录加载 markdown 文件
- ExpertFileLoader: 按专家名匹配加载
- /api/reload 热重载端点

### Phase 1 — 6 基础能力
- C2: 上下文预算追踪器
- C3: 渐进式技能加载器
- C4: 多策略上下文压缩器
- C5: synova.json + last-good 回滚
- C6: CLI 管理体系
- E2: 专家模板 + Tool Profiles

### Phase 2 — 双 Claude 协同
- 知识导入管线
- 两个 Claude 实例协作协议

## 关联
- [[session-2026-06-16]]
- [[project-state-2026-06-16]]
