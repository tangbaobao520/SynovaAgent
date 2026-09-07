# SYNOVA-IMPL-D588：会话投影注册表（DSH 借鉴卡 B-07）

> 状态：dev doc | 2026-09-07 | 优先级 P1（Agent 运行底座）
> 归属：Claude 线（src/store/，D500 事件溯源配套）
> 借鉴：DSH 范式（读源码自研，零代码依赖，G1/G4）
> 借鉴锚点（真实源码 0.1.1-rc.2）：`D:\deepseek-harness\packages\session\session-projection\lib\index.js`

## 1. 权威文档引用

- DSH 借鉴指引 v2 B-07；DSH 源码 `session/session-projection/lib/index.js`（已读全文）。

## 2. 代码审计现状（file:line，实测）

### 2.1 DSH 范式

- `ProjectionDefinition`：`register({key, stateVersion, init, apply})` + checkpoint `{seq, ver, state}`。
- `ctx.sessionProjections` 注册表：订阅 `session/event` 一次，每个已提交事件跑每个单元的 `apply`（eager drive）；变更通知 change feed。
- **whole-value event rule（承重不变量）**：状态承载的日志事件必须携带**完整 post-change 状态**，禁止裸 delta——保证每个单元 transition 廉价、每个值自描述。
- ver 不匹配自动全量重放 `restoreFloor`；单元格惰性构建（注册后事件已流过的，首触时对内存 log fold `init`）。

### 2.2 Synova 现状

- `src/store/session-store.ts`：已有 `SessionEvent`（:95）+ `appendEvent`（:343）+ `getEvents`（:361）+ `session_events` 表（:162，D487/D500 事件溯源 append-only）。
- **无投影层**：无 register/init/apply/stateVersion/restoreFloor，无 eager drive，无 change 通知。

### 2.3 真实缺口

有事件流（可回放原始事件），但无「从事件流派生可查询状态」的投影注册表——token 统计/调度态/goal 态等都各自硬算，无法版本化、无法增量重放、无统一派生层。

## 3. 无重复造轮子审计（S-14）

- grep 证实：`src/store` 有 SessionEvent/appendEvent/getEvents，但无 projection/stateVersion/restoreFloor。
- 本次在 D500 事件流之上**新建投影层**，不重写 session-store（复用其事件流）。

## 4. 写集表（1 新建 + 0 修改）

| 文件 | 操作 |
|---|---|
| `src/store/session-projection.ts` | 新建：`registerProjection({key,stateVersion,init,apply})` + checkpoint + 增量 apply + ver 不匹配 restoreFloor 全量重放 + whole-value 断言 |

## 5. 测试要求（red→green，非空壳）

新增 `tests/store/session-projection.test.ts`：
- 正常：register + apply 增量派生；checkpoint 恢复；≥2 个投影 stateVersion 版本化 + 重放一致。
- 边界：ver 不匹配 → restoreFloor 全量重放；whole-value 缺失 → 断言报警；空 log。
- 每用例 ≥3 expect。

## 6. 接线要求

- `session-projection.ts` 在 `src/store/` 由 SessionStore appendEvent 后触发（或订阅 D500 事件流），grep 调用方。

## 7. 完成标准（DS1-DSn）

- DS1：`grep -rn "registerProjection" src/` 命中（真实接线，非测试内）。
- DS2：`grep -rn "@deepseek-ai" src/` 零结果（G1）。
- DS3：新测试 red→green，≥4 用例。
- DS4：`npx vitest run tests/store/session-projection.test.ts` 全绿；tsc 零新增（28 基线）。
- DS5：`as any` = 0。

## 8. 自检清单

- [ ] DSH session-projection 源码已读全文
- [ ] Synova session-store 事件流现状 grep 实证
- [ ] whole-value rule 落入测试
- [ ] red→green 实测
- [ ] 不是凭记忆
- [ ] 不用 --no-verify
