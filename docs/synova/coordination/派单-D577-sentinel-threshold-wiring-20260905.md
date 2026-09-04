# 派单 — D577 哨兵阈值配置真实挂载（死代码转活，7-2/8-1/10-3 转绿路径）

> 派单: CTO | 2026-09-05 | 认领: dev-doc session（本单 = 给 dev-doc 的 spec 任务定义）
> 来源: K3 全链路审计严重问题-1（P0）+ 产品进度 7-2(rejected)/8-1(rejected)/10-3(uncommitted)
> 创始人裁决引用: 10-3 note「K3 已给转绿路径：一行修 manifest 起步」
> DSH 借鉴核查（SOP 〇b 三步）: ✅ **无 DSH 借鉴**——本任务是 Synova 自研 extensions/sentinels 体系的内部缺陷修复（配置值注入链断裂），DSH 无对应机制可借鉴（DSH 无哨兵体系）。写明原因防猜测。
> 上一轮教训引用: M3「机制建成未接线」（manifest 存在但阈值从不流入 finding 判定）；铁律 9（阈值是关键定义，改完全仓 grep 传播）；CT-53 教训（声称验证过的必须是验收点级证据）

## 一、缺陷精确画像（CTO 已物理核实，2026-09-05）

### 断裂链路（三段断在两处）

```
manifest.json thresholds ✅ 存在（45 哨兵全有，如 customer-demand-shift: churn_rate.warning=0.1/critical=0.2）
    ↓ ❌ 断点1
aggregate.ts check() 收到 manifest（sentinel-loader.ts L143 注释自证「阈值 finding 依赖 this.manifest」）
    但 aggregate 内部**硬编码字面量**判定：customer-demand-shift/aggregate.ts L50 `> 0.4`、L55/L77 `> 0.3/0.2/0.1`
    （K3 指认 L50,77：阈值硬编码 0.4/0.3/0.2/0.1，不读 manifest；头部注释声称"比较 manifest.json 阈值"不实）
    ↓ ❌ 断点2（结果）
用户改 manifest.json 阈值 → **findings 判定完全不变**（死代码语义）→ UI/产品层无法调阈值
    且 sentinel/runner.ts L1028-1063 已有 updateThreshold 按 orgId 存 memStore 的机制——但 aggregate 不消费它
```

### 规模
- `extensions/sentinels/` 下 **45 个哨兵** 有 manifest.json（thresholds 字段全有）
- 其中 **26 个 aggregate.ts** 含硬编码数字阈值（0.4/0.3/0.2/0.1 等——grep 粗筛，精确数以逐文件核对为准）
- 不是全部 26 个都需要改：仅改**有 thresholds 字段的哨兵**；无 thresholds 的哨兵不涉及

### 附加缺陷（K3 同报，本单一并修）
- `aggregate.ts:29` @deprecated 的 DEPLOYS traverse 仍在门控——无 DEPLOYS 边时**静默 return []**（静默降级，铁律 24/31 违规）

## 二、dev-doc spec 要回答的问题（本单核心）

1. **阈值注入的契约**：aggregate 的 `check(ctx)` 收到的 SentinelContext 要不要加 `thresholds` 字段（从 manifest 注入 + memStore 覆写合并）？还是 aggregate 自己从 `this.manifest.thresholds` 读？——**CTO 建议**：注入到 SentinelContext（一处注入所有 aggregate 受益，45 哨兵不改签名），spec 权衡后定案并给 JSDoc 契约（铁律 47）。
2. **逐哨兵改造的波及面**：26 个 aggregate 逐个把硬编码字面量换成 `ctx.thresholds.xxx.warning/critical`——**必须逐个核对每个哨兵的 manifest.thresholds key 与 aggregate 内的语义对应**（如 churn_rate ↔ 流失率判定），key 对不上 = 配置写了也白写。spec 要有 **哨兵→thresholds key→aggregate 判定位置** 的三方对照表。
3. **旧值的兼容语义**：manifest 里已有正确默认值（churn_rate.warning=0.1）→ 替换后行为不变（蓝绿可证）；如某哨兵 manifest 无对应 key → fallback 到现硬编码值并 log.warn（不静默，铁律 24）。
4. **DEPLOYS 静默 return [] 的修复**：按铁律 24/31，无边时返回 degraded 标记 + log.warn，不静默空数组。
5. **产品线验收点映射**：修完哪个哨兵就能转绿哪个点——spec 给 7-2（全量挂载无死代码）/8-1（阈值读 manifest）/10-3（资本循环阈值真实触发）三点各自的 verify 命令（物理可复现：改 manifest 阈值 → 重跑哨兵 → findings 变化断言）。

## 三、写集预估（spec 修正后定稿）

| 区域 | 文件 | 操作 |
|---|---|---|
| 核心机制 | src/sentinel/sentinel-loader.ts（thresholds 注入 SentinelContext） | 修改 |
| 核心机制 | src/sentinel/runner.ts（memStore threshold 与 manifest 合并语义；L1028-1063 机制对齐） | 小改 |
| 逐哨兵 | extensions/sentinels/*/aggregate.ts（26 个中涉及 thresholds 的） | 逐个改判定源 |
| 修复附带 | extensions/sentinels/customer-demand-shift/aggregate.ts（DEPLOYS 静默降级修复） | 修改 |
| 测试 | tests/sentinel/（阈值注入生效断言 + 改 manifest → findings 变化 + DEPLOYS degraded） | 新增/修改 |
| 文档 | 对应哨兵 manifest.json 不改（值不变，只是开始被读） | 零改动 |

禁碰：scripts/audit/；src/server.ts、src/config.ts（D575 领地，零重叠并行）；electron/；**不改 manifest.json 的值**（本任务只让值生效，不改值——改值是产品调参另事）。

## 四、与并行任务的关系
- D575（LLM 配置）写集 = src/services+routes+config.ts+renderer → **零重叠，可并行**
- spec 交付后编码实现也独立（extensions/ + src/sentinel ≠ src/routes）

## 五、验收（spec 细化为 DS 项，以下是物理锚点）
1. `POST`/脚本改 customer-demand-shift manifest 的 churn_rate.critical 0.2→0.9 → 重跑哨兵 → 原 critical finding 消失（阈值生效物理证明）
2. 改回 0.2 → critical finding 恢复
3. `grep -rn "0\.4\b" extensions/sentinels/customer-demand-shift/aggregate.ts` 零命中（硬编码清除证明；其余哨兵逐个同标准）
4. runner.ts L1028 updateThreshold 写入的 memStore 值 → 下一次 check() 生效（动态调参闭环）
5. DEPLOYS 无边场景 → 返回 degraded + log.warn（非静默空数组）
6. 全量 vitest tests/sentinel/ 绿 + tsc 28=28 基线
7. 7-2/8-1/10-3 三点各产出验收点级 evidence（引用上述 1-5 的实测输出）

## 六、交付要求
- spec: `docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D577-sentinel-threshold-wiring-20260905.md`（契约优先 §写集表/DS 清单/测试三路径）
- 随附编码指令（synova-dsh 预设，分支 `feat/d577-sentinel-threshold-wiring`）
- spec 入库单 PR + task-state/D577.json spec_done
- 编码交付后 K3 审计（按创始人指示：代码产出后统一审）
