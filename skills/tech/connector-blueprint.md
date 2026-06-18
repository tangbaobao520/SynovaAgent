---
name: connector-blueprint
version: 1.0
description: 连接器 PRD 模板——当内置连接器不覆盖时，设计 API 桥接/MCP Server/RPA 适配方案
when_to_use: software-ecosystem-scan 发现"桥接适配"的软件，或客户明确要求连接两个系统
required_tools: [connector_blueprint, query_graph]
depends_on: [software-ecosystem-scan]
---

# 连接器 PRD 模板

## 适用场景

在软件生态扫描完成后触发。只处理"桥接适配"（Agent就绪度 5-7 分）的软件——原生适配不需要连接器设计，不可适配的连接器设计也无意义。连接器设计是固定模式的工作（API 桥接 / MCP Server / RPA 适配），没有工程不确定性。

## 方法步骤

1. 确定连接器类型：API 桥接（两端都有 API） / MCP Server（需一端支持 MCP 协议） / RPA 适配（无 API 需模拟操作）
2. 从 source 端梳理需要暴露的数据对象和操作接口，从 target 端确认数据格式和协议要求
3. 调用 `connector_blueprint` 工具生成连接器 PRD 初稿
4. 补全 PRD 中的接口规范、数据格式映射、异常处理策略
5. 输出完整 PRD 供编码 Agent 实现

## 输出格式

```
连接器 PRD: 用友 → MCP Server
类型: MCP Server 桥接适配
源系统: 用友 U8+ (SQL Server 数据库接口)
目标: MCP 协议兼容的 LLM Agent
数据对象: 客户档案 / 供应商档案 / 会计凭证 / 库存台账 / 销售订单
同步策略: 定时轮询 (每 30 分钟), 增量同步
异常处理: 连接失败 → 重试 3 次 (间隔 30s) → 写入错误队列 → 告警
数据格式映射: 客户档案中的"部门编码"(用友) → "departmentId"(MCP Schema)
安全: 只读权限, 数据库账号专用, IP 白名单
```

## 判断标准

- 每个"桥接适配"软件必须有连接器 PRD 或明确标注"暂不设计"的原因
- PRD 必须可被编码 Agent 独立实现——编码 Agent 不需要与客户沟通就能按 PRD 写出代码
- 数据格式映射必须完整——每种数据对象至少标注 source 字段 → target 字段的映射
- 异常处理策略必须覆盖：网络断连 / 数据格式异常 / 认证过期 / 限流
- 如果同一类桥接已有现成开源方案，标注"建议评估 XX 开源方案"而非重新设计

## 常见陷阱

- 把 PRD 写得像架构设计文档——连接器是固定模式工作，不需要 ER 图、时序图、部署架构
- 忽略安全要求——至少标注认证方式、权限范围、数据传输加密要求
- 设计过度复杂的同步策略——大多数场景下"定时轮询+增量同步"就够了，不需要实时双向同步
