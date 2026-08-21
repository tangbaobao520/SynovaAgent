# GS-06 进化闭环场景（D447）

> 场景: 反馈注入 → 候选池 → 运行状态（loop-3/5 真实执行体）
> 前置: D333 loop-3/5 真实执行 ✅（已在 main: 6279f451，middle-evolution-engine + ga-evolution）
> 归属: scripts/golden-scenarios/ → DeepSeek Harness（进审计无豁免）

## 断言契约（3 条，机器判定）

| # | 断言 | 类型 | 证明 |
|---|------|------|------|
| 1 | feedback/collect → ok:true | 正常 | 反馈注入进化候选池（L0-1） |
| 2 | proposals → 200 + count | 正常 | 候选池端点可达（L0-2） |
| 3 | status → 200 + ok | 正常 | 进化引擎状态可达（L0-2） |

## 诚实 RED 声明（2026-08-21）

- **本场景为闭环契约级断言**：验证反馈注入 → 候选池 → 状态观测三个物理端点。
- loop-3/5 的**真实执行**（cron 触发的 ReAct 推理 + 知识累积）依赖 MainAgent 注入
  与时间调度（季度/周 cron），非即时触发——机器断言覆盖闭环数据面，执行面由
  loop-scheduler 心跳记录（`recordHeartbeat('loop-3')`）在运行日志中证明。

## 运行

```bash
bash scripts/golden-scenarios/GS-06-evolution-loop/run.sh
# exit 0 = 3/3 断言通过；证据写 evidence/GS-06-<date>.json
```

## 验收（派单）

- [x] 场景脚本 + evidence JSON 进 git
- [x] 机器判定 exit 0/1
- [x] 诚实 RED 标注（契约级，非假绿）
