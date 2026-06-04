# Skill 安全审计方案

## 审计引擎位置

腾讯云鼎实验室 7 步审计引擎：
`D:\novis-backup-20260526\Novis\server\src\services\skill-security-audit.ts`

## 用法

```typescript
import { auditSkillContent } from '../server/src/services/skill-security-audit';

// 对从 ClawHub 下载的 SKILL.md 做安全审计
const report = auditSkillContent('skill-name', skillMdContent);

if (report.level === 'malicious') {
  // 拒绝安装，分数 0-30
  console.log(`❌ 拒绝: ${report.blockReason}`);
} else if (report.level === 'suspicious') {
  // 可安装但需要 full 沙箱，分数 31-75
  console.log(`⚠️ 警告: ${report.recommendation}`);
} else {
  // 安全，分数 76-100
  console.log(`✅ 通过: ${report.recommendation}`);
}
```

## 扫描内容

| 步骤 | 扫描项 |
|------|--------|
| Step 1 | 读取目录下所有文件 |
| Step 2 | 危险关键词（远程下载执行/凭证窃取/破坏性操作/Prompt 注入） |
| Step 3 | 文件操作越权分析 |
| Step 4 | 远程脚本下载 |
| Step 5 | 依赖声明供应链风险 |
| Step 6 | 风险定级 Malicious/Suspicious/Benign |
| Step 7 | 输出报告 |

## 策略

从 ClawHub 安装任何 Skill 前，先过云鼎审计。Malicious 拒绝，Suspicious 进 full 沙箱，Benign 正常安装。
