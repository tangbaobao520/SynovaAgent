# Dev Doc --verify 协议 v1.0

> 将 dev doc 的完成标准从"人读"升级为"机器可验证"。
> 每条 --verify: 指令在 pre-commit 时自动执行，失败则阻断提交。

## 语法

```
--verify: <bash command> | 期望 <operator> <value> | <failure message>
```

## 支持的操作符

| 操作符 | 含义 | 示例 |
|--------|------|------|
| `>=` | 大于等于 | `grep -c "function" file.ts \| 期望 >=1` |
| `==` | 等于 | `grep -c "TODO" file.ts \| 期望 ==0` |
| `<=` | 小于等于 | `wc -l < file.ts \| 期望 <=200` |
| `>` | 大于 | `grep -c "expect(" test.ts \| 期望 >2` |
| `<` | 小于 | `grep -c "as any" file.ts \| 期望 <1` |
| `!=` | 不等于 | `grep -c "NotImplemented" file.ts \| 期望 !=0` |
| `contains` | 包含子串 | `grep "Governing Thought" file.md \| 期望 contains Governing` |
| `!contains` | 不包含子串 | `grep "TODO" file.ts \| 期望 !contains future` |

## 使用场景

### 场景 1: 函数实现完整性

断言某个函数处理了所有声明的类型分支：

```
--verify: grep -c "weight_adjust" src/loops/middle-evolution-engine.ts | 期望 >=1 | D273: weight_adjust 分支未实现
--verify: grep -c "rank_adjust" src/loops/middle-evolution-engine.ts | 期望 >=1 | D273: rank_adjust 分支未实现
--verify: grep -c "confidence_adjust" src/loops/middle-evolution-engine.ts | 期望 >=1 | D273: confidence_adjust 分支未实现
```

### 场景 2: 测试充分性

```
--verify: grep -c "expect(" tests/agent/proactive-push-wiring.test.ts | 期望 >=5 | 测试不足 5 个 expect()
```

### 场景 3: 接线验证

```
--verify: grep -rn "applyEvolutionActions" src/ --include="*.ts" | grep -v "export\|middle-evolution-engine.ts" | wc -l | 期望 >=1 | applyEvolutionActions 未被调用方引用
```

### 场景 4: 禁止残留

```
--verify: grep -c "TODO\|FIXME" src/agent/proactive-push.ts | 期望 ==0 | 生产代码不得残留 TODO
--verify: grep -c "暂由未来版本实现\|其余类型暂不处理" src/loops/middle-evolution-engine.ts | 期望 ==0 | 禁止 scope-reduction 注释
```

## pre-commit 行为

- 从 commit message 提取 D#（如 `feat(D273): ...`)
- 查找 `docs/plans/codex/implementation/SYNOVA-IMPL-D273-*.md`
- 提取所有 `--verify:` 行并逐条执行
- 任一失败 → 硬阻断 (exit 1)
- dev doc 无 `--verify:` → 跳过（不阻断）

## 设计原则

1. **命令是纯 bash** — 不引入新 DSL，开发者已熟悉的 grep/wc 即可
2. **期望是显式数值** — 不是 "enough" 或 "sufficient"，是具体的 ">=3"
3. **失败消息是指定格式** — 直接显示在 commit 阻断信息中
4. **不阻止无 --verify 的历史 dev doc** — 向后兼容