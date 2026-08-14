<!--
  Synova 权威文档14 | 第三章：集成测试契约与防误报机制
  版本: v1.0 | 日期: 2026-07-14 | 作者: Synova 研究组
  定位: 施工文档——任何文档定义的"契约"被变更时，系统自动检测"什么东西会坏"
-->

# 第三章：集成测试契约与防误报机制

> 核心问题：当任何一份文档定义的"契约"被变更时，系统如何自动检测"什么东西会坏"——且不产生大量假阳性告警？
> 本章产出：11项集成契约矩阵 + 三级告警精确定义 + check-integration.sh三层检查分层

---

## 3.0 设计原则

**契约是什么？** 在Synova的13+1文档体系中，"契约"是两个独立模块之间的接口约定。42条边的edgeId在50个哨兵的edges字段中被引用——这是一个契约。compute的contractId在Skill的dependencies.computes中被引用——这是另一个契约。

**为什么防误报是关键？** 一个假阳性告警 -> 工程师花30分钟排查 -> 发现是误报 -> 下次忽略同类告警 -> 真告警被淹没。防误报机制必须是门禁系统设计的第一优先级，不是事后添加的过滤层。

三个设计原则：
1. **精确ID匹配优先**：contractId === "COMPUTE-BREAK-EVEN-v1"，不做模糊语义匹配。如果ID不在统一注册表中 -> error。如果名称相似但ID不匹配 -> 不算（避免过度告警）。
2. **统一注册表作为权威来源**：所有ID注册到 system-registry.json 中。L1检查只对注册表的键做精确查找。不存在就是不存在，不猜测。
3. **分层检查，层层收紧**：L1零假阳性（文件存在+格式正确），L2极少假阳性（交叉引用存在性），L3允许人工判断（语义等价）。

---

## 3.1 集成契约矩阵（11项）

| # | 契约项 | 检查方法 | 告警级别 | 失败影响 | 如何修复 |
|---|--------|---------|---------|---------|---------|
| 1 | 42边ID是否全部在50哨兵的edge引用中存在 | grep哨兵manifest的edges字段，cross-check 42边清单（E-01~E-42） | error | 哨兵找不到数据源 -> 阻塞启动（Phase 2a SentinelLoader失败） | 在统一边注册表中补充缺失的边ID，或修正哨兵manifest中的edge引用 |
| 2 | compute的contractId是否在Skill/Tool的dependencies中存在 | grep Skill manifest的dependencies.computes，cross-check compute contractId列表（COMPUTE-*-vN） | error | Skill无法执行 -> 阻塞Playbook step（运行时失败，非启动时） | 更新Skill manifest的computes字段，确保每个contractId在compute注册表中存在 |
| 3 | 专家提示词PLACEHOLDER是否在Playbook的contextRequirements中声明 | 解析提示词模板占位符列表，cross-check Playbook YAML的contextRequirements字段 | warning | 占位符可能无法填充 -> 不阻塞启动，但该专家推理输出含未替换占位符 | 在Playbook YAML中添加缺失的contextRequirements条目，或在提示词模板中移除不再使用的占位符 |
| 4 | 哨兵引用了预留边（尚未正式激活） | 哨兵edges字段中出现未在42边清单中但标注为"planned"的边ID（如E-43+） | warning | 哨兵暂不可用 -> 不阻塞启动，GA面板标记"部分哨兵待激活" | 将预留边正式纳入42边体系，或从哨兵edges中移除预留引用 |
| 5 | ME概念映射到42边的完整性 | 逐一检查ME规范（权威11）的语义映射表中的边ID是否在42边体系中存在 | info | 兼容性提示 -> 不阻塞，供ME规范维护者参考 | ME规范维护者审核映射表，补充缺失映射或标记为"无直接映射" |
| 子循环配置中引用的edgeId在42边体系中存在 | 扫描cycles/目录下所有*.cycle.json的edges.*.edgeId vs 42边清单 | error | 循环配置无效→溢出计算无法执行→拦截该循环注册 |
| 子循环溢出公式每个参数具有明确source(sourceId) | 检查overflowParams数组中每个参数的source和sourceId字段为非空，且sourceId指向已知注册表 | warning | sourceId为空→参数返回null→该子循环溢出不完整→部分仪表盘列为空 |
| CycleLoader依赖项就绪（42边/compute/哨兵在CycleLoader注册前完成初始化） | 检查启动序列中CycleLoader(Phase 2e)在SentinelLoader(Phase 2a)和compute注册(Phase 3)之后执行 | error | CycleLoader提前启动→引用未就绪→依赖校验失败→循环标记degraded |
| 6 | 增长导航Goal的measurement.sourceId存在性 | 检查Goal规范（权威13）中所有measurement.sourceId是否指向存在的哨兵/compute/边参数 | error | Goal无法追踪 -> 阻塞Goal注册（Phase 5 CronScheduler） | 修正Goal定义中的sourceId，确保指向已注册的哨兵ID/compute contractId/边参数名 |
| 7 | Playbook steps[].tool是否在ToolRegistry中存在 | 检查每个Playbook YAML的steps数组，提取tool字段，cross-check Tool原子清单（权威12 §5） | error | Playbook step执行失败 -> 阻塞Playbook加载（Phase 2c） | 更新Playbook YAML的tool字段，或注册缺失的Tool |
| 8 | Skill manifest的dependencies.sentinels引用是否在sentinel-registry中存在 | 递归检查Skill manifest.json的dependencies.sentinels数组，cross-check sentinel-registry | warning | Skill依赖的哨兵信号缺失 -> 不阻塞Skill加载，但运行时可能降级 | 检查sentinel-registry中该哨兵是否active；若已DEPRECATED->更新Skill依赖引用新哨兵 |
| 9 | 因果链YAML的edgeSequence[].edgeId是否在42边体系中有效 | 扫描causal-chains/*.yaml文件，提取所有edgeId，cross-check E-01~E-42清单 | error | 因果链加载失败 -> CausalChainRegistry中该链标记degraded | 修正YAML中的edgeId拼写错误或更新到最新边ID |
| 10 | 因果链YAML的sentinels引用是否在sentinel-registry中存在 | 扫描causal-chains/*.yaml的sentinels字段，cross-check sentinel-registry | warning | 因果链关联的哨兵信号缺失 -> 链的Trace/Simulate/Explain输出缺哨兵上下文 | 检查哨兵是否已合并/重命名/DEPRECATED；更新因果链YAML |
| 11 | Playbook contextRequirements中声明的edges/computes/sentinels是否存在 | 检查Playbook YAML的contextRequirements.edges/computes/sentinels数组，cross-check 42边清单/compute注册表/sentinel注册表 | warning | Playbook执行时上下文变量缺失 -> 不阻塞加载，运行时降级 | 更新Playbook YAML中的contextRequirements，使其与注册表一致 |

---

## 3.2 告警级别精确定义

### 3.2.1 error

**定义**：引用目标不存在，且该依赖为硬依赖。系统启动时，任何error必须全部清除才能完成启动。

**行为**：
- Phase 0-5中每个Phase结束时自动运行该Phase的集成检查（check-integration.sh --phase=N）
- error -> 终止当前Phase -> 回滚该Phase到上一个已知良好状态 -> 系统日志记录error详情
- 启动流程中error未清除 -> HTTP/MCP服务不启动 -> API返回503
- 不影响已成功初始化的其他Phase（Phase 2的契约error不会回滚Phase 1的GraphStore）

**示例**：
- 哨兵manifest引用了E-43（42边体系中不存在）-> error -> Phase 2a SentinelLoader该哨兵标记degraded
- Skill manifest引用了COMPUTE-NPV-v99（compute注册表中不存在）-> edge（但若该Skill不在MVS中则降级为warning）-> Phase 2b SkillLoader该Skill标记degraded

### 3.2.2 warning

**定义**：引用目标可能无法正确工作，但不阻断启动。

**行为**：
- 允许Phase完成启动 -> 记录WARN日志 -> 推送到GA面板（系统健康仪表盘 - "集成契约"卡片）
- 写入系统健康日志（system-health.log），格式：`[WARN] ContractViolation: {contractId} | {detail} | {timestamp}`
- warning积累触发定期健康审查（每周一自动生成"契约健康周报"）
- 同一契约项连续3次warning -> 自动升级为error（防止warning被长期忽略）

**示例**：
- 专家提示词中的PLACEHOLDER在Playbook contextRequirements中未声明 -> warning -> 运行时可能填充失败但不阻断
- 因果链YAML中引用的哨兵已被合并（如competitive-dynamics已合并为competitive-position）-> warning -> 建议更新YAML

### 3.2.3 info

**定义**：兼容性提示——引用有效，但"最佳实践"可能建议使用更新版本或不同路径。

**行为**：
- 不推送到GA面板 -> 仅在开发者日志中记录（developer-console.log）
- 不触发任何阻断、不写入system-health.log
- L3语义检查的结果作为info级别记录到文档合规报告
- 供ME规范维护者、权威文档作者定期审查

**示例**：
- ME概念X通过E-33 + E-36的组合表达42边体系的"竞争位势"概念 -> info -> 映射有效但不是1:1映射
- Playbook使用了哨兵的旧ID但新ID也存在 -> info -> 建议迁移到新ID

---

## 3.3 检查脚本分层机制（check-integration.sh）

### 3.3.1 L1 结构性检查（<1分钟，零假阳性）

**检查项**：
1. 文件存在性：42边定义文件、50哨兵manifest.json、61个compute的contractId注册文件、35个Skill的manifest.json、21个Playbook YAML -> 全部存在
2. JSON/YAML格式正确性：所有manifest.json通过JSON.parse校验；所有YAML通过YAML.parse校验
3. 引用ID在已知注册表中存在：从system-registry.json加载已知ID全集，对所有manifest中的引用做精确字符串匹配（===）

**零假阳性保证**：system-registry.json是唯一的权威ID来源。如果ID不在注册表中 -> error。没有任何启发式或模糊匹配。如果引入新模块时忘记更新system-registry.json -> L1会正确报告error（这是正确行为——不是假阳性）。

**system-registry.json结构**：
```json
{
  "version": "1.0.0",
  "lastUpdated": "2026-07-14",
  "edges": ["E-01","E-02",..."E-42"],
  "sentinels": ["capital-health","competitive-position","competitive-moat","margin-health","sentinel-breakeven","sentinel-operating-leverage","sentinel-price-elasticity","sentinel-npv-negative","sentinel-survival-margin","sentinel-csf-profile","..."],
  "computes": ["COMPUTE-BREAK-EVEN-v1","COMPUTE-DOL-v1","COMPUTE-PRICE-ELASTICITY-v1","COMPUTE-NPV-v1","COMPUTE-MARGINAL-COST-v1","COMPUTE-HHI-v1","COMPUTE-LEARNING-CURVE-v1","COMPUTE-AGENCY-COST-v1","COMPUTE-SURVIVAL-MARGIN-v1","COMPUTE-CSF-PROFILE-v1","..."],
  "skills": ["acquire-financial-data","analyze-break-even","diagnose-cashflow-health","..."],
  "playbooks": ["finance-profitability-root-cause","enterprise-full-diagnosis","..."],
  "causalChains": ["cc-capital-01","cc-capital-02","...","cc-rule-01"],
  "experts": ["strategy","org","finance","tech","marketing","action","business_model","knowledge"],
  "tools": ["tool_cross_validate","tool_trace_lineage","tool_cashflow_decompose","computeDOL","computeBreakEven","..."]
}
```

### 3.3.2 L2 交叉引用检查（<3分钟，极少假阳性）

**检查项**：
1. A引用的B是否在B的注册表中存在：哨兵edges中的E-xx -> 42边注册表；Skill dependencies.computes中的COMPUTE-xx -> compute注册表；Playbook steps.tool -> Tool注册表
2. 依赖版本兼容性：Skill dependencies.skills中的版本范围（">=1.0.0 <2.0.0"）是否被实际加载的Skill版本满足
3. 循环依赖检测：Skill A依赖Skill B，Skill B依赖Skill A -> 拒绝加载

**假阳性场景和处理**：
- 可能出现假阳性：引用了一个在文档中定义但未被L1的system-registry.json索引的ID。处理方式：更新system-registry.json——这是注册表不完整，不是检查逻辑错误。
- 版本范围检查可能出现假阳性：Skill声明依赖 ">=1.0.0 <2.0.0"，实际版本是1.0.0-beta.1（SemVer预发布）。处理方式：预发布版本在注册表中标注prerelease=true，版本检查忽略预发布标签。

### 3.3.3 L3 语义检查（手动触发，不纳入自动化）

**检查项**：
1. 语义等价性验证：ME概念X是否被42边体系正确覆盖？如果ME规范将"SwitchingCosts"映射到E-31，但E-31的transfer_function中不包含switching_cost参数 -> 映射不完整
2. 命名一致性：同一物理概念在不同文档中的名称是否存在无意义的差异（如"断裂点"vs"循环"vs"介入节点"）
3. 文档合规：新文档是否引用了本字典的标准术语（第五章）

**触发方式**：
- 手动执行：`bash scripts/workflow/check-integration.sh --level=L3`
- 权威文档更新时：PR review阶段由文档维护者手动触发
- 结果记录到文档合规报告（docs/compliance/contract-compliance-YYYYMMDD.md），不阻断系统运行

---

## 3.4 统一注册表更新流程

当新增模块（新边/新哨兵/新compute/新Skill）时，必须同步更新system-registry.json。缺失注册 = L1 error = 启动阻断。

**更新流程**：
1. 开发者新增模块后，运行 `npm run registry:sync` -> 自动扫描extensions/和skills/目录 -> 增量更新system-registry.json
2. pre-commit hook检查：system-registry.json是否有未staged的变更 -> 如果有已变更的模块文件但registry未更新 -> 阻断commit
3. CI pipeline运行 `check-integration.sh --level=L1+L2` -> 零error通过

---

> **版本历史**：v1.0 — 2026-07-14 — 初始版本。11项集成契约矩阵 + 三级告警精确定义 + L1/L2/L3检查分层 + system-registry.json规范。
