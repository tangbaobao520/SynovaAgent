<!-- SYNOVA-IMPL-D248 v2.0 | 2026-07-27 | 手机号+微信号注册 -->
# SynovaAgent -- D248 手机号 + 微信号注册 v2.0
> v1.0 修正: UserStore 实际在 src/growth/user-store.ts, admin.js 有 7 处 email 硬编码

## 代码验证
- src/growth/user-store.ts `UserProps`: 只有 email, 无 phone/wechatId ❌
- src/growth/user-store.ts `UserRecord`: 只有 email ❌
- src/growth/user-store.ts `createUser(email, password, role, orgId, ...)`: 仅接受 email ❌
- src/growth/user-store.ts `queryByEmail` 存在, 无 queryByPhone/queryByWechatId ❌
- src/routes/auth.ts L68-69 注册端点: 必须 email + password ❌
- src/routes/auth.ts L111-113 登录端点: 必须 email + password ❌
- src/routes/enterprise.ts L97 企业注册: 必须 email ❌
- app/js/admin.js L309 onboarding 注册表单: type=email id=ob-email 硬编码 ❌
- app/js/admin.js L316 邀请表单: type=email id=ob-invite-email ❌
- app/js/admin.js L352 注册提交: 读 ob-email.value ❌
- app/js/admin.js 成员列表显示: m.email ❌

## Q0-Q4
Q0: 手机号/微信号注册。中国用户习惯手机号注册, 微信扫码/微信号登录是主流。
Q1: 手机号 `^1[3-9]\d{9}$`, 微信号字母数字下划线。至少一个标识符即可注册。
Q2: 做——UserProps/UserRecord 加 phone/wechatId; UserStore 加 queryByPhone/queryByWechatId; auth.ts 注册/登录接受三种标识符; enterprise.ts 注册同步; admin.js onboarding 表单加 phone/wechatId 字段。不做——短信验证码、微信OAuth、密码重置。
Q3: 手机号注册→phone唯一性校验→createUser→返回token。微信号登录→queryByWechatId→bcrypt→token。
Q4: UserStore不可用→回退内存Map(仅email)。L1×6测试。

## 改动 (4 文件)

### 1. src/growth/user-store.ts — UserProps/UserRecord + 新方法
UserProps 新增: `phone?: string; wechatId?: string`
UserRecord 新增: `phone?: string; wechatId?: string`
createUser 新增可选参数: `phone?: string, wechatId?: string`
新增方法: `queryByPhone(phone: string): UserRecord | null`
新增方法: `queryByWechatId(wechatId: string): UserRecord | null`
GraphStore 查询: queryNodes(NODE_TYPE, { phone }, USER_GRAPH) 过滤

### 2. src/routes/auth.ts — 注册/登录扩展
注册: 校验 `(email || phone || wechatId) && password`, 去重覆盖全部三种
登录: 用 phone/wechatId 作为 email 的替代标识符, getUserStore().queryByPhone/queryByWechatId

### 3. src/routes/enterprise.ts — 企业注册同步
register 端点 body 增加可选 `phone?` / `wechatId?`
成员列表返回增加 phone/wechatId (L241)

### 4. app/js/admin.js — 前端表单 (~20行)
onboarding Step 1 注册表单: Admin Email → "Email / Phone / WeChat ID" (统一 text input, 去掉 type=email)
onboarding Step 2 邀请表单: Email → "Email / Phone / WeChat ID"
成员列表显示: m.email → 优先显示 phone > wechatId > email
注册提交: 智能检测输入类型(含@=email, 11位数字=phone, 其他=wechatId)

## 测试 (L1×6)
| # | 测试 | 验证 |
|---|------|------|
| 1 | 手机号注册→phone持久化 | L1 |
| 2 | 微信号注册→wechatId持久化 | L1 |
| 3 | 手机号登录→queryByPhone→bcrypt | L1 |
| 4 | 重复手机号→409 | L1 |
| 5 | 手机号格式错误→400 | L1 |
| 6 | email回归——仍可注册登录 | L1 |

## 完成标准
注册支持 email/phone/wechatId 三种标识符(至少一个)。登录支持三种任一。去重。前后端同步。6 tests。tsc零新增。as any=0。
