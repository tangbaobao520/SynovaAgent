# Task Brief: Sentinel信号→ExpertDispatcher接线——SignalAggregator产出信号后调用专家系统，专家产出诊断报告存储，通知FDE

> 生成时间: 2026-06-14 02:01:47
> 分支: feat/phase0-diagnosis-demo
> 代码库状态: tsc=2
0 errors, as any=6, 测试=  }
}



测试运行失败

## 用户旅程

SynovaAgent 自动运行哨兵（Cron定时）→ 哨兵发现异常 → 信号聚合引擎交叉关联 → 路由对应专家 → 专家 ReAct 推理 → 产出诊断报告 → 存储报告 → FDE 可查询

## 影响范围

- `src/sentinel/runner.ts` — aggregateAndDispatch() 调专家
- `src/sentinel/signal-aggregator.ts` — 信号→Evidence 转换
- `src/agent/sentinel-service.ts` — 报告存储 + 查询接口
- `src/routes/sentinel.ts` — GET /api/sentinel/reports 新端点

## 测试计划

- `tests/sentinel/signal-to-expert.test.ts` — happy: 信号→Expert报告产出
- `tests/sentinel/signal-to-expert.integration.test.ts` — sad: 专家不可用时降级

## 文档计划

- 不需要新建设计文档（已有 SPEC.md + SENTINEL-PANORAMA.md）

## Done 标准

- [ ] 入口: Cron 触发哨兵 → 信号聚合 → 自动调 ExpertDispatcher
- [ ] 链路: SentinelFinding → Evidence → ExpertDispatcher.runExpert() → ExpertReport → 存储
- [ ] 结果: GET /api/sentinel/reports 可查询专家诊断报告

## 验证命令
```bash
bash scripts/workflow/checkpoint-impl.sh signalToExpertBridge
```
