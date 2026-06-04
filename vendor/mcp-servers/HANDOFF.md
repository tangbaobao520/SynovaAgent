# MCP Server 交付给编码 AI

## 已安装（4 个）

| Server | 用途 | 安全风险 | 隔离方式 |
|--------|------|---------|---------|
| server-brave-search@0.6.2 | 行业搜索 | SDK ReDoS（无修复） | 子进程隔离 |
| server-github@2025.4.8 | GitHub API | SDK ReDoS（无修复） | 子进程隔离 |
| server-memory@2026.1.26 | 知识持久化 | 低 | 子进程隔离 |
| server-filesystem@2026.1.14 | 文件读取 | 低 | 子进程隔离 + file-guard.ts |

## 安全审计结果

- 3 个 high 漏洞：全部在 @modelcontextprotocol/sdk 底层，非 Server 层代码
- 类型：ReDoS + DNS 重绑定
- 缓解：所有 MCP Server 在子进程中运行，受 Python Bridge 沙箱保护
- 建议：vendor 目录不对外暴露，仅在子进程中引用

## 接入方式

通过 ToolRegistry 的 connector 模式或 http 模式注册。每个 Server 在独立子进程中启动，stdin/stdout JSON-RPC 通信。

## 待做

1. 实现 MCP Client 桥接层（连接 ToolRegistry ↔ MCP Server）
2. 子进程启动配置（超时、重试、资源限制）
3. 给专家 Agent 注册对应工具
