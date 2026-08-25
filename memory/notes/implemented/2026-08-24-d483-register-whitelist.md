# 决策 Note：register 匿名注册可达——认证白名单优先于邀请令牌（D483 切片 A）

## 状态
2026-08-24 | 已实施（PR #156 CI 18/18，待 DSH 审查合并） | P1

## 日期
2026-08-24

## 决策
`/api/auth/register` 加入 jwtAuthMiddleware 的 isWhitelisted 白名单（与 login 并列，src/middleware/auth.ts L90），暂不做邀请令牌验证；D481 集成测试的 signJwtToken bootstrap 绕过同步移除，改匿名直连断言 201。

## 理由
第一性原理：register 路由逻辑已完整实现（校验/bcrypt/去重/token 签发，D102/D479 契约），仅被认证层挡住——"注册可达"是多租户 onboarding 的底座（GS 场景入口），邀请令牌是安全增强（防开放注册滥用），两者不冲突，先可达后收紧。Anthropic 基线：测试必须反映真实用户路径——bootstrap 绕过掩盖了生产缺陷（D481 探针才暴露），移除后白名单缺口在测试层永久可见（红→绿物理证据）。

## 后续
切片 B（D484，串行依赖本切片）：产品决策邀请令牌启用与否——启用时白名单收紧为邀请令牌验证（register 分支替换），注释已留钩子。切片 C：注册后 onboarding。
