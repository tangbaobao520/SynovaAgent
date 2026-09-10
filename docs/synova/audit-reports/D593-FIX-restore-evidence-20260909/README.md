# D593-FIX 恢复证据包（2026-09-09）

> K3 FAIL P0-1（合并冲突吞实现）+ P0-2（夹带）修复证据。基线 f3df0284 = origin/main。

| 文件 | 内容 |
|---|---|
| red-before-restore.log.txt | 恢复前 main 状态实跑：10 failed / 2 passed（唯二通过 = 用例4 ghost-404 + 用例7b 503，均不依赖持久层）——实证 diagnosis.ts D593 服务端面丢失 |
| green-after-restore.log.txt | 恢复后：21/21 全绿（12 routes + 9 electron） |

## K3 独立重跑
```bash
npx vitest run tests/routes/diagnosis-report-persistence.test.ts tests/electron/right-panel-report-sentinel.test.ts   # 21 全绿
npx vitest run tests/routes/conversations.test.ts                                                                      # 13 全绿
grep -c customerConfig src/routes/diagnosis.ts   # 15（D599/D600 零误伤，与 #442 前一致）
git ls-files --cached | grep -cE "heartbeat.json|synova-wt-ct64|synova-wt-d593$|D595-mcp-auth|编码指令-D595|D599-dev-doc"   # 0
```

## FIX2 附录（2026-09-09，K3 复审 P0-1 闭环）

D593-FIX 的 9c3f1672 **不含 diagnosis.ts**（手术漏 staged，worktree 态假绿）——K3 属实，编码线自认 D316 教训复犯。
FIX2 = 同一手术入提交，三物证：
1. staged: `git diff --cached --name-only` 含 src/routes/diagnosis.ts
2. commit: `git show <sha> --stat` 显示该文件
3. 远端: `git show origin/fix/d593-restore:src/routes/diagnosis.ts | grep -c saveDiagnosisCheckpoint` ≥1
+ 提交态绿：临时 worktree checkout 新提交实跑（非工作树态）。
