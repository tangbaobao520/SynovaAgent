#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
list-test-points.py — 列出 test: 绑定的验收点（A2 机器验证入库的 --points 源）

一句话: CI vitest 全绿后，本脚本扫 product-lines.yaml，输出那些由自动化测试
        （evidence 含 test:<suite>）担保的验收点 id，逗号分隔，供 evidence-writer.py --points 使用。

契约:
  @input  — 无参数；读 docs/synova/product-lines/product-lines.yaml
  @output — 逗号分隔的验收点 id（如 7-1,9-2）；无 test 绑定点 → 空串 + exit 0（非错误）
  @degraded — yaml 解析失败 → log.error + exit 2（fail-closed：源解析不了绝不当空）
  @exit   — 0 成功（含无绑定点）；2 解析失败
"""
from __future__ import annotations

import logging
import sys
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger("list-test-points")

# 兼容: 直接运行时从仓库任意目录也能定位（同 calc-progress.py）
try:
    import productline_yaml  # noqa: E402
except ImportError:  # pragma: no cover
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import productline_yaml  # noqa: E402

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
YAML_PATH = PROJECT_ROOT / "docs/synova/product-lines/product-lines.yaml"


def list_test_points(spec) -> list[str]:
    ids: list[str] = []
    for line in spec.get("lines", []):
        for p in line.get("acceptance_points", []):
            evidence = p.get("evidence", []) or []
            if any(str(e).startswith("test:") for e in evidence):
                ids.append(str(p.get("id", "")))
    return [i for i in ids if i]


def main() -> int:
    try:
        spec = productline_yaml.load_file(str(YAML_PATH))
    except Exception as e:  # 解析失败 = 降级，绝不静默当"无绑定点"
        log.error("product-lines.yaml 解析失败: %s", e)
        return 2
    ids = list_test_points(spec)
    sys.stdout.write(",".join(ids))
    log.info("test 绑定验收点 %d 个", len(ids))
    return 0


if __name__ == "__main__":
    sys.exit(main())
