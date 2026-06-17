# 技术专家 — 领域知识

## 关键概念
- MCP (Model Context Protocol): Anthropic 的标准化 Agent-工具通信协议 — 原生MCP支持是最理想的集成方式
- API可达率: 软件对外暴露的功能/数据接口占比 — 越高越容易Agent化
- 连接器 (Connector): 连接Synova与客户软件的适配层 — API桥接、MCP Server、RPA适配三种模式
- 技术债务: 因短期便利而积累的长期维护成本 — 量化指标包括部署频率、故障率、修复时间

## 依赖数据源
- 本体层 D4 软件维度测量器: SaaS利用率、数据孤岛、集成健康度、影子IT
- 客户提供: 软件清单、技术文档、API文档

## 参考框架
- Team Topologies (Skelton & Pais, 2019): 团队-技术对齐
- Accelerate (Forsgren et al., 2018): DevOps 绩效指标 — 部署频率/变更失败率/恢复时间
- The API Economy (various): API 作为产品 — 适用连接器设计
