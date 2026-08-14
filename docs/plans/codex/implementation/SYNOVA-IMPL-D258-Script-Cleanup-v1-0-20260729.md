<!-- SYNOVA-IMPL-D258 v1.0 | 2026-07-29 | CT Graph v2 Phase 1-3 -->
# SynovaAgent -- D258 脚本清理归并 v1.0
> v2计划 §3.4: 删除29个文件, 归并到8组件归属表

## 代码验证
- scripts/ 下 131 文件——大量死代码(v440/v444/__pycache__/tmp/)
- 3套接线检查(wire-check.sh ×3) ❌
- 2个重复hook(hook-block-no-q0 vs hook-block-write) ❌

## 改动 (纯文件操作, 无代码逻辑变更)

### 删除 (22个)
```
scripts/tmp/* (9个临时构建脚本)
scripts/_fix_parser.py, test_write.py, temp_build_report.py
scripts/workflow/verify-v440.sh, verify-v444.sh
scripts/wire-check.sh, scripts/checks/check-wire-full.sh
scripts/hook-block-no-q0.sh
scripts/audit/__pycache__/ (整个目录)
scripts/control-tower/__pycache__/ (整个目录)
```

### 合并 (2个→1个)
- scripts/wire-check.sh + scripts/checks/check-wire-full.sh → scripts/workflow/wire-check.sh (保留后者, 删除前两者)
- scripts/hook-block-no-q0.sh 功能合并到 scripts/workflow/hook-block-write.sh (追加注释说明原 hook-block-no-q0 的检查已包含)

### 归档 (2个)
- scripts/research/gen-survey.py, translate-research.py → scripts/archive/

## 归属表 (归并后)
| 组件 | 脚本数 | 说明 |
|------|:---:|------|
| 注射器 | 3 | context-injector.sh + inject-context.py + inject-commit-instruction.sh |
| 网守 | 3 | synova-commit + pre-commit-check.sh + commit-msg-check.sh |
| 契约 | 3 | contract-archiver.py + contract-schema.json + run-contract-gate.ts |
| 写入锁 | 3 | write_lock.py + lock-scanner.sh + lock-cleanup.cron |
| 审计器 | 7 | external-auditor.sh + known-error-patterns.json + audit-rules.json + check-lessons-learned.sh + check-tech-debt.sh + check-integrity-startup.sh + check-security.sh |
| 环境 | 3 | env_validator.py + validate-env.sh + validate-expert-config.sh |
| 仪表盘 | 3 | generate-dashboard.py + emit-signal.py + check-gates-v2.py |
| CI/CD | 3 | check-acceptance-ci.sh + check-file-driven.sh + check-architecture.sh |

## 完成标准
22个文件删除, 2组合并, 2个归档。脚本总数从131降至~100。bash -n 全部通过。
