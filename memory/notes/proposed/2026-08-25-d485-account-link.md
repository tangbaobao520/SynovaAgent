---
状态: proposed
日期: 2026-08-25
决策: 匿名绑定已有账号必须验密码 — accept 查重绑定的安全边界（D485）
理由: 企业邀请 accept 是匿名端点（token 即凭证），invite 响应直接返回 token。若绑定路径不验密码，任何企业管理员可 invite 任意已注册 email 后自调 accept，把受害者个人账号 orgId 划进自己企业（数据访问边界迁移 = 账号劫持）。绑定 = 修改账号归属，必须证明账号所有权；匿名上下文唯一的所有权证明就是密码。
---

## 决策上下文（D485 切片 C，双轨账号关联）

创始人决策 2026-08-25：双轨并存——个人开放注册（auth/register）+ 企业邀请制（enterprise invite/accept）；
个人账号被邀请可加入企业（飞书/钉钉模式）。

D484 打通的 accept 现状（enterprise.ts L224-227）：token+password → createUser 不查重。
个人轨已注册 email 被邀请 → 新建重复账号（userId 断裂，个人数据/密码不延续）。

修复方案（dev doc §3.1）：queryByEmail 查重 → 已存在则 updateUser 绑定（orgId/role 更新，userId/密码保留）。

## 偏离 dev doc 方案的两项实现层决策（已在 dev doc §3.2 回填）

1. **绑定路径加 bcrypt.compare 密码验证**：验证失败 → 401 AUTH_FAILED + 邀请 token 保持 pending（不消耗，可重试）。
   - 威胁模型：invite 不验证 email 归属（管理员可 invite 任意 email）+ 响应直接返回 token + accept 匿名可达。
   - 无密码验证的攻击链：恶意管理员 invite victim@x.com → 拿 token → 调 accept → 受害账号 orgId/role 被改写。
   - 有密码验证：攻击者无密码 → 绑定 401 → 攻击链断。
2. **绑定路径拒绝 disabled 账号**：status 非 active → 403 ACCOUNT_DISABLED。冻结/软删账号不得经邀请链接复活（与 auth login L130 语义一致）。

## 参考系（S-12 决策记录）

- Anthropic 工程基线：fail-closed（验证失败拒绝，token 不消耗可重试）+ 最小破坏（绑定保留 userId/密码连续性）
- 第一性原理：归属变更需所有权证明；匿名上下文唯一证明 = 密码
- 开源实证：飞书/钉钉加入企业要求登录态；GitHub org 邀请 accept 需登录会话
- 收敛：两参考系同指"绑定必须验密码"

## 验收锚点

- 用例①含错误密码 401 + 邀请仍 pending + 正确密码重试成功子断言（vitest）
- 绑定后原密码 login 成功且 payload.orgId = 企业 orgId（密码不重置实证）
- 边界不削弱：未绑定个人账号（staff+default）调 members → 403（用例③）
