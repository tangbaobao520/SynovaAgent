# 技术债务追踪

> 每次 `git commit` 时自动读取此文件，显示未解决问题数量。
> 格式: `- [ ] ID | 创建日期 | 简短描述 | 延期原因 | 预估工时`

## P2 — 代码异味 (中等)

- [ ] **P2-07** | 2026-06-03 | Expert 贡献系统纯内存存储 (`src/routes/expert.ts:29`) | 需要 SQLite 表迁移，涉及 schema 变更 | 4h

## P3 — 改进建议 (低优先级)

- [ ] **P3-01** | 2026-06-03 | 测试覆盖率 35%→60% (`vitest.config.ts:33`) | 逐步提升，非紧急 | 持续
- [ ] **P3-02** | 2026-06-03 | PIIScrubber 正则不完整 (`src/security/index.ts:114`) | 国际号码+IP 匹配 | 2h
- [ ] **P3-03** | 2026-06-03 | listModels() 硬编码 (`src/providers/deepseek.ts:109`) | 需调用 API /models | 1h
- [ ] **P3-04** | 2026-06-03 | 意图分类 LLM 无缓存 (`src/orchestrator/intent-router.ts:89`) | LRU 缓存 TTL 60s | 2h
- [ ] **P3-05** | 2026-06-03 | AgentConversation 纯委托层可删除 (`src/agent/conversation.ts`) | 需确认所有调用方已迁移到 ConversationEngine | 1h
- [ ] **P3-06** | 2026-06-03 | 流式 sleep(20ms)→5ms (`src/agent/conversation-engine.ts`) | 体验优化，非阻塞 | 0.5h
- [ ] **P3-07** | 2026-06-03 | 测试文件按铁律 33 重命名 (`tests/`) | 全量重命名，需 CI 配合 | 3h
- [ ] **P3-08** | 2026-06-03 | ExpertAutonomyEngine 改为依赖注入 (`subagent-coordinator.ts:190`) | 架构改进，非功能缺陷 | 2h
- [ ] **P3-09** | 2026-06-03 | BFS 队列无上限 (`diagnosis-graph-query.ts:52`) | 添加 maxQueue=10000 | 1h
- [ ] **P3-10** | 2026-06-03 | createLLMClient 每次请求新建 (`diagnosis.ts:148`) | 改为单例 | 1h

## 存量缺陷

- [ ] **EMPTY_CATCH** | 2026-06-03 | 10 处空 catch 无日志 (`src/` 多个文件) | 遍历修复，逐处评估降级策略 | 8h
- [ ] **TEST_PHASE_COMPLETE** | 2026-06-03 | 2 个 phaseComplete 测试失败 | 逻辑细节需对齐 | 2h

## 基础设施

- [ ] **GIT_WORKFLOW** | 2026-06-03 | Feature branch 工作流未建立 (铁律 34) | 当前单人开发，main 上直接工作 | 1h

---

**统计**: 共 14 项，预估总工时 30h

**规则**:
- 新增技术债务时，在此文件中添加条目（含创建日期）
- 修复后改为 `- [x]`，保留 1 周后删除
- pre-commit 自动读取并显示"未解决: N 项，最旧: X 天"
- 某项超过 30 天未修复 → 升级为 P1，下次迭代优先处理
