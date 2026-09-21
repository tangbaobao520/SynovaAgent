# D862 / P-1 出站收敛（小队 A · coder-a）

## Q0: 定位 — 项目拼图 + 文件审计
Synova = AI 诊断 Agent。本任务在基础设施层（providers 出站出口的消费者侧）：把 src/connectors、src/tools、src/agent、src/l1、src/cli-manager.ts、src/deploy/bootstrap.ts、src/services/deepseek-balance.ts、src/mvp-server.ts 中的裸 fetch 全部迁移到 `src/providers/http-exit.ts` 的 `outboundFetch(url, init)`（冻结契约，只读复用，禁改）。localhost 本机 API 也走出口（契约原生 loopback 恒绕过代理）。已有先例：src/providers/base.ts、src/providers/ernie.ts 已迁移（模式参考）。不新增文件驱动扩展点。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
- 铁律 24/31：catch 必须 log + degraded，禁止静默降级。
- 铁律 32：错误按 OutboundHttpError 的 code/phase/retryable 消费。
- 信号语义对齐：AbortSignal.timeout 原样保留（connector 独立超时策略不变）；abort 传播出口已保证原样抛出不包装。
- init 只支持 method/headers(Record<string,string>)/body(string)/signal —— 迁移时去掉 fetch 原生的 duplex/其它字段。
- 参考：Anthropic 决策链（spec=出口契约 → test → impl → wire）。参考：DSH dsh-http-proxy 单出口模式 + 结论=全仓库唯一出口。

## Q2: 范围 — 正确的最简方案
做什么：上述文件裸 fetch → outboundFetch；每处迁移配 tests/ 下三路径测试（正常/降级/边界）；deploy/bootstrap.ts 启动期同出口 + 代理不可达 degraded 可见（log.warn + 结构化 degraded 标记，禁静默直连回退）；D862 第 2 项健康检查代理暴露只做存在性/来源（getProxyStatus()，variables 只含变量名）——若落在 src/routes/ 或 src/server.ts 只改不 commit（coder-b 写集）。
不做什么：不改 src/providers/http-exit.ts（冻结）；不碰 scripts/control-tower/**、scripts/audit/**、.github/workflows/**、src/sentinel/**、src/routes/**、src/tui-v2/**（coder-b 地盘）；不实现出口重试；不引新依赖；as any/as never/as unknown as = 0。

## Q3: 验收 — 入口 → 交互 → 结果
入口：各模块出站调用点（connector 认证/健康检查、专家工具 localhost API、webhook 发送、CLI 状态查询、LLM 余额查询、启动探活）。
处理：全部经 outboundFetch 路由（代理/直连/loopback 绕过由出口统一决策）。
结果：`grep -rn 'await fetch(' src/`（排除 http-exit.ts 本身）= 0；测试三路径全绿；lint 通过。

## 架构层: L1（connectors/tools/agent/cli/l1 出站）+ 基础设施（providers 出口消费者）
## Done 标准: 目标文件裸 fetch 计数 before>0 → after=0；每处迁移有配对 expect() 测试且抽掉迁移后测试变红；npm run lint 通过。
