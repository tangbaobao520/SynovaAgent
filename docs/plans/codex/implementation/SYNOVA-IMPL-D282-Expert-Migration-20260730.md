<!--
  SYNOVA-IMPL-D282: 专家迁移 9→7 — registry清理 + 目录归档
  状态: dev doc | 2026-07-30
  权威文档: 开发者任务地图 v2.0 N2 + 专家审计报告 §六 §七
  依赖: D269 (5专家金字塔) D236 (专家restructure) — 新专家RULES.md已就位
  并行: D281, D283 — 零共享文件
-->

# D282: 专家迁移 9→7 — registry 清理 + 目录归档

## 1. 权威文档引用

**来源**: [开发者任务地图 v2.0](D:\novis-backup-20260526\Novis\synova-agent\docs\synova\research\权威文档17-自诊断系统-20260729\权威文档17-开发者任务地图-v2-0-20260730.md) N2

> registry 移除7(strategy/org/finance/marketing/action/business_model/knowledge) + 新增5
> (capital-cycle/customer-cycle/talent-cycle/finance-structure/competitive-strategy)。旧目录→_deprecated/

**来源**: [专家体系审计最终报告 §六](D:\novis-backup-20260526\Novis\synova-agent\docs\synova\research\跨文档一致性审计-20260727\SYNOVA-RESEARCH-专家体系全面审计最终报告-修正版-20260727.md)

> 最终 7 位配置: host + 资本循环(finance+business_model) + 客户循环(marketing+strategy)
> + 人才循环(org+knowledge) + 技术(tech) + 财务结构(P0) + 竞争战略(P0)

**来源**: [专家体系审计最终报告 §七](D:\novis-backup-20260526\Novis\synova-agent\docs\synova\research\跨文档一致性审计-20260727\SYNOVA-RESEARCH-专家体系全面审计最终报告-修正版-20260727.md)

> 迁移清单: finance+business_model→capital-cycle, marketing+strategy→customer-cycle,
> org+knowledge→talent-cycle, action→host工具函数, tech→保留

## 2. 代码审计——现状

### 2.1 Registry 当前 (9条目)

```
experts: host, strategy, org, finance, marketing, tech, action, business_model, knowledge
```

### 2.2 5位 cycle 专家 (有目录+manifest+RULES.md，无registry条目)

```
expert/capital-cycle/manifest.json      813 bytes ✅
expert/customer-cycle/manifest.json     858 bytes ✅
expert/talent-cycle/manifest.json       884 bytes ✅
expert/finance-structure/manifest.json  485 bytes ✅
expert/competitive-strategy/manifest.json 492 bytes ✅
```

### 2.3 历史代码处理方案

| 旧专家 | 去向 | 处理 |
|--------|------|------|
| strategy | → customer-cycle (合并) | 目录→_deprecated/strategy/ |
| org | → talent-cycle (合并) | 目录→_deprecated/org/ |
| finance | → capital-cycle (合并) | 目录→_deprecated/finance/ |
| marketing | → customer-cycle (合并) | 目录→_deprecated/marketing/ |
| action | → host 工具函数 | 目录→_deprecated/action/ |
| business_model | → capital-cycle (合并) | 目录→_deprecated/business_model/ |
| knowledge | → 废弃 | 目录→_deprecated/knowledge/ |

**删除 vs 归档**: 旧专家目录**不删除**——移入 `expert/_deprecated/`。后续需要回滚或参考历史规则时可恢复。

### 2.4 旧专家代码引用检查

`src/expert-file-loader.ts` 加载专家时扫描 `expert/` 目录并读取 registry 条目。registry 中移除旧条目后，旧专家的 RULES.md 不再被自动加载——它们只存在于 `_deprecated/` 中作为历史档案。

## 3. 实现方案

### 3.1 写集 (1 文件修改 + 7 目录移动)

| 操作 | 内容 |
|:---:|------|
| **修改** | `expert/expert-registry.yaml` — 移除7旧条目 + 新增5新条目 |
| **新建** | `expert/_deprecated/` 目录 |
| **移动** | 7个旧专家目录移入 `_deprecated/` |
| **验证** | 启动后 npm run validate-expert-config 无断裂 |

### 3.2 目标 Registry (7条目)

```yaml
experts:
  host:                    # ← 保留
    enabled: true
    background: false
    ...
  capital-cycle:           # ← 新增 (finance+business_model合并)
    enabled: true
    background: true
    ...
  customer-cycle:          # ← 新增 (marketing+strategy合并)
    enabled: true
    background: true
    ...
  talent-cycle:            # ← 新增 (org+knowledge合并)
    enabled: true
    background: true
    ...
  tech:                    # ← 保留
    enabled: true
    background: true
    ...
  finance-structure:       # ← 新增 (P0扩展, 不始终激活)
    enabled: true
    background: false
    trigger: P0
    ...
  competitive-strategy:    # ← 新增 (P0扩展, 不始终激活)
    enabled: true
    background: false
    trigger: P0
    ...
```

### 3.3 新条目工具映射

从对应旧 expert 的 manifest.json 和 expert-tools.ts 中提取工具列表，粘贴到 registry 的新条目下。财务结构(P0)和竞争战略(P0)标记 `background: false, trigger: P0`——不会在每次诊断中激活，仅在 direction-monitor 检测到持续偏离时触发。

## 4. 测试要求

| 层 | 类型 | 数量 | 覆盖 |
|:---|------|:---:|------|
| L1 | bash validate | 1 | validate-expert-config.sh 零断裂引用 |
| L2a | 启动验证 | 1 | npm run dev 后 expert registry 加载成功 |

无 TypeScript 代码变更——tsc 不涉及。

## 5. 接线要求

| 操作 | 影响范围 | 验证 |
|------|---------|------|
| registry 移除旧条目 | `src/expert-file-loader.ts` | 启动不报 broken reference |
| registry 新增5条目 | 同上 | grep 新 expert ID 在 loader 日志中出现 |
| 目录移入 _deprecated | `src/agent/` 全部专家调用方 | 旧 ID 不再出现在 dispatch 日志中 |

## 6. 完成标准

1. expert-registry.yaml 仅含 7 条目
2. 旧 7 个专家目录在 `expert/_deprecated/` 中
3. 5 个新专家在 registry 中且有有效工具列表
4. validate-expert-config.sh 通过
5. npm run dev 启动无崩溃
6. expert-file-loader 仅加载 registry 中的 7 位专家

## 7. 自检清单

- [x] 已读专家审计报告 §六 (最终7位配置表)
- [x] 已读专家审计报告 §七 (迁移清单)
- [x] 已验证 5位 cycle 专家 manifest.json 存在且非空
- [x] 已验证 registry 当前 9 条目 (grep expert-registry.yaml)
- [x] 已检查旧专家代码引用 (src/ grep action/business_model/knowledge — 仅 expert-file-loader.ts)
- [x] 不是凭记忆
- [x] 不用 --no-verify
