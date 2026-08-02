# 控制塔 VERSION — 版本与变更记录

> 控制塔产品契约（设计文档 §2.6/§2.7）。版本只增不减；任何门禁/工具行为变化必须 bump（PATCH 起步）；bump 与代码同 commit。

## 版本规则

```
版本号: MAJOR.MINOR.PATCH
- PATCH (第三位): 小升级 — bug 修复/门禁微调 → 4.6.0 → 4.6.1
- MINOR (第二位): 中升级 — 新机制/新组件/新门禁组 → 4.6.0 → 4.7.0
- MAJOR (第一位): 大改版 — 架构重构/产品化里程碑 → 4.6.0 → 5.0.0
```

## 变更记录

### V4.6.0-WIP (2026-08-02) — D311 M1 多会话协调

- **变更**: 控制塔 V4.6.0 独立化第一阶段（M1 多会话协调）
- **关联 incident**: INC-20260802-D300（并行 session 覆盖 brief/暂存被卷走/中间态污染/空等 7h）、INC-20260802-D292（并行声明与实际写集不符）、INC-20260802-D286（"零共享"实为 15 个 src/ 文件重叠）
- **新增机制**:
  - `session_registry.py` — 会话注册表（register/write-set/claimants/attribution/gc/phase + fail-open + 损坏自愈 + 双层互斥）
  - `verify-parallel.sh` — 并行声明物理验证（dev doc 写集表解析/4 形态清洗/两两比对/fail-open）
  - `staging_guard.py` — 暂存区隔离（他人写集 → block；committed 忽略；杂散 → warn；fail-open）
  - `wait_manager.py` — 并行等待管理（CP1-CP4 阶段/错峰提示/依赖提示/等待显式化）
  - `pre-push-check.sh` — 门禁 3 改基（`origin/feat/prompt-architecture..HEAD`）+ 门禁 4 中间态警告 + 门禁 5 并行声明验证
  - `synova-commit` — 新增 `--session-id` + staging-guard 硬阻断 + 显式路径 commit + 写集 committed + 阶段 CP4
  - `VERSION.md` — 本文件（控制塔产品契约起点；正式首发在 D314）
- **写集表格式契约**（verify-parallel 依赖，未来 dev doc 必须遵守）:
  - 写集表标题: `### N.N 写集 (N 修改 + M 新建)`（正则 `^#{2,4}\s*\d+(\.\d+)*\s*写集`）
  - 表头: `| 文件 | 操作 | 说明 |`，第一列支持: 纯路径 / `[text](url)` 链接 / 行号后缀 `L750` / 计数 `(N 个)` / 目录级（`/` 结尾）
- **验证**: session-registry 12/12 | verify-parallel 13/13 | staging-guard 8/8 | wait-manager 7/7 测试通过
- **作者**: Claude (D311)
- **正式首发**: D314（含日志五件套/自身健康/daemon 轻量触发）
