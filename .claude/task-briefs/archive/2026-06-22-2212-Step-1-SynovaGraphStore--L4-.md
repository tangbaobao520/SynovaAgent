# Task Brief: SynovaGraphStore — L4 本体图绕开 engine-core

> 生成: 2026-06-22 22:12 | 分支: feat/prompt-architecture | as any: 0

## 项目身份
SynovaAgent AI 诊断 Agent 五层架构 L1 到 L5 八个专家

## Q1: 调研

业界使用注入的 DB 连接模式而非内部创建连接。Anthropic 做法是先让 L4 可用再建哨兵不等空中楼阁。之前 engine-core GraphStore 使用 CJS require 导致 ESM 崩溃本次纯 ESM 预防。

## Q2: 范围

实现完整 GraphStoreLike 接口包含节点边 CRUD 图遍历路径查找时态查询。server.ts 两处替换为 createSynovaGraphStore。不实现 GraphBridge。

## Q3: 验收

入口 server.ts 启动时 createSynovaGraphStore 初始化 OntologyEventBus。处理诊断 post-processing 不再因 require 崩溃。结果诊断返回 complete 事件而非 error。

## 本任务在哪一层

L4 本体层注入 L5 SQLite 连接提供语义查询给 L3

## 文档引用
交接文档 docs plans synova file driven handover md

## 接口审计
synova-graph-store.ts createSynovaGraphStore 返回 SynovaGraphStore
server.ts 两处调用 createSynovaGraphStore

## 数据流
server.ts 启动 getDatabase createSynovaGraphStore initSchema getOntologyEventBus 可用 app.locals.graphStore 诊断后处理可用

## Done 标准 PRD §5 §9 Step 1
- [x] 入口 server.ts 启动 OntologyEventBus 已初始化
- [x] 链路 10 测试全部通过
- [x] 结果 诊断 complete 零 error
- [x] 零 engine-core grep 零结果
