#!/usr/bin/env python3
"""
completion_schema.py — 完成度快照统一契约 (D296, 铁律 47 契约优先)

背景: self-diagnosis.py (D267) 与 completion-engine.py (D261) 曾各自输出
不同 schema 的 completion-scores.json, 消费者视图只读 overallScore,
self-diagnosis 输出后视图取默认值 0 → 仪表盘显示假 0% (任务文档 §2.3 冲突链)。

本模块是唯一 schema 权威:
  - SCHEMA_VERSION / REQUIRED_FIELDS / CRITERIA_KEYS — 契约常量
  - make_criteria() / empty_criteria() — 生成各标准条目
  - validate_completion_schema() — 无依赖校验器 (jsonschema 未安装, 不引入外部依赖)

统一输出文档形态 (draft-07 风格, 无外部依赖实现):

{
  "schemaVersion": 1,
  "generator": "self-diagnosis.py",
  "systemScore": 0.0,          # 0-1 尺度
  "totalTasks": 0,
  "completionByCriteria": {
    "code_exists":     {"pass": 0, "total": 0, "pct": 0.0},
    "wiring_complete": {"pass": 0, "total": 0, "pct": 0.0},
    "test_exists":     {"pass": 0, "total": 0, "pct": 0.0},
    "path_reachable":  {"pass": 0, "total": 0, "pct": 0.0},
    "dependencies_ok": {"pass": 0, "total": 0, "pct": 0.0},
    "no_defects":      {"pass": 0, "total": 0, "pct": 0.0}
  },
  "degraded": false,
  "degradedReason": "",
  "generatedAt": "2026-08-01T00:00:00Z",
  "results": []
}

契约:
  @input  — 生成方 (self-diagnosis.py / completion-engine.py) 的完成度文档 dict
  @output — validate_completion_schema() 返回错误列表 (空 = 合法)
  @degraded — 校验失败返回错误列表, 调用方不得写入非法文档 (禁止正常格式假数据)
"""
import json
from typing import Any

SCHEMA_VERSION = 1

GENERATOR_SELF_DIAGNOSIS = "self-diagnosis.py"
GENERATOR_COMPLETION_ENGINE = "completion-engine.py"

# 六条件标准 (与 D267 §2.3 / D261 §3.2 对齐)
CRITERIA_KEYS = [
    "code_exists",       # C1 代码存在
    "wiring_complete",   # C2 接线完整
    "test_exists",       # C3 测试存在
    "path_reachable",    # C4 路径可达
    "dependencies_ok",   # C5 依赖可用
    "no_defects",        # C6 无已知缺陷
]

REQUIRED_FIELDS = [
    "schemaVersion",
    "generator",
    "systemScore",
    "totalTasks",
    "completionByCriteria",
    "degraded",
    "degradedReason",
    "generatedAt",
    "results",
]

_RESULT_REQUIRED = ["d_id"]


def make_criteria(passed: int, total: int) -> dict:
    """生成单标准条目 {"pass", "total", "pct"} (pct 0-100)"""
    total = max(total, 0)
    passed = max(min(passed, total), 0)
    pct = round(passed / total * 100, 1) if total else 0.0
    return {"pass": passed, "total": total, "pct": pct}


def empty_criteria() -> dict:
    """全零标准条目 — 用于 degraded 文档"""
    return {key: make_criteria(0, 0) for key in CRITERIA_KEYS}


def validate_completion_schema(doc: Any) -> list:
    """校验完成度文档是否符合统一契约。

    返回错误信息列表; 空列表 = 合法。
    无外部依赖 (不引入 jsonschema), 逐字段校验 required + 类型 + 范围。
    """
    errors: list = []
    if not isinstance(doc, dict):
        return ["文档不是 dict"]

    for field in REQUIRED_FIELDS:
        if field not in doc:
            errors.append(f"缺少 required 字段: {field}")

    if doc.get("schemaVersion") != SCHEMA_VERSION:
        errors.append(
            f"schemaVersion 必须为 {SCHEMA_VERSION}, 实际: {doc.get('schemaVersion')!r}")

    generator = doc.get("generator", "")
    if not isinstance(generator, str) or not generator.strip():
        errors.append("generator 必须为非空字符串")

    score = doc.get("systemScore")
    if not isinstance(score, (int, float)) or isinstance(score, bool):
        errors.append(f"systemScore 必须为数字, 实际: {score!r}")
    elif not (0.0 <= float(score) <= 1.0):
        errors.append(f"systemScore 必须在 [0,1] 区间, 实际: {score!r}")

    total = doc.get("totalTasks")
    if not isinstance(total, int) or isinstance(total, bool) or total < 0:
        errors.append(f"totalTasks 必须为非负整数, 实际: {total!r}")

    criteria = doc.get("completionByCriteria")
    if not isinstance(criteria, dict):
        errors.append("completionByCriteria 必须为 dict")
    else:
        for key in CRITERIA_KEYS:
            entry = criteria.get(key)
            if not isinstance(entry, dict):
                errors.append(f"completionByCriteria.{key} 缺失或不是 dict")
                continue
            for sub in ("pass", "total"):
                v = entry.get(sub)
                if not isinstance(v, int) or isinstance(v, bool) or v < 0:
                    errors.append(f"completionByCriteria.{key}.{sub} 必须为非负整数")
            pct = entry.get("pct")
            if not isinstance(pct, (int, float)) or isinstance(pct, bool):
                errors.append(f"completionByCriteria.{key}.pct 必须为数字")
            elif not (0.0 <= float(pct) <= 100.0):
                errors.append(f"completionByCriteria.{key}.pct 必须在 [0,100]")

    if not isinstance(doc.get("degraded"), bool):
        errors.append("degraded 必须为布尔值")
    if not isinstance(doc.get("degradedReason"), str):
        errors.append("degradedReason 必须为字符串")

    generated_at = doc.get("generatedAt", "")
    if not isinstance(generated_at, str) or not generated_at.strip():
        errors.append("generatedAt 必须为非空字符串")

    results = doc.get("results")
    if not isinstance(results, list):
        errors.append("results 必须为数组")
    else:
        for i, r in enumerate(results):
            if not isinstance(r, dict):
                errors.append(f"results[{i}] 不是 dict")
                continue
            for field in _RESULT_REQUIRED:
                if field not in r or not isinstance(r[field], str) or not r[field]:
                    errors.append(f"results[{i}].{field} 必须为非空字符串")

    return errors


def to_json(doc: dict) -> str:
    """序列化为 JSON 字符串 (原子写入前的最终形态)"""
    return json.dumps(doc, indent=2, ensure_ascii=False)
