# D38: PolicyEngine — ABAC 属性驱动权限引擎

> 生成: 2026-07-12 | 分支: feat/prompt-architecture | V4.4.5

## Q0: 定位 — 项目拼图 + 文件审计 + 决策
a) 项目拼图
   SynovaAgent — D38。安全P0第一条。
   src/middleware/rbac.ts: 5角色(admin/manager/liaison/staff/ga) + 简单if/else权限判断。
   无 PolicyEngine 抽象。无 SOI 映射。无数据等级(S0-S4)感知。
b) 文件审计
   安全规范§3.4: PolicyEngine.evaluate(role, dataLevel, soi) 三元组裁决
   rbac.ts: 5角色, canAccessWorkspace/canModifyWorkspace基于visibility+role+department
   security/: PIIScrubber等7文件, 无PolicyEngine
c) 决策
   新建 src/security/policy-engine.ts: PolicyEngine类 + evaluate方法 + 9条内建规则 + 默认Deny
   不改rbac.ts(由D44接线)

## Q1: 调研 — 引用来源 + memory教训
a) 安全规范 §3.4: PolicyEngine.evaluate(role, dataLevel, soi)→{allow, denyReason}
b) 安全规范 §3.1: 10条SOI标准操作指令集
c) 安全规范 §2.1: S0-S4五级数据分类
d) memory/: 默认安全原则 OWD=Private; 铁律38零as any; 铁律24 catch+log+degraded

## Q2: 范围 — 做什么 + 不做什么
做什么:
  1) PolicyEngine类 + evaluate(AccessRequest)→PolicyDecision
  2) 9条内建策略规则(deny_ga_write/deny_staff_sensitive/allow_admin_all等)
  3) 自定义规则(addRule/removeRule)
  4) 10条SOI常量 + S0-S4类型 + 默认Deny
不做什么:
  不改rbac.ts(由D44); 不实现TraversalPermissionFilter(D39)
排除: src/middleware/rbac.ts(不改), src/middleware/auth.ts(不改)

## Q3: 验收 — 入口→处理→结果
入口: new PolicyEngine().evaluate({role, dataLevel, soi})
处理: 优先级排序规则链 → 匹配条件 → 返回allow/deny
结果: 独立模块, ≥8测试覆盖, 可被D44/D39/D40接入

## 架构层: L5(安全基础设施) — src/security/policy-engine.ts
## Done 标准
- [ ] verify: evaluate('admin','S1','ontology.write') → {allow:true}
- [ ] verify: evaluate('ga','S3','data.export') → {allow:false}
- [ ] verify: evaluate('unknown_role','S0','') → {allow:false, denyReason包含'deny_default'}
- [ ] verify: addRule → 新规则生效; removeRule → 回退默认
- [ ] verify: tsc零错误 / vitest零失败 / 零as any
