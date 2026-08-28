---
status: proposed
date: 2026-08-18
name: tool-cordis preset mutex create-mode vs synova-cto
class: tool-cordis-preset-mutex
constraint: "同一进程只允许一个预设挂载 @deepseek-ai/dsh-tool-cordis；cordisInspect 是进程级全局注册表，重复注册即抛错导致整个预设挂载失败"
expected: 用户预设不复制 tool-cordis，创造模式（cordis 预设）保持可用；需两边都用时走 DSH 幂等补丁或上游修复
severity: warn
occurrences: 1
first_seen: 2026-08-18
description: 2026-08-18 诊断：创造模式无法选择。实测 session.create 报 agent-preset-invalid：tool-cordis 的 Host Cordis inspect provider Service is already registered。根因：synova-cto 预设也挂载 tool-cordis，其 standing mount 先注册（first-wins），cordis 再挂载即冲突，整个预设挂载失败。DSH rc.6 与 rc.7 同样代码，升级无效。对照验证：synova-cto 与 standard 建会话成功，仅 cordis 失败。修复选项 A DSH 幂等补丁（register 相同 manifest 跳过不抛错，补丁点 dsh-cordis-host-runner/lib/index.js:732）B tool-cordis 挪 host 平面单例（信任扩张，不推荐）C 二选一。创始人已拍板：先不动，仅记录本条
---
