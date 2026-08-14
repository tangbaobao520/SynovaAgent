# Synova 文档管理规范 v1.1

## 存放位置

所有项目管理文档统一存放于 docs-synova/ 目录。

| 文档类型 | 路径 | 命名 |
|---------|------|------|
| 仪表盘 | docs-synova/DASHBOARD.md | DASHBOARD.md (英文) + DASHBOARD-CN.md (中文) |
| 开发文档 | docs-synova/implementation/ | SYNOVA-IMPL-D{编号}-{任务名}-YYYYMMDD.md |
| 文档管理规范 | docs-synova/DOCUMENT-CONVENTIONS.md | 本文件 |

## 禁放位置

- 禁止放 docs/synova/ — 与research目录混淆
- 禁止放 project-admin/ — 临时目录
- 禁止放 .claude/ 或 .codex/ — 进程锁定风险

## 开发文档标准

每份必须包含：Q0-Q3格式、grep-refs审计表、Done标准(条目数 >= 约束数)、架构层标注、测试要求、约束(每条有验证方式)