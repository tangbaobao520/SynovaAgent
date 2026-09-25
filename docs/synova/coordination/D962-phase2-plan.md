
## 九、2a① 终态数据回写（D962-B，2026-09-25）

- pre-commit-check.sh：**399 行**（WIP 410 → 收口；目标 ≤400 达成），V5.3 本地 10 条目 + SYNO_CI=1 CI 权威区（34 项判定）。
- 断面接线：`grep -c 'check-dsh-anchor'` = **3**（保全）。
- 死分支修复：CHANGED_FILES/STAGED_FILES/STAGED_ALL = GIT_CACHED_ALL_NAMES（L112-113）；G10/G11 判定 2026-09-25 首次真实执行（g10 测试真红分支断言落位）。
- CP3 L1494-1500（旧行号）|| true 吞错 → 显式降级登记（degraded-events.log + WARN_COUNT）。
- WIP 三缺陷修复：G12 `\$` 正则逃逸（恒绿 fail-open）、裸 python3×7（PYBIN 全局化）、D547 骨架检查 CT-34 早退不可达（骨架硬拦并入早退路径）。
- 六处引用移除确认：check-hardcoded/deprecated-mapping/verifiable-done/q0c-tracking/acceptance-ci/brief-parseable 在 V5.3 中零引用（hardcoded 改判保留但不再被 pre-commit 引用——判定本地内联 #3）。
- 计数更正：main@519edadf 新增 check-name-allocation.sh（#760）→ 第一批后 29，第二批 7 项删除后预期 **22**（CTO 三选一裁决定稿）。
