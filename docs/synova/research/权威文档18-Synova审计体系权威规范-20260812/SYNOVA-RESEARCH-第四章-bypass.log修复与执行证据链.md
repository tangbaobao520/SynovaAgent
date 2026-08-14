# 第四章：bypass.log 修复与执行证据链

> 基于 D328/D329/D330 三次审计共同发现的系统性缺口

## 4.1 问题定义：执行证据链断裂

三次审计的共同发现：

| 任务 | Commit | bypass.log 状态 | 后果 |
|------|--------|----------------|------|
| D328 | ea1cb71 | ❌ 无记录 | 无法验证 pre-commit 12组是否真实执行 |
| D329 | dc369fd | ❌ 无记录 | 同上 |
| D330 | 6c00e46 + 407ff1f | ❌ 无记录 | 同上 |

**这不是日志丢失，是执行证据链的系统性断裂。**

审计协议要求材料 7（执行证据包）包含 bypass 记录。但记录不存在时，审计只能标注 [DEGRADED]，无法验证"12 组 pre-commit 全过"的声称。

## 4.2 根因分析

三种可能，需逐一排查：

| # | 根因假设 | 验证方式 | 概率 |
|---|---------|---------|:---|
| A | `synova-commit.sh` 只在特定分支/条件下写入日志 | 读 `synova-commit.sh` 日志写入代码逻辑 | 高 |
| B | 这些提交通过 `git commit` 直接提交，未走 `synova-commit.sh` | 检查提交者环境变量/脚本调用链 | 中 |
| C | 日志文件轮转/截断导致旧记录丢失 | 检查 bypass.log 文件大小和 inode 历史 | 低 |

D330 审计报告已给出"最小对账实现建议"，说明 K3 已定位到方案 A 的方向。

## 4.3 修复方案：A + B 双轨

### 方案 A：防新增缺口（synova-commit.sh 强制签名写入）

**目标**：每次通过 `synova-commit.sh` 的提交，必须在 bypass.log 中留下不可伪造的记录。

**实现**：

```bash
# synova-commit.sh 中，git commit 成功后强制写入
COMMIT_HASH=$(git rev-parse HEAD)
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
SIGNATURE=$(echo "${COMMIT_HASH}:${TIMESTAMP}:$(git config user.email)" | sha256sum | cut -d' ' -f1)

# 写入 bypass.log
# 格式: TIMESTAMP | HASH | TASK_ID | SIGNATURE | VERIFIED_BY
"$LOG_FILE"
```

**关键设计**：
- 签名包含 commit hash + 时间戳 + 提交者邮箱 → 不可事后伪造
- 写入操作在 `git commit` 成功**之后**，失败时不写（避免脏记录）
- 格式固定，便于 `bypass-log-reconcile.sh` 解析

### 方案 B：补历史缺口（定期对账脚本）

**目标**：发现 bypass.log 与 git log 之间的缺口，自动告警。

**实现**：

```bash
#!/bin/bash
# bypass-log-reconcile.sh
# 每周运行一次，或每次审计前手动运行

GIT_LOG_COMMITS=$(git log --since="1 week ago" --format="%H" | sort)
BYPASS_LOG_COMMITS=$(cut -d'|' -f2 "$BYPASS_LOG" | sort)

# 找 git log 中有但 bypass.log 中无的 commit
MISSING=$(comm -23 <(echo "$GIT_LOG_COMMITS") <(echo "$BYPASS_LOG_COMMITS"))

if [ -n "$MISSING" ]; then
  echo "[ALERT] 以下 commit 无 bypass 记录："
  echo "$MISSING"
  exit 1
else
  echo "[PASS] bypass.log 与 git log 一致"
  exit 0
fi
```

**输出**：
- 发现缺口 → exit 1 + 告警（可集成到 CI 或审计流程）
- 无缺口 → exit 0

## 4.4 执行证据链完整图

```
开发者执行 git commit
        ↓
synova-commit.sh 拦截
        ↓
pre-commit 12组执行
        ↓
全部 PASS → git commit 成功
        ↓
synova-commit.sh 写入 bypass.log（带签名）
        ↓
git push
        ↓
K3 审计时读取 bypass.log
        ↓
如有缺口 → bypass-log-reconcile.sh 自动发现
```

## 4.5 验收标准

| # | 标准 | 验证 |
|---|------|------|
| 1 | synova-commit.sh 每次成功提交后写入 bypass.log | 连续 5 次提交，grep 确认记录存在 |
| 2 | bypass.log 记录包含不可伪造签名 | 手动篡改记录后，reconcile 脚本能检测 |
| 3 | reconcile 脚本发现历史缺口 | 对过去 30 天运行，输出缺失 commit 列表 |
| 4 | 缺口告警可集成到审计流程 | K3 审计时自动运行 reconcile，结果入报告 |
