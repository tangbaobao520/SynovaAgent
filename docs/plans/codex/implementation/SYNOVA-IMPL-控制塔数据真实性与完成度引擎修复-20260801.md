<!--
  控制塔数据真实性与完成度引擎修复 — 研究 session 转交说明
  版本: v1.0 | 日期: 2026-08-01
  来源: 研究 session（基于代码审计证据）
  状态: 待 Dev Doc 排期 | 优先级: P0（盛和塾 8 月演示前必须恢复）
  范围: scripts/ + .codex/ 配置，不涉及 src/ 业务代码
-->

# 控制塔数据真实性与完成度引擎修复（转交开发 session）

> 一句话问题：控制塔目前显示的不是真实信息——13 个信号文件在工作区被删（git 里有备份），完成度引擎把 63 个任务全部判为 0.167 分。控制塔是"项目的自诊断系统"，数字失真比没有控制塔更危险（会产生错误决策）。

---

## 一、故障清单与根因（带证据）

### 故障 A：13 个信号文件工作区缺失

**现象**：`.codex/signals/` 下 13 个信号文件（gate-status.json、d272-push-wiring.json、d282-expert-migration.json 等）在工作区被删除（未提交），仅剩一个 152 字节的空壳 `.json`（component 为空）。

**证据**：
- `git status --short` 显示 13 个 ` D .codex/signals/*.json`（未提交删除）
- `git ls-tree HEAD .codex/signals/` 确认 HEAD 中全部存在 → 可恢复
- 生成方：[check-gates-v2.py](/D:/novis-backup-20260526/Novis/synova-agent/scripts/audit/check-gates-v2.py:36) 每次运行生成 gate-status.json；任务信号由 `emit-signal.py` 写入

**根因**：信号文件本质是**运行时生成物**，却入库跟踪 + 又被工作区删除，形成"git 里有、磁盘上没了"的中间态。恢复 ≠ 从 git checkout，正确做法是**重新生成** + 重新制定生成物入库策略。

### 故障 B：完成度引擎批量误判（63 任务全 0.167）

**现象**：`.codex/snapshots/20260730T085724Z/completion-scores.json` 中 systemScore=0.167，63 个任务全部"未找到对应源文件"。

**证据**：
- [self-diagnosis.py](/D:/novis-backup-20260526/Novis/synova-agent/scripts/audit/self-diagnosis.py:90) `find_source_file(d_id)`：扫描 src/ scripts/，只按**文件名是否含 d_id 字符串**匹配（如 "d53"）
- 真实源文件按功能命名（department-memory-store.ts、proactive-push.ts），文件名不含 D# → 几乎全部匹配失败
- task brief 的"文件审计"字段已声明 D#→源文件映射（如 [2026-07-31-auto.md](/D:/novis-backup-20260526/Novis/synova-agent/.claude/task-briefs/2026-07-31-auto.md) 中 "src/l4/department-memory-store.ts: 本任务新建"），但 `list_task_briefs()` 只提取标题与 Done 标准，不解析文件映射

**根因**：D#→源文件映射设计缺陷（该快照从首次生成起就是坏的，与 V4.5.1 修复无关）。

### 故障 C：两套完成度引擎并存、schema 冲突

**证据**：
- [self-diagnosis.py](/D:/novis-backup-20260526/Novis/synova-agent/scripts/audit/self-diagnosis.py) 输出 systemScore/totalTasks/tasksEvaluated/results（含 d_id）
- [completion-engine.py](/D:/novis-backup-20260526/Novis/synova-agent/scripts/audit/completion-engine.py:375) 读 gate-status.json，缺失时"空运行"；输出 overall/completionByCriteria/dimensions
- 两脚本都写 completion-scores.json → 互相覆盖、消费者（views/completion.py）无法判断数据源

### 附带缺口（同属"控制塔真实信息"范围）

- `.codex/dependency-graph.json` 未持久化（D267 仅内存构建）→ 视图 4 数据源缺失
- `.codex/checkpoints/` 目录为空（D260 代码就绪未触发）

---

## 二、修复要求（分层）

### L1 立即恢复（演示前必做）

| # | 动作 | 验收 |
|---|------|------|
| 1.1 | 重跑 `python scripts/audit/check-gates-v2.py` | gate-status.json 存在、时间戳=当前、17 门禁全量真实判定 |
| 1.2 | 重跑 `python scripts/audit/self-diagnosis.py` | 生成新快照，不再出现批量"未找到对应源文件" |
| 1.3 | 生成/恢复任务信号文件（重跑 emit-signal 或明确策略） | .codex/signals/ 各组件信号完整，时间戳新鲜 |
| 1.4 | 验证控制塔 5 视图渲染真实数据 | 打开 /cockpit，V1–V5 无空数据、无假百分比 |

### L2 引擎修复（治本）

| # | 动作 | 验收 |
|---|------|------|
| 2.1 | self-diagnosis.py 支持从 task brief"文件审计"字段解析 D#→源文件映射；无 brief 时降级为文件名匹配+明确标注 | 63 任务中 code_exists 通过率 ≥90%（≥57 个找到真实源文件路径） |
| 2.2 | 统一两套引擎：明确唯一生成方与 completion-scores.json 的单一 schema（契约优先，先定义 schema 再改） | 全仓只有一份 completion-scores 生成器；schema 有版本号 |
| 2.3 | completion-engine 数据源缺失时输出 degraded + 原因，禁止"空运行"产出正常格式的垃圾数据 | 缺 gate-status.json 时输出 degraded:true，不写假完成度 |

### L3 防再犯机制（控制塔意义的保障）

| # | 动作 | 验收 |
|---|------|------|
| 3.1 | 视图数据新鲜度门禁：渲染前校验数据源存在 + 时间戳 <24h，否则视图显示 degraded + 原因 | 模拟删除 gate-status.json → V2/V3 视图显示 degraded 而非空/旧数字 |
| 3.2 | 生成物策略落地：信号文件与快照统一为"不入 git、由脚本重新生成"或"入 git、脚本校验一致性"之一，禁止中间态 | 仓库无"git 跟踪但工作区被删"的信号文件 |
| 3.3 | 测量系统自检：完成度全 0/全 0.167、信号全空 → 控制塔红灯（模拟测试） | 空数据场景下控制塔亮红灯并给出原因 |
| 3.4 | 附带：dependency-graph.json 持久化（D267 收尾）与 checkpoints 写入（D260 触发） | 视图 4 有数据；checkpoints 目录非空 |

---

## 三、Done 标准（Dev Doc 写 task brief 时逐条引用）

- [ ] DS1: gate-status.json 重新生成，时间戳新鲜，17 门禁真实判定
- [ ] DS2: self-diagnosis 重跑后 code_exists 通过率 ≥90%，无一任务因"文件名不含 D#"误判
- [ ] DS3: 完成度引擎唯一化，schema 有版本号，无两脚本互相覆盖
- [ ] DS4: 数据新鲜度门禁生效（含测试：缺数据 → degraded）
- [ ] DS5: 信号文件生成物策略落地，无"git 有、磁盘无"中间态
- [ ] DS6: 测量系统自检红灯（含测试）
- [ ] DS7: tsc 零错误、vitest 全量零失败、新 export 有生产调用方（接线审计）、as any=0

---

## 四、约束

1. 只改 `scripts/` 与 `.codex/` 配置；**不碰 src/ 业务代码**（方向监测/中层进化接线是独立任务，另行排期）
2. 不破坏现有 5 视图与 `generate-dashboard.py` 路由（views/*.py 模块化保持不变）
3. 契约优先（铁律 47）：先定义 completion-scores.json 统一 schema，再改生成器
4. 测试非空壳（铁律 48）：每个新函数有 expect() 断言，覆盖正常/降级/边界
5. 降级必须可见（铁律 24/31）：任何缺失数据场景输出 degraded + 原因，禁止静默

---

## 五、建议执行顺序

L1（立即恢复，半天）→ L2（引擎修复，1 天）→ L3（防再犯机制+附带缺口，1–2 天）。总计约 2.5–3.5 天，盛和塾演示前完成。
