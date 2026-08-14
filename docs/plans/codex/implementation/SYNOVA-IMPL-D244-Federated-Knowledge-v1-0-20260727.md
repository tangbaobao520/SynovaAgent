<!-- SYNOVA-IMPL-D244 v1.0 | 2026-07-27 | P2 | Auth Doc #18 Module 4 -->
# SynovaAgent -- D244 跨企业联邦知识 v1.0
> P2 | 权威文档 #18 模块四 §二-§四 | 代码差距 #12

## 权威文档验证
模块四 §二: "企业知识→anonymized→pending_admin_review→pending_ga_review→>=2家验证→federated"
模块四 §三: "不能仅去掉企业名称。可组合识别企业的细粒度指标→区间, 精确数字→区间"
模块四 §四: ">6月未达2家验证→搁置, >12月→归档, <3/5且>=5企业反馈→降级"

代码验证: 联邦知识体系不存在, 脱敏引擎不存在

## Q0-Q4
Q0: 联邦知识。D241修了企业内审批, D244扩展跨企业共享。
Q2: 做——Anonymizer脱敏引擎; FederatedPipeline双重审批+多企业验证; 知识质量降级规则。不做——联邦学习聚合(Phase 3), 跨企业数据同步(物理隔离)。
Q3: 管理员标记可共享→Anonymizer脱敏→GA审查→>=2企业验证→federated。低分/过期自动降级。
Q4: L1×4 (Anonymizer + 质量降级)

## 改动清单

### 1. src/services/anonymizer.ts — 新建 (~100行)
企业名→[企业A], 地区→[华东], 精确人数/金额→区间
anonymizeKnowledge(chunk): KnowledgeChunk → anonymized text

### 2. src/services/federated-pipeline.ts — 新建 (~120行)
FederatedKnowledge 表: sourceChunkId, anonymizedText, status, validationCount, qualityScore
markShareable / approveFederated / validateByEnterprise / checkQualityDegradation

### 3. src/routes/admin-knowledge.ts — 扩展
POST mark-shareable, GET federated/pending, POST federated/approve, GET federated/degraded

## 测试要求 (L1×4)
| # | 测试 |
|---|------|
| 1 | Anonymizer 企业名替换 |
| 2 | Anonymizer 精确数字→区间 |
| 3 | FederatedPipeline markShareable→anonymized |
| 4 | 质量降级 (<3/5 + >=5反馈) |

## 完成标准
Anonymizer 脱敏引擎 + FederatedPipeline 双重审批 + 质量降级规则 + GA离职权重自动降低。4 tests, tsc零新增, as any=0.
