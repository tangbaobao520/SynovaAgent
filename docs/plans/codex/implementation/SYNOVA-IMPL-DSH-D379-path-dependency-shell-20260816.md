---
north-star:
  服务用户: 企业主（通过 strategy 专家视角看到组织路径依赖风险）+ FDE（部署后哨兵全量注册无报错）
  服务场景: 哨兵定时巡检时，path-dependency 哨兵（检测组织对特定技术栈/流程/合作模式的锁定风险）能真正注册并运行——从"有 manifest 无实现、注册报错"变成"45/45 全量注册 + 越阈告警"
  模块终态: path-dependency 哨兵端到端可用——manifest（契约冻结）指向的实现文件就位，loader 扫描 45/45 全注册，依赖评分越阈产出 warning/critical finding（产品线 07 持续监测验收点 7-2 转绿）
  对齐北星: PRODUCT-BRIEF.md §三.2「哨兵定时巡检」+ §四「无限扩展：加新哨兵=创建文件自动注册」+ §五「7 维度 D2 组织能力」
  完成标准: 入口 registerLoadedSentinels() 扫描 → 处理 path-dependency 动态 import detect.ts 成功 → 结果 45/45 注册无 entryPoint 报错 + detectPathDependency 三态正确
  当前进度: path-dependency 仅 manifest.json（entryPoint 指向不存在的 computes/detect.ts），registerLoadedSentinels 报错，45 活跃哨兵实际注册 44/45（D378 审计核实 + D379 派活 commit 8bcaa5ae）
---

# SYNOVA-IMPL-DSH-D379 — path-dependency 哨兵空壳补实现

> DSH 线 dev doc（📋 synova-devdoc 产出）| 哨兵切片（DSH 编码线领地）| 2026-08-16
> 实现角色：🛠 synova-dsh | 审计：K3（红线无豁免）

## 1. Authority Doc Verification

| 依据 | 出处 |
|------|------|
| 铁律 47/48 契约优先 + 测试非空壳 | CLAUDE.md §七 |
| 铁律 0-2 接线验收（WIRE CHECK） | CLAUDE.md §零 |
| 铁律 37 dead code 入仓库即违规 | CLAUDE.md §四 |
| D378 哨兵口径核实（path-dependency 空壳登记） | `docs/synova/coordination/AUDIT-FINDINGS-LEDGER.md` L153 |
| D379 派活 brief（spec 归 dev-doc 线） | `.claude/task-briefs/D379-path-dependency.md` |
| 派活 commit | `git log` 8bcaa5ae「dispatch path-dependency spec to dev-doc line」 |
| 分工 v4（哨兵切片归 DSH） | `DIVISION-CHARTER-v4.md` §1.1 |
| SPEC（历史接口签名） | `docs/specs/sentinels/path-dependency-sentinel.md` |

## 2. Problem Statement

`extensions/sentinels/path-dependency/` 只有 `manifest.json`，其 `entryPoint: "./computes/detect.ts"` 指向的 `computes/detect.ts` 不存在 → `registerLoadedSentinels()` 在动态 import 时报「entryPoint 不存在」，45 个活跃哨兵实际只注册 44/45。path-dependency 是 strategy 专家下唯一空壳（D378 审计核实），补实现即可让哨兵体系全量注册、且用户获得「路径依赖/锁定风险」这一监测维度。

## 3. Q0-Q4

### Q0 — 项目拼图 + 文件审计

**a) 项目拼图**：本任务在 L3 洞察层（哨兵体系，文件驱动扩展 `extensions/sentinels/`），属 DSH 编码线领地。是 D378 审计发现「path-dependency 空壳」的直接修复。

**b) 文件审计**（grep/read 验证）：
- `extensions/sentinels/path-dependency/manifest.json` — 存在，契约冻结：`entryPoint: "./computes/detect.ts"`、`exportKey: "pathDependencySentinel"`、`computes: ["detect-path-dependency"]`、`thresholds: { dependency_score: { warning: 0.4, critical: 0.7 } }`、`expert: "strategy"`、`layer: "capability"`
- `extensions/sentinels/path-dependency/computes/` — **不存在**（空壳根因）
- 历史实现参考：`docs/archive/sentinels/path-dependency/computes/detect.ts` — `detectPathDependency(store, orgId)` 算法（HHI-like 入度集中度 60% + 单一来源依赖 40% → dependency_score 0-1）
- loader 契约：`src/sentinel/sentinel-loader.ts:129-140` — `import(entryPath)` → `mod[exportKey]` 必须有 `check` 方法，返回 `SentinelFinding[]`

**c) 决策**：manifest 是接口契约（冻结），实现填空。参考第一性原理（manifest 即契约）。收敛。

### Q1 — 调研 / 决策链

**a) 业界最佳实践**：路径依赖/锁定风险监测的量化标准做法是**入度集中度（HHI）+ 单一来源依赖占比**——历史 `detect.ts` 已实现该算法（`docs/archive/sentinels/path-dependency/computes/detect.ts` L57-82），直接复用并适配新接口。

**b) 顶级团队做法（Anthropic 基线）**：compute 函数纯计算（不碰 DB 之外副作用）+ 哨兵对象做阈值判断（配置注入），与 `cash-runway` 的 aggregate/computes 分层一致。

**c) memory/ 教训**：M3 机制建成未接线（D329 P2-2）、铁律 37 dead code 禁止。**关键教训：manifest entryPoint 指向 `./computes/detect.ts`（非 `./aggregate.ts`），故不可照抄其他哨兵的 aggregate.ts 结构**——若创建 aggregate.ts 而不被 entryPoint 引用，即 dead code。

**决策参考系**：参考 Anthropic（compute/aggregate 分层）+ 第一性原理（entryPoint 决定入口文件）。结论：**只建 `computes/detect.ts` 一个入口文件**（export compute 函数 + 哨兵对象），**不建 aggregate.ts**（entryPoint 不指向它，建了即 dead code，违反铁律 37）。收敛。

### Q2 — 范围（正确的最简方案）

**做什么**（每文件一行）：
- `extensions/sentinels/path-dependency/computes/detect.ts` — 新建入口：export `detectPathDependency`（compute）+ `pathDependencySentinel`（哨兵对象，check 方法）
- `tests/sentinel/path-dependency-sentinel.test.ts` — 新建：三路径测试

**不做什么**（含文件路径）：
- 不改 `extensions/sentinels/path-dependency/manifest.json`（契约冻结：entryPoint/exportKey/thresholds 不动）
- 不建 `extensions/sentinels/path-dependency/aggregate.ts`（entryPoint 不指向它 → dead code，铁律 37 禁止）
- 不改 `src/sentinel/sentinel-loader.ts`（loader 自动扫描注册，无需改）
- 不改其他哨兵目录

### Q3 — 验收（入口 → 交互 → 结果）

- **入口**：`registerLoadedSentinels()` 扫描 `extensions/sentinels/path-dependency/`
- **处理**：动态 import `computes/detect.ts` → 取 `mod["pathDependencySentinel"]` → 校验 check 方法 → 注册
- **结果**：45/45 哨兵注册成功（无 path-dependency entryPoint 报错）；`detectPathDependency` 三态正确（正常/降级/边界）

### Q4 — 契约与测试

**契约**（铁律 47）：
```
@detectPathDependency compute 契约
  @input  — store: GraphStoreReader（L4 图读取器）, teamId: string, traversal?: GraphTraversal
            沿边统计入度（目标节点依赖集中度）+ 出度（单一来源依赖）
  @output — { value: number(0-1 依赖分), degraded: boolean, evidence: string[], ... }
  @degraded — 无图数据（0 节点或 0 边）→ degraded: true（不产出阈值 finding）
  @error  — catch 捕获 → degraded: true（铁律 24，不抛给 loader）

@pathDependencySentinel 阈值契约
  @input  — manifest.thresholds.dependency_score = { warning: 0.4, critical: 0.7 }
  @output — value >= 0.7 → critical finding；0.4 <= value < 0.7 → warning；< 0.4 或 degraded → 无 finding
  @error  — 数据不足（degraded）→ 返回 []，不误报 critical（铁律 31）
```

**测试三路径**（铁律 48）：
1. 正常路径：图有边数据，dependency_score 越过 0.7 → 产出 critical finding
2. 降级路径：空 store（无节点/边）→ degraded: true → 返回 []（无 critical）
3. 边界条件：单节点零边 → 归一化正确（不除零）；dependency_score 恰好 = 0.4 边界 → warning

## 4. Current State（grep/read 验证）

| 文件 | 现状 |
|------|------|
| `extensions/sentinels/path-dependency/manifest.json` | 存在（23 行），`entryPoint: "./computes/detect.ts"`、`exportKey: "pathDependencySentinel"`、`thresholds.dependency_score: {warning:0.4, critical:0.7}` |
| `extensions/sentinels/path-dependency/computes/` | **不存在**（空壳根因，`registerLoadedSentinels` 报「entryPoint 不存在」） |
| `src/sentinel/sentinel-loader.ts:129-133` | `existsSync(entryPath)` 失败 → `errors.push` → `continue`（该哨兵不注册） |
| `docs/archive/sentinels/path-dependency/computes/detect.ts` | 历史算法（HHI 入度集中度 + 单一来源依赖），可复用但接口需适配（旧 Promise 接口 → 新 GraphStoreReader 同步接口） |

## 5. What We Build（产出物 + 路径）

1. **`extensions/sentinels/path-dependency/computes/detect.ts`**（新建，唯一入口）：
   - export `detectPathDependency(store, teamId, traversal?)` — compute 函数，复用历史 HHI 算法（入度集中度 60% + 单一来源依赖 40%），适配新 `GraphStoreReader` 接口，返回 `{ value, degraded, evidence }`。
   - export `pathDependencySentinel` — 哨兵对象，`check(store, teamId, traversal)` 调用 `detectPathDependency`，按 `manifest.thresholds.dependency_score`（0.4/0.7）产出 `SentinelFinding[]`。
2. **`tests/sentinel/path-dependency-sentinel.test.ts`**（新建）— 三路径测试。

## 6. What We Don't Do（明确排除 + 文件路径）

| 排除项 | 文件 | 归属 |
|--------|------|------|
| manifest 契约 | `extensions/sentinels/path-dependency/manifest.json` | 冻结 |
| aggregate.ts（entryPoint 不指向） | `extensions/sentinels/path-dependency/aggregate.ts` | **不建**（dead code） |
| loader 改动 | `src/sentinel/sentinel-loader.ts` | 无需改 |
| 其他哨兵 | `extensions/sentinels/*` | 不动 |

## 7. Test Requirements

### L1 单元契约
- `detectPathDependency`：空图 → `degraded: true`；有边 → `value` 在 0-1 区间；单节点 → 归一化不除零。
- `pathDependencySentinel.check`：`value=0.8` → critical；`value=0.5` → warning；`value=0.2` → 无 finding；`degraded` → `[]`。

### L2a 接线
- `registerLoadedSentinels()` 动态 import 成功，`mod["pathDependencySentinel"]` 有 check 方法（45/45 注册）。

### L2b 降级
- 空图 → degraded → 返回 `[]`，有 `log.warn`（铁律 24/31），不误报 critical。

### L2c 边界
- 单节点零边（HHI 归一化分母=0）；`value` 恰好等于阈值边界（0.4/0.7）。

## 8. Wiring Verification

- **新 export**：`detectPathDependency`（compute）、`pathDependencySentinel`（哨兵对象）。
- **生产调用点**：`pathDependencySentinel` 由 `registerLoadedSentinels()` 通过 `manifest.exportKey` 动态 import 调用（真实传递，非测试调用）。`detectPathDependency` 被 `pathDependencySentinel.check` 生产调用。
- **验收 grep**：`grep -rn "pathDependencySentinel" extensions/sentinels/path-dependency/` 命中 detect.ts；`registerLoadedSentinels` 注册日志 45/45。

## 9. Architecture Layer

**L3 洞察层**（哨兵体系，文件驱动扩展）。`extensions/sentinels/path-dependency/` 属 L3，消费 L4 本体图数据（GraphStoreReader/traversal），产出 Finding。不跨层。

## 10. Completion Standard（可验证）

```bash
# DS1: 入口文件就位
test -f extensions/sentinels/path-dependency/computes/detect.ts            # exit 0
# DS2: export 契约满足（exportKey + check 方法）
grep -n "pathDependencySentinel" extensions/sentinels/path-dependency/computes/detect.ts  # 命中
# DS3: 45/45 注册（无 entryPoint 报错）
grep -rn "path-dependency" src/sentinel/sentinel-loader.ts | grep -v "entryPoint 不存在"  # 无残留报错
# DS4: 三路径测试全绿
npx vitest run tests/sentinel/path-dependency-sentinel.test.ts            # exit 0
# DS5: manifest 未改（契约冻结）
git diff --exit-code extensions/sentinels/path-dependency/manifest.json   # exit 0（无 diff）
```

## 11. Auth Doc References

- `.claude/task-briefs/D379-path-dependency.md`（派活 brief）
- `docs/synova/coordination/AUDIT-FINDINGS-LEDGER.md` L153（D378 空壳登记）
- `docs/synova/coordination/TASK-ROUTING.md` §四（D379 进行中）
- `docs/specs/sentinels/path-dependency-sentinel.md`（历史 SPEC 接口签名）
- `docs/SPEC-sentinel-adapters.md` L28（path-dependency 内置适配器定义）
- `docs/archive/sentinels/path-dependency/computes/detect.ts`（历史算法参考）
- `extensions/sentinels/path-dependency/manifest.json`（契约冻结）
- `.claude/PRODUCT-BRIEF.md` §三.2 / §四 / §五
