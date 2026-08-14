#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
productline_yaml.py — 严格 YAML 子集解析器（产品进度仪表盘共用）

一句话: product-lines.yaml / todo-line-map.yaml / cockpit-override.yaml 的人类可读层。
零第三方依赖（Win/Mac/CI 三处 python3 均可用，规避 M5 环境依赖教训）。

决策记录（D333，K3 可核）:
  参考：Anthropic（机器可验契约：测试用 node_modules/yaml 交叉验证本解析器与
  标准 YAML 解析结果一致，子集内文件保证是合法 YAML）+ DeepSeek（最少机制：
  只支持本产品需要的语法，约 150 行，零 pip 依赖）+ 第一性原理（单一事实源，
  不搞 yaml/JSON 双写）。
  结论：收敛——严格子集 + fail-closed（遇到不支持语法报行号硬错，绝不静默猜）。

契约:
  @input  — 文本（utf-8）。支持: # 注释、key: value 映射、缩进嵌套、
            "- " 列表项、双引号字符串（含中文/冒号/『』）、单行内联列表 ["a", 1]、
            整数/浮点/布尔/null 标量。
  @output — dict/list（与标准 YAML 一致的结构）
  @degraded — 不支持语法/缩进混乱 → 抛 YamlSubsetError(行号+原因)。
              调用方 catch → log.error + degraded: true（铁律 24/31），绝不静默。
  @error  — YamlSubsetError: .line / .msg / .retryable=False（格式错误不可重试）
"""
from __future__ import annotations

import re
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass


class YamlSubsetError(ValueError):
    """YAML 子集解析失败（fail-closed，带行号）。"""

    def __init__(self, line: int, msg: str):
        self.line = line
        self.msg = msg
        self.retryable = False
        super().__init__("line %d: %s" % (line, msg))


_INLINE_LIST_RE = re.compile(r"^\[(.*)\]$")
_QUOTED_ITEM_RE = re.compile(r'^"([^"]*)"\s*,\s*"(.*)"$')


def _parse_inline_list(raw: str, line: int):
    """解析单行内联列表 ["a", 1, "b"] —— 唯一支持的 flow 语法。"""
    m = _INLINE_LIST_RE.match(raw.strip())
    if not m:
        raise YamlSubsetError(line, "不支持的 flow 语法（仅支持单行内联列表 [\"a\", 1]）: %s" % raw[:40])
    inner = m.group(1).strip()
    if inner == "":
        return []
    items = []
    # 逐项按 "..." 或裸标量切分
    i = 0
    n = len(inner)
    while i < n:
        c = inner[i]
        if c == " " or c == ",":
            i += 1
            continue
        if c == '"':
            j = inner.find('"', i + 1)
            while j != -1 and j > i and inner[j - 1] == "\\":
                j = inner.find('"', j + 1)
            if j == -1:
                raise YamlSubsetError(line, "内联列表字符串未闭合: %s" % inner[:40])
            items.append(inner[i + 1:j].replace('\\"', '"').replace("\\\\", "\\"))
            i = j + 1
            # 期望下一个非空字符是 , 或结尾
            k = i
            while k < n and inner[k] == " ":
                k += 1
            if k < n and inner[k] != ",":
                raise YamlSubsetError(line, "内联列表项之间必须用逗号分隔: %s" % inner[:40])
            i = k
        else:
            j = i
            while j < n and inner[j] not in ", ":
                j += 1
            item = inner[i:j]
            items.append(_parse_scalar(item, line))
            i = j
    return items


def _parse_scalar(raw: str, line: int):
    """解析标量: 双引号字符串 / 整数 / 浮点 / 布尔 / null / 裸 ASCII 词。"""
    raw = raw.strip()
    if raw == "":
        raise YamlSubsetError(line, "空标量")
    if raw.startswith('"'):
        if not raw.endswith('"') or len(raw) < 2:
            raise YamlSubsetError(line, "字符串未闭合: %s" % raw[:40])
        body = raw[1:-1]
        out = []
        i = 0
        while i < len(body):
            if body[i] == "\\" and i + 1 < len(body) and body[i + 1] in ('"', "\\"):
                out.append(body[i + 1])
                i += 2
            elif body[i] == "\\":
                raise YamlSubsetError(line, "不支持的转义: %s" % body[i:i + 4])
            else:
                out.append(body[i])
                i += 1
        return "".join(out)
    if raw.startswith("'"):
        if not raw.endswith("'") or len(raw) < 2:
            raise YamlSubsetError(line, "字符串未闭合: %s" % raw[:40])
        return raw[1:-1]
    low = raw.lower()
    if low == "true":
        return True
    if low == "false":
        return False
    if low in ("null", "~"):
        return None
    if re.match(r"^-?\d+$", raw):
        return int(raw)
    if re.match(r"^-?\d+\.\d+$", raw):
        return float(raw)
    # 裸标量只允许 ASCII 词（含 - _ . / 空格与部分标点），中文必须加引号（fail-closed）
    if re.match(r"^[A-Za-z0-9][A-Za-z0-9_.\-/() ]*$", raw):
        return raw
    raise YamlSubsetError(line, "裸标量含不支持的字符（中文/特殊符号请加双引号）: %s" % raw[:40])


def _is_scalar_start(content: str) -> bool:
    """该行是否是 key: value 形式（而非嵌套容器 key:）。"""
    return not content.endswith(":")


def _strip_inline_comment(raw: str) -> str:
    """剥掉行尾注释（引号外的 ' #' 及之后内容）。"""
    in_dquote = False
    i = 0
    n = len(raw)
    while i < n:
        c = raw[i]
        if c == '"' and (i == 0 or raw[i - 1] != "\\"):
            in_dquote = not in_dquote
        elif c == "#" and not in_dquote and i > 0 and raw[i - 1] == " ":
            return raw[:i]
        i += 1
    return raw


def parse(text: str):
    """解析 YAML 子集文本 → dict/list。失败抛 YamlSubsetError。"""
    lines = []
    for lineno, raw in enumerate(text.splitlines(), 1):
        stripped = _strip_inline_comment(raw).strip()
        if stripped == "" or stripped.startswith("#"):
            continue
        raw = _strip_inline_comment(raw).rstrip()
        if raw != raw.lstrip(" \t"):
            if "\t" in raw[: len(raw) - len(raw.lstrip(" \t"))]:
                raise YamlSubsetError(lineno, "缩进禁止使用 Tab")
        indent = len(raw) - len(raw.lstrip(" "))
        lines.append((lineno, indent, stripped))
    if not lines:
        return {}
    value, consumed = _parse_block(lines, 0, 0)
    if consumed != len(lines):
        lno, _, c = lines[consumed]
        raise YamlSubsetError(lno, "无法解析的行（缩进越界或语法不支持）: %s" % c[:40])
    return value


def _parse_block(lines, start: int, indent: int):
    """解析一个缩进块：mapping 或 list。返回 (value, next_index)。"""
    if start >= len(lines):
        return {}, start
    first_content = lines[start][2]
    if first_content.startswith("- "):
        return _parse_list(lines, start, indent)
    return _parse_mapping(lines, start, indent)


def _parse_mapping(lines, start: int, indent: int):
    result = {}
    i = start
    while i < len(lines):
        lno, ind, content = lines[i]
        if ind < indent:
            break
        if ind > indent:
            raise YamlSubsetError(lno, "缩进过深（%d > %d）: %s" % (ind, indent, content[:40]))
        if content.startswith("- "):
            raise YamlSubsetError(lno, "mapping 中出现列表项（缺少父级列表）: %s" % content[:40])
        key, rest = _split_key(content, lno)
        if key in result:
            raise YamlSubsetError(lno, "重复键: %s" % key)
        if rest == "":
            # 嵌套容器
            if i + 1 >= len(lines) or lines[i + 1][1] <= indent:
                raise YamlSubsetError(lno, "键 %s 没有值" % key)
            value, i = _parse_block(lines, i + 1, lines[i + 1][1])
            result[key] = value
        else:
            result[key] = _parse_value(rest, lno)
            i += 1
    return result, i


def _parse_list(lines, start: int, indent: int):
    result = []
    i = start
    while i < len(lines):
        lno, ind, content = lines[i]
        if ind < indent:
            break
        if ind != indent:
            raise YamlSubsetError(lno, "列表项缩进不一致（%d != %d）: %s" % (ind, indent, content[:40]))
        if not content.startswith("- "):
            raise YamlSubsetError(lno, "列表内出现非列表行: %s" % content[:40])
        item = content[2:].strip()
        if item == "":
            raise YamlSubsetError(lno, "空列表项")
        if item.startswith('"') or item.startswith("'") or item.startswith("["):
            result.append(_parse_value(item, lno))
            i += 1
            continue
        key, rest = _split_key(item, lno)
        item_map = {}
        if rest == "":
            # 嵌套容器作为列表项的值
            if i + 1 >= len(lines) or lines[i + 1][1] <= indent:
                raise YamlSubsetError(lno, "列表项键 %s 没有值" % key)
            value, i = _parse_block(lines, i + 1, lines[i + 1][1])
            item_map[key] = value
        else:
            item_map[key] = _parse_value(rest, lno)
            i += 1
            # 同列表项后续键（必须与首个后续键缩进一致——fail-closed，宽松缩进是 bug 源）
            first_key_indent = None
            while i < len(lines) and lines[i][1] > indent:
                lno2, ind2, content2 = lines[i]
                if content2.startswith("- "):
                    break
                if ind2 <= indent:
                    break
                if first_key_indent is None:
                    first_key_indent = ind2
                elif ind2 != first_key_indent:
                    raise YamlSubsetError(lno2, "列表项键缩进不一致（%d != %d）: %s"
                                          % (ind2, first_key_indent, content2[:40]))
                k2, r2 = _split_key(content2, lno2)
                if k2 in item_map:
                    raise YamlSubsetError(lno2, "重复键: %s" % k2)
                if r2 == "":
                    if i + 1 >= len(lines) or lines[i + 1][1] <= ind2:
                        raise YamlSubsetError(lno2, "键 %s 没有值" % k2)
                    value2, i = _parse_block(lines, i + 1, lines[i + 1][1])
                    item_map[k2] = value2
                else:
                    item_map[k2] = _parse_value(r2, lno2)
                    i += 1
        result.append(item_map)
    return result, i


def _split_key(content: str, lno: int):
    if content.endswith(":"):
        key = content[:-1].strip()
        if key == "":
            raise YamlSubsetError(lno, "空键")
        return key, ""
    idx = content.find(": ")
    if idx == -1:
        raise YamlSubsetError(lno, "不是 key: value 形式: %s" % content[:40])
    key = content[:idx].strip()
    if key == "" or not re.match(r"^[A-Za-z0-9_.\-]+$", key):
        raise YamlSubsetError(lno, "非法键名: %s" % key[:40])
    return key, content[idx + 2:].strip()


def _parse_value(rest: str, lno: int):
    if rest.startswith("["):
        return _parse_inline_list(rest, lno)
    return _parse_scalar(rest, lno)


def load_file(path: str):
    """读取并解析文件 → dict。IO/编码错误一并抛 YamlSubsetError。"""
    try:
        with open(path, "r", encoding="utf-8") as f:
            text = f.read()
    except OSError as e:
        raise YamlSubsetError(0, "读取失败: %s (%s)" % (path, e))
    return parse(text)


if __name__ == "__main__":
    # 自检: 解析参数给出的文件并打印结构摘要
    if len(sys.argv) != 2:
        print("用法: python3 productline_yaml.py <file>", file=sys.stderr)
        sys.exit(2)
    try:
        data = load_file(sys.argv[1])
    except YamlSubsetError as e:
        print("degraded: YAML 子集解析失败: %s" % e, file=sys.stderr)
        sys.exit(2)
    print("OK: %s -> %s" % (sys.argv[1], type(data).__name__))
    sys.exit(0)
