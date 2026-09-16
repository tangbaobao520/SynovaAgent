---
状态: implemented
日期: 2026-09-11
决策: CT-47（PR 合并门禁缺失——CI 红态仍可合并）创始人裁决「方案 A」并当日落地：main 分支保护开启 required_status_checks ×12（PR 上实际必跑的 12 个 job 名，逐个取自 check-runs 实测，app_id=15368）+ enforce_admins=true（管理员同样受限，AI 持 admin token 亦不可绕）；保留既有「必须走 PR / 禁强推 / 禁删分支 / 禁删保护」；strict=false（不强制 PR 先同步 base——避免与 bypass.log 无 union driver（GitHub 端）导致的 dirty 循环叠加成死锁）。落地工具=GitHub API（token 具 admin 权限），实证=落地后 API GET 复核 required_status_checks.checks=12 且 enforce_admins.enabled=true。同日开启 Secret Scanning + Push Protection（公开仓库免费），补「扫到 + 拦住 + 告警」。
理由: CT-47 已四次实证（#223 / #299 / #476 Architecture Check=failure 红态合并 / 2026-09-11 本夜 PR #494 首轮 TypeScript job 红时若按旧通道即可合并）——「被绕过的门禁 = 没有门禁」（V3.9）。此前红态合并的制度性根因：CI 长期存在真红（gitlink checkout 128 + Pages Liquid），若当时上锁则全仓无法合并，故历史只能「红着合并」；2026-09-11 D665 双层修复后 main 全部 job 转绿，正是上锁窗口（锁在绿地上才不封路）。选 A（含 enforce_admins）而非 B 的理由：创始人要的是「体系替代他盯全程」，管理员豁免通道本身就是一个需要人盯的缺口；紧急抢修不必担心死锁——保护设置可由 admin token 一分钟内临时关闭并恢复，成本远低于「红态静默入 main」。
---

## 背景

`审计发现台账-DSH-CTO.md:98` 的 CT-47：**PR 合并门禁缺失——CI 红态仍可合并**。
pre-commit / pre-push 都是本地 hook，**管不到 GitHub 的 merge 通道**（API / 网页 squash 不经过本地 hook）。
历史实证：PR #223（CI 双红仍合并，红态存续约 2 天）、PR #299（merged_at 14:08:42Z **早于** Iron Laws 失败 14:10:18Z，检查未完成即合并）、PR #476（Architecture Check=failure 的合并点，K3 复审条件②）。

## 决策

创始人 2026-09-11 裁决：**方案 A**（上锁 + 管理员亦受限）+ **开启 Secret Scanning**；密钥轮换暂缓（另条登记）。

## 落地实况（可复核）

| 项 | 值 | 取证 |
|---|---|---|
| required_status_checks | 12 项（Architecture Check / Checker Review (maker/checker) / Control Tower Gate Tests (ubuntu-latest) / Control Tower Gate Tests (windows-latest) / Golden Case F1 Gate / Integration Contract Check / Test-Kit Architecture Tests (ubuntu-latest) / Test-Kit Architecture Tests (windows-latest) / TypeScript + Lint + Iron Laws / Vitest (1/2) / Vitest (2/2) / npm audit） | 名单取自 commit `76efe4cd`（docs-only PR）与 `261ad6c6`（代码 PR）的 check-runs 交集——两类 PR 均必跑，避免「设了从不运行的检查 = 永久 pending = 死锁」 |
| strict | false（不强制 PR 先同步 base） | API GET |
| enforce_admins | true | API GET |
| 保留项 | 必须走 PR / 禁强推 / 禁删分支 / 禁删保护 | API GET 前后对比 |
| Secret Scanning | secret_scanning=enabled + push_protection=enabled（公开仓库免费） | API GET |
| 未生效 | secret_scanning_validity_checks / non_provider_patterns —— 两次 PATCH 均返回 disabled（API 未接受，疑 UI/计划门控；如需可在仓库 Settings→Code security 手动点开） | API 实测 |

## 边界与后续

- **这不是「不能紧急抢修」**：紧急时由 admin token 临时关闭保护、合完恢复（分钟级），代价远低于红态静默入 main。
- **对并行执行方的影响**：PR 必须 12 项全绿才可合并（此前是 CTO 自律，现在是平台物理拦）。派单文档已同步此约束。
- **仍未覆盖的相邻缺口**：合并级写集对账（M2 族第三次实证）归 D708；`bypass.log` 在 GitHub 端无 union driver 导致每次 main 变动都会让在途 PR 变 dirty（合并串行化的摩擦根源）——待立 FIX。
