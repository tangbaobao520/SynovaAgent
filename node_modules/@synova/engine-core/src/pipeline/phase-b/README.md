# group-distill/ — 群像蒸馏引擎 (Phase B 核心)

**保留原因**: 完整的 S1-S7 群像蒸馏管道，含 45 个跨学科认知框架
**迁移目标**: E:\ClawOrg-BOX\server\src\engine-server\pipeline\phase-b\
**迁移时机**: 2026-05-13 立即迁移
**关键文件**:
- framework-library.ts (562行) — 45个认知框架(Munger风格)
- framework-matcher.ts (246行) — 角色→候选框架匹配
- validator.ts (796行) — 缝隙级验证器+7条红线规则
- conflict-detector.ts (247行) — 框架冲突检测
- quality-checker.ts (259行) — 4维度质量评分
- genome-assembler.ts (221行) — PersonaGenome组装
- decision-extractor.ts (304行) — 角色决策类型提取
