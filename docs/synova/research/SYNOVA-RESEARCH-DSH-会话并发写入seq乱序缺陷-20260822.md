# SYNOVA-RESEARCH-DSH-会话并发写入seq乱序缺陷-20260822

> 类型：bug 报告（外部工具缺陷） | 对象：@deepseek-ai/dsh@0.1.0-rc.8
> 日期：2026-08-22 | 作者：DeepSeek Harness（Mac）| 状态：已修复+已验证（Synova 侧）
> 相关：memory/notes/proposed/ 无重复项；memory/dsh-global-install.md 已同步修复结论

> **第三次复发（本次）**：2026-08-22 晚，dc06ba76（SynovaAgent）+ dc1671bb（K3）再次损坏。
> 本次根因是**前向 sourceEventSeqs 引用**（新发现），详见 §十一。

---

## 一、缺陷一句话

**DSH 在活跃会话写入期间被强制中断（插件安装/重启/断电）时，崩溃恢复的并发写导致事件 seq 乱序落盘；重新加载时被 `readZstdPrefix` 误判为物理 torn，resume 后因事件顺序/配对错乱触发 DeepSeek API 拒绝。**

## 二、现象（按出现顺序）

| # | 现象 | 来源 |
|---|------|------|
| 1 | `history unavailable: corrupt Zstandard session log: complete frame contains a torn JSONL record` | SessionLogScanner，`readZstdPrefix` L984 |
| 2 | `invalid persisted inbox splice at session seq 66888` | Inbox 构造器（dsh-agent/lib/types/inbox.js:21） |
| 3 | `Messages with role 'tool' must be a response to a preceding message with 'tool_calls'` | DeepSeek API `serializeMessages` 校验 |
| 4 | `An assistant message with 'tool_calls' must be followed by tool messages responding to each 'tool_call_id'` | DeepSeek API `serializeMessages` 校验 |

## 三、影响范围

- **全库扫描**：`~/.dsh/sessions/` 下 56 个 session，恰好 **2 个损坏**，都是崩溃时活跃写入的：
  - `session-dc1671bb-1d75-42db-b725-f012511dfb79`（cwd=/Users/wane/Synova-k3独立审计）
  - `session-a99f9faf-af44-4813-96f4-1ea000e93fba`（cwd=/Users/wane/SynovaAgent）
- **数据完整性**：文件物理完全完好（全帧结构完整、明文全部合法 JSON、数据 0 丢失），是**顺序**损坏不是内容损坏。
- **可复发**：DSH 在活跃会话写入时被强制中断（插件安装 `dsh plugin add` 触发服务中断、重启、断电）即可能。概率低、不丢数据，但 resume 必然失败。

## 四、根因分析（三层）

### 4.1 第一层：seq 回退（触发源头）

DSH rc.8 并发写入 **seq 乱序**。插件安装触发服务中断时，活跃会话的多个事件流（流式 chunk + 回合收尾 + 工具调用）**交错落盘**，后写批用**旧 seq 计数**，文件里出现 `seq` 回退：

```
@line 9621 expected 169246, got 169242   ← 回退 4
```

`readZstdPrefix` L984 只查 `committedBytes !== inputBytes` 就抛"corrupt/torn"错误，**不区分物理 torn 与 seq 乱序**——文案误导（文件物理上是好的）。

### 4.2 第二层：双流冲突（崩溃恢复放大）

崩溃后 DSH 恢复产生**双流冲突**：

- **流 A** = 崩溃前完整记录（seq 0..N）
- **流 B** = 崩溃后 DSH 内存 seq 回滚，重放+继续（seq 从旧值重来，物理写在流 A 之后）

流 B 重放了大量流 A 已有的事件（tool/result、step/end），又续写了新分支（step/start 等）。文件尾部是"重放旧 seq + 新事件"的混合体。

### 4.3 第三层：surface 事件顺序交错（resume 失败的直接原因）

流 B 内部并发执行两个 turn（turn 1 恢复 + turn 2 用户输入），事件**物理交错**。DSH 的 `foldSurface` 按**物理顺序**折叠 surface 事件，导致 assistant 声明的 `tool_call` 的 `tool/result` 响应被**下一个 turn 的 assistant 事件插队**：

```
@67423 assistant/message (turn 1 step 215) 声明 tool_call pEse
@67425-67526 assistant/chunk (turn 2 step 3) 流式 chunk 混入
@67527 assistant/message (turn 2 step 3) 声明 tool_call BcAD
@67530 tool/result (pEse)  ← pEse 的响应被 turn 2 插队，落在 BcAD 之后！
```

DeepSeek wire 规则：assistant 的 `tool_calls` 必须**紧跟**响应（下一个 assistant/user 之前）。响应晚到 → API 拒绝。

## 五、修复过程（四步，含一次错误尝试）

### 5.1 尝试 A：纯重编 seq —— ❌ 有缺陷

只把全部事件 seq 重编为 0..N-1。resume 失败：
- a99f9faf → `invalid persisted inbox splice @66888`
- dc1671bb → `Messages with role 'tool' must be response to tool_calls`

**教训**：纯重编号不解决双流冲突（流 B 重放的重复事件仍在）和 splice 越界。

### 5.2 正确修复 1（`/tmp/repair_correct.mjs`）：去重 + splice clamp + 重编号

1. 流 A 完整保留
2. 流 B 去重：`seq < flowBStart` 且 type 与流 A 同 seq 相同的事件（tool/result、step/end 重放）跳过；type 不同（step/start 等新分支）保留
3. clamp 越界 inbox splice：a99f9faf 流 B 的 `splice{next-step, removedCount:1}` 在空 inbox 上越界 → 改 no-op 跳过
4. 重编号 seq 0..N-1 + 全部 `sourceEventSeqs` 通过 seqMap 重映射（190 处引用）
5. zstd 分帧 2000 行/帧写回

结果：a99f9faf=99481 事件、dc1671bb=173114 事件。dc1671bb **完全修复**（用户实测通过）。

### 5.3 正确修复 2（`/tmp/repair_dangling.mjs`）：补 interrupted tool/result

a99f9faf 仍有悬空 tool_call @67527/67528（turn 2 step 3 的 bash 调用，结果从未落盘）。在物理位置 67529 插入 DSH 原生 crash 格式的 `interrupted-tool-result`（`isError:true, error:{name:'ToolOutcomeUnknownError', code:'TOOL_OUTCOME_UNKNOWN'}, surfaceOp:'append'`，源事件 seq 67527），并重编号 + seqMap 重映射全部 sourceEventSeqs。

结果：99494 事件。但**用户实测仍失败**——暴露第三层问题。

### 5.4 正确修复 3（`/tmp/repair_reorder.mjs`）：surface 事件重排

真正病灶是 **surface 顺序交错**：pEse 的 `tool/result`（原 @67530）物理位置在 BcAD assistant（@67527）之后。把 pEse `tool/result` 物理移动到其 `tool/call`（@67424）之后、turn 2 事件之前，重编号 + seqMap 重映射 sourceEventSeqs。

折叠后 wire 顺序从：
```
❌ assistant(pEse) → assistant(BcAD) → tool(BcAD) → tool(pEse)   ← pEse 响应晚到
```
变为：
```
✅ assistant(pEse) → tool(pEse) → assistant(BcAD) → tool(BcAD)
```

## 六、验证（DSH 原生 API，非自研折叠）

| 检查 | 结果 |
|------|------|
| `loadStored()` 无 torn 错误 | ✅ |
| `foldSurface()` 662 surface nodes, 0 replacements | ✅ |
| **wire 顺序检查（assistant tool_calls 紧跟响应）** | ✅ **violation=0**（修复前=2） |
| `Session.fromRestore(id, events, meta)` | ✅ events=99505, firstLiveSeq=99504 |
| `Inbox` 构造（splice 校验） | ✅ nextTurn=0, nextStep=0 |
| **用户实测**：两个 session 均可继续对话 | ✅ |

## 七、给 DSH 上游的建议（根因修复方向）

1. **`readZstdPrefix` 区分物理 torn 与 seq 乱序**：L984 文案误导。seq 不连续 ≠ 物理损坏，应给出可诊断的错误分类（seq 回退点、偏移）。
2. **崩溃恢复幂等**：恢复时应基于**持久化的 lastSeq** 而非内存回滚，从崩溃点继续，不重放已落盘事件。
3. **并发写锁**：活跃会话落盘应串行化（per-session mutex），禁止多事件流交错用旧 seq 计数写批。
4. **resume 前表面自检**：`foldSurface` 后校验 assistant tool_calls ↔ tool/result 的 wire 顺序，违例时给出可操作的恢复路径（而非直接抛给 API）。

## 八、Synova 侧预防（操作层面）

- **升级/重启 DSH 前先停服务**：`launchctl bootout gui/$(id -u)/com.synova.dsh-web`，避免活跃会话写入被打断。
- **插件安装前备份活跃 session**：`cp` 整个 `~/.dsh/sessions/<workspace>/<session-id>/` 到备份目录。
- **数据资产备份铁律（铁律 0-4）延伸**：DSH session 不是 `data/synova.db`，不在 launchd 备份范围内——可考虑将活跃 session 纳入备份。

## 九、排查工具（可复现）

- `/tmp/repro2.mjs` — node 复刻 SessionLogScanner，`event.seq === events.length` 严格连续判定
- `/tmp/scan_all.mjs` — 全库扫描 seq 回退
- `/tmp/real_fold.mjs` — 真实 `foldSurface` + `deriveEventMessage` 折叠 surface，wire 顺序检查
- `/tmp/repair_correct.mjs` / `/tmp/repair_dangling.mjs` / `/tmp/repair_reorder.mjs` — 三步修复
- `/tmp/verify_final2.mjs` — 全量验证（loadStored/foldSurface/wire/fromRestore/Inbox）

## 十、备份位置

- `~/dsh-session-backup-20260821/` — 原始损坏文件 + `fixed-v2/`（去重+splice 修复后）
- `~/dsh-session-backup-20260821/fixed-v3/` — `a99f9faf-before-reorder.zstd`（重排前快照）
- `~/dsh-session-backup-20260822-021222/` — 第三次复发全库备份（56/56 sessions）
- `~/dsh-session-backup-20260822-021222/pre-repair-2/` — dc06ba76/dc1671bb 修复前快照 + `dc06ba76-repaired-v2-bad`（错误尝试）+ `dc06ba76-pre-v4`（v4 修复前）

---

## 十一、第三次复发（2026-08-22 晚）—— 前向 sourceEventSeqs 引用

### 11.1 现象

dc06ba76（SynovaAgent，43330 事件）再次损坏。与 dc1671bb 同时复发。`foldSurface` 抛：

```
sourceEventSeqs must reference earlier events: 1931 >= current seq 1688
```

**不是**第一次的 torn/seq-gap 错误（物理完整、seq 连续），而是 `sourceEventSeqs` 引用**前向事件**。dc1671bb 一并损坏（274900 事件）。

### 11.2 根因（新发现）

崩溃恢复的**内存 seq 回滚重放**导致文件出现 **8 个 seq 回退点**（@1577/1931/2188/2227/2288/2344/2402/2474，事件 seq 从高位回落重放）。物理重排后，**6 个 surface 事件**的 `sourceEventSeqs` 指向物理位置在**自己之后**的事件：

```
pos=1688 assistant/message sourceEventSeqs=[1454..1579, 1931..1936, 2188..2199, 2227..2264, ...]  ← 231 个引用
pos=1690 tool/result        fwd=[2366]
pos=1692 tool/result        fwd=[2368]
pos=1694 tool/result        fwd=[2402]
pos=1696 tool/result        fwd=[2404]
pos=1922 assistant/message  fwd=[2408..2413...]
```

即：**崩溃回滚把"未来"事件重放/拷贝到了"过去"位置，其 sourceEventSeqs 引用的源事件在物理顺序上晚于自己**。共 153 个前向引用。

**修 v2/v3 的教训**（本次排除的错误路径）：
- **v2 全局 seqMap 缺陷**：`Map.set(oldSeq, i)` 遇重复 seq（流 B 重放 1574-1577 与流 A 撞车）后写覆盖先写 → 引用映射到最后一次物理出现位置 → **引入 6 个前向引用**。
- **v3 动态重映射的盲区**：`seenSeq.get(ref) === undefined`（gap 分支）时**原样保留 ref**，不检查 `ref > i`——前向引用计数恒为 0，自检失效。因为重放段里被引用的旧 seq 在 seenSeq 中根本不存在，全走 gap 分支。

### 11.3 修复（`/tmp/repair_v4.mjs`）

**sourceEventSeqs 消毒**（零内容丢失，只清损坏的溯源元数据）：

1. 每个事件的 `sourceEventSeqs` 过滤为 `0 <= ref < event.seq`（合法 + 前向）
2. 去重（foldSurface 拒绝重复引用）
3. 结果为空且非 `assistant/message`（即 `tool/result`）→ `delete sourceEventSeqs`（空数组会被 foldSurface 拒绝，undefined 合法；assistant/message 空数组本就允许）
4. 写回 zstd 分帧（2000 行/帧）

**修复量**：修改 6 个事件，丢弃 153 个前向/非法引用，4 个 tool/result 置 undefined。**其余 43325 个事件逐字段 byte 级相同（对比验证 0 差异）**——上下文零丢失。

### 11.4 验证（DSH 原生 API）

| 检查 | dc06ba76 | dc1671bb |
|------|----------|----------|
| `loadStored()` | ✅ 43331 events | ✅ 274900 events |
| `foldSurface()` | ✅ 106 nodes, 0 replaces | ✅ 555 nodes, 0 replaces |
| wire 检查（tool_calls↔result） | ✅ 0 violation | ✅ 0 violation |
| `Session.fromRestore()` | ✅ events=43332 | ✅ events=274901 |
| `Inbox` 构造 | ✅ nextTurn=0, nextStep=0 | ✅ nextTurn=0, nextStep=0 |
| 全库扫描 56 session | ✅ 损坏 0 个 | — |

### 11.5 给 DSH 上游补充建议

5. **崩溃恢复重放必须保留 sourceEventSeqs 的时序语义**：内存 seq 回滚重放旧事件时，其 `sourceEventSeqs` 引用的仍是原时间线的"未来" seq——落盘后变成前向引用。恢复时应**重映射引用到重放后的实际位置**，或把重放事件的 sourceEventSeqs 一并回滚到重放点之前。
6. **foldSurface 报错信息带事件 type/物理位置**：`sourceEventSeqs must reference earlier events: 1931 >= current seq 1688` 无类型无位置，第三方难以定位（本次靠自写扫描才找到 pos=1688）。

### 11.6 本次修复工具

- `/tmp/repair_v3.mjs` — 动态重映射（有 gap 盲区，已废弃）
- `/tmp/repair_v4.mjs` — sourceEventSeqs 消毒 + 写回（本次采用）
- `/tmp/diag_scope.mjs` — 全文件前向引用扫描
- `/tmp/verify_content.mjs` — 修复前后内容逐字段对比（0 内容差异证明）
- `/tmp/verify_final3.mjs` — 全量原生验证（loadStored/foldSurface/wire/fromRestore/Inbox）

---

## 十二、第四次事件（2026-08-22 中午）—— 内存-磁盘 seq 分叉 + cancel 诱发回退

### 12.1 现象

修复重启后用户再次报告两个 session（dc1671bb K3 / dc06ba76）"卡住 + Load failed（internal）"。但**磁盘双 session 完全健康**（loadStored/foldSurface/前向引用全过），桌面 `/api/session.history` 也正常返回。差异在**服务端内存**：dc1671bb 在服务端内存里 `running=true`，卡死。

### 12.2 根因：内存 seq 回退分叉（非磁盘损坏）

磁盘真相（dc1671bb，296034 事件，seq 0..296033）：
```
seq 295427 approval/asked（turn 21 请求 bash 审批）
seq 295428-295430 tool/result / step/end / turn/end（审批被否决，turn 21 结束）
seq 295433-296030 turn 22 完整运行（bash kill + 结果 + 汇报）
seq 296031 tool/call bash → seq 296032 approval/asked → seq 296033 approval/decided（03:20）
```

而**服务端内存卡在 seq 295427**（turn 21 的 approval/asked）——从未看到审批决定、turn 21 结束、整个 turn 22。这是**崩溃恢复的 seq 回滚**再次作用：内存回滚到旧 seq 后 agent 卡在待审批状态，磁盘保留完整延续。内存落后磁盘 605 事件。

### 12.3 我调用 `session.cancel` 诱发 seq 回退（本次教训）

用 `/api/session.cancel` 解除卡死（正确思路），但服务端用**过期内存 seq**（295427）追加了 4 个 turn/end 事件（seq 295428-295431）到磁盘——与磁盘已有 seq 295428+ 内容冲突，造成 seq 回退：
```
@line 276067 expected 296034, got 295428   ← cancel 追加的回退事件
```

**教训：内存 seq 落后磁盘时，任何基于内存的写操作（cancel/prompt）都会以过期 seq 落盘 = 二次损坏。必须先重启对齐内存，再操作。**

### 12.4 修复

1. **剥掉 cancel 追加的 4 个回退事件**（python zstandard 多帧完整解压 → 校验最后 4 个正是 seq 295428-295431 → 剥掉 → 重编码 2000 行/帧写回）。磁盘恢复 296034 事件连续。
2. **重启 DSH**（必须：清掉过期内存）。新进程从磁盘加载 296033，正确续写 296034-296037 结束序列（无回退），dc1671bb=296038 事件。
3. 验证：dc1671bb loadStored ✅ 296038 / seq 连续 ✅ / foldSurface ✅ 617 nodes；dc06ba76 ✅ 154549；全库 50 session 损坏 0。

### 12.5 移动端 "Load failed（internal）" 定位

- "加载失败：{error}" 渲染在**移动端 session 列表视图**（mobile.js:15189），即 `session.list` 的移动 dispatch 失败被 catch 包装为 `{ code:'internal', message }`。
- 桌面 `/api/session.list` 全程正常；移动 `/m/api/session.list` 需配对 cookie（`/api/pair/issue` 在 loopback 绑定下返回 `lan-required`，无法复现）。判定为卡死期/崩溃期的瞬时服务端 dispatch 异常 + 移动端连接过期。

### 12.6 给 DSH 上游补充建议（第 4 条）

7. **会话内存加载必须对齐磁盘最新 seq**：崩溃恢复回滚后，加载会话时应以磁盘已持久化的 max seq 为基准续写，禁止在过期内存上继续 append（否则任何 cancel/prompt 都会以旧 seq 落盘 = 二次损坏）。建议恢复时校验 `内存 max seq <= 磁盘 max seq`，不等则重载。
8. **`session.cancel` 前检查 seq 对齐**：cancel/prompt 等写操作在落盘前应校验内存 seq 与磁盘持久化 seq 一致，不一致先 reload。

### 12.7 本次修复工具

- `/tmp/fix_cancel_py.py` — python zstandard 多帧解压 + 剥掉 cancel 回退事件 + 重编码写回
- `/tmp/scan_now2.mjs` — 权威 loadStored + seq 连续 + 前向引用 + foldSurface 验证
- `/tmp/verify_fresh_server.py` — 重启后桌面 /api 通道 session.list/history 验证

---

## §十三 安全重启验证 + packed-chunk 解析陷阱（2026-08-22 晚）

用户要求重启 DSH 且确保上下文零丢失。执行前用 **DSH 真实 `loadStored`** 做地面真相验证（原型实例化 `JsonlSessionPersistence`，绕过 cordis ctx 依赖，脚本 `/tmp/test_load.mjs`），结论：

- 全库 51 session **0 个 loadStored 失败**；dc1671bb=307572、dc06ba76=159034、4d509874=1347295 事件，seq 全部 `0..N-1` 严格连续，尾部均为干净 turn/end 或 end-seed。
- 备份 `~/dsh-session-backup-20260822-restart/`（60 文件、134M、shasum 全匹配）→ `launchctl bootout` 优雅停止（进程退出、端口释放）→ `launchctl bootstrap` 重启（PID 80941、HTTP 200）。重启后仅 4d509874 追加 1 个正常 `session/end-seed`，两个活跃 session 文件与备份逐字节一致。

**packed-chunk 解析陷阱（误报教训）**：DSH `packChunks:true` 把连续 `assistant/chunk` delta 打包成单行存储（读时经 `decodeStorageRecord` 解包成多事件）。**naive 逐行解析把"一行"当"一个事件"，导致数组下标 ≠ seq 的假阳性**——本会话曾据此误判 dc1671bb 有 547 处 seq 错位，真实 loadStored 证明文件一直健康。判定 seq 连续必须以 DSH 真实加载为准，或解析时复刻 `decodeStorageRecord` 解包逻辑。
