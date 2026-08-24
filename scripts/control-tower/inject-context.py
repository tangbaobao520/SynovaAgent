#!/usr/bin/env python3
"""
inject-context.py - 上下文注射器 (D200)

权威文档 #17 §3-§4：从 task brief 中解析权威文档引用，提取关键片段，
注入到 Q1c 字段。Agent 打开 brief 时，权威文档内容已经在那里。

用法:
  python3 inject-context.py <task-brief-path>
  python3 inject-context.py <task-brief-path> --verify

契约:
  @input  - task brief Markdown 文件路径
  @output - 同一文件，Q1c 字段追加注入上下文
  @degraded - 文档未找到 -> 注入告警 + 继续
"""
import json
import os
import re
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Optional, Tuple

# ═══ 路径 ═══

SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
REGISTRY_PATH = SCRIPT_DIR / "doc-registry.json"


# ═══ 加载注册表 ═══

def load_registry() -> Dict[str, str]:
    """加载权威文档 ID 映射表。"""
    try:
        with open(REGISTRY_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        return {**data.get("docs", {}), **data.get("aliases", {})}
    except (FileNotFoundError, json.JSONDecodeError) as e:
        print(f"[注射器] [!] 注册表加载失败: {e}", file=sys.stderr)
        return {}


# ═══ 解析 brief ═══

def parse_brief(text: str) -> List[str]:
    """
    从 task brief 文本中提取权威文档引用 ID。

    @input  - Markdown 文本
    @output - 文档 ID 列表（如 ["Auth Doc #4", "Auth Doc #17"]）
    @degraded - 无 ID 找到 -> 空列表
    """
    ids: List[str] = []
    # 匹配 "Auth Doc #N" 和 "权威文档 #N" 和 "AN" 模式 + DECISION-REFERENCE (D333)
    patterns = [
        r'(Auth Doc\s*#\d+)',
        r'(权威文档\s*#\d+)',
        r'(?:^|\s)(A\d{1,2})(?:\s|$|\.)',
        r'(DECISION-REFERENCE)',
    ]
    for pat in patterns:
        found = re.findall(pat, text)
        for f in found:
            normalized = f.strip()
            if normalized not in ids:
                ids.append(normalized)
    return ids


def read_brief(path: str) -> Optional[str]:
    """读取 task brief 文件。"""
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    except FileNotFoundError:
        print(f"[注射器] [!] 文件未找到: {path}", file=sys.stderr)
        return None


# ═══ 解析文档 ID ═══

def resolve_doc(doc_id: str, registry: Dict[str, str]) -> Optional[str]:
    """
    将文档 ID 解析为文件路径。

    @input  - 文档 ID（如 "Auth Doc #4"）
    @input  - 注册表字典
    @output - 解析后的完整路径，未找到返回 None
    @degraded - 不在注册表中 -> None
    """
    if doc_id in registry:
        raw_path = registry[doc_id]
        full_path = PROJECT_ROOT / raw_path
        return str(full_path)
    return None


# ═══ 提取片段 ═══

def extract_snippets(doc_path: str) -> Dict[str, list]:
    """
    从权威文档中提取关键片段。

    @input  - 文档路径（文件或目录）
    @output - { edges: [], files: [], functions: [], version: [] }
    @degraded - 路径不存在 -> 空字典
    """
    result: Dict[str, list] = {"edges": [], "files": [], "functions": [], "version": []}

    path_obj = Path(doc_path)
    if not path_obj.exists():
        print(f"[注射器] [!] 路径不存在: {doc_path}", file=sys.stderr)
        return result

    # 收集所有 .md 文件
    md_files = []
    if path_obj.is_dir():
        md_files = list(path_obj.glob("*.md")) + list(path_obj.glob("**/*.md"))
    elif path_obj.is_file() and path_obj.suffix == ".md":
        md_files = [path_obj]

    # 从每个文件中提取
    seen_edges, seen_files, seen_funcs = set(), set(), set()

    for md_file in md_files:
        try:
            content = md_file.read_text(encoding="utf-8")
            lines = content.split("\n")

            for line in lines:
                # Edge ID: E-XX 模式
                for match in re.finditer(r'\b(E-\d{2})\b', line):
                    eid = match.group(1)
                    if eid not in seen_edges:
                        result["edges"].append(eid)
                        seen_edges.add(eid)

                # 文件路径: src/... 或 extensions/...
                for match in re.finditer(r'(\b(?:src|extensions|packages)/[^\s\)\]"\'.,;]+)', line):
                    fp = match.group(1)
                    if fp not in seen_files:
                        result["files"].append(fp)
                        seen_files.add(fp)

                # 函数签名: export function 或 export class
                for match in re.finditer(r'(export\s+(?:function|class|async function|const)\s+\w+)', line):
                    fn = match.group(1)
                    if fn not in seen_funcs:
                        result["functions"].append(fn)
                        seen_funcs.add(fn)

            # 版本戳: 找日期模式
            for match in re.finditer(r'(\d{4}-\d{2}-\d{2})', content):
                if match.group(1) not in result["version"]:
                    result["version"].append(match.group(1))

        except (OSError, UnicodeDecodeError) as e:
            print(f"[注射器] [!] 读取文件失败 {md_file}: {e}", file=sys.stderr)

    # 去重 + 排序
    result["edges"] = sorted(set(result["edges"]))
    result["files"] = sorted(set(result["files"]))[:30]  # 限制数量
    result["functions"] = sorted(set(result["functions"]))[:20]
    result["version"] = sorted(set(result["version"]))

    return result


# ═══ 注入 ═══

def format_injection_block(doc_id: str, snippets: Dict[str, list], version_warning: str = "") -> str:
    """按权威文档 #17 §4 格式生成注入块。"""
    lines = [f"### {doc_id}"]
    if version_warning:
        lines.append(f"> [!] {version_warning}")
    lines.append("")

    # 版本
    if snippets.get("version"):
        lines.append(f"- 版本戳: {', '.join(snippets['version'][:3])}")
    lines.append(f"- 注射时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append("")

    # Edge ID
    if snippets.get("edges"):
        lines.append(f"- 相关 42 边: `{'`, `'.join(snippets['edges'][:15])}`")
        if len(snippets['edges']) > 15:
            lines.append(f"  ...及 {len(snippets['edges']) - 15} 条其他边")
        lines.append("")

    # 文件路径
    if snippets.get("files"):
        lines.append("- 关键文件路径:")
        for fp in snippets['files'][:10]:
            lines.append(f"  - `{fp}`")
        lines.append("")

    # 函数签名
    if snippets.get("functions"):
        lines.append("- 关键函数/类:")
        for fn in snippets['functions'][:8]:
            lines.append(f"  - `{fn}`")
        lines.append("")

    return "\n".join(lines)


def inject_into_brief(brief_path: str, doc_id: str, injection_block: str) -> bool:
    """
    将注入块写入 brief 的 Q1c 字段。

    @input  - brief 文件路径
    @input  - 文档 ID
    @input  - 注入块文本
    @output - True=成功, False=失败
    """
    try:
        with open(brief_path, "r", encoding="utf-8") as f:
            content = f.read()

        # 在 Q1c 之后或 Q2 之前插入
        injection_marker = "\n## 注入上下文\n"
        full_injection = injection_marker + injection_block + "\n"

        # 查找 Q1c 区域
        q1c_match = re.search(r'### c\).*?(?=\n## \w)', content, re.DOTALL)
        if q1c_match:
            # 在 Q1c 内容后追加
            insert_pos = q1c_match.end()
            # 检查是否已有同文档的注入块，有则替换
            existing_pattern = re.escape(f"### {doc_id}") + r".*?(?=\n###|\Z)"
            if re.search(existing_pattern, content[insert_pos:], re.DOTALL):
                # 替换已有注入
                content = re.sub(
                    f"### {re.escape(doc_id)}.*?(?=\n###|\\Z)",
                    injection_block.strip(),
                    content,
                    flags=re.DOTALL,
                )
            else:
                # 追加新注入
                content = content[:insert_pos] + "\n\n" + full_injection + content[insert_pos:]
        else:
            # 找不到 Q1c，追加到文件末尾
            content += "\n\n" + full_injection

        with open(brief_path, "w", encoding="utf-8") as f:
            f.write(content)

        return True
    except (OSError, IOError) as e:
        print(f"[注射器] [!] 写入失败: {e}", file=sys.stderr)
        return False


# ═══ 主函数 ═══

def main():
    """注射器入口。读取 brief -> 解析引用 -> 提取片段 -> 注入。"""
    if len(sys.argv) < 2:
        print("用法: python3 inject-context.py <task-brief-path> [--verify]", file=sys.stderr)
        sys.exit(1)

    brief_path = sys.argv[1]
    verify_mode = "--verify" in sys.argv

    # 1. 读取 brief
    print(f"[注射器] 读取: {brief_path}")
    text = read_brief(brief_path)
    if text is None:
        sys.exit(1)

    # 2. 解析文档引用
    doc_ids = parse_brief(text)
    if not doc_ids:
        print("[注射器] [i] 未找到权威文档引用 - 跳过注射")
        return

    print(f"[注射器] 发现 {len(doc_ids)} 个文档引用: {doc_ids}")

    # 3. 加载注册表
    registry = load_registry()
    if not registry:
        print("[注射器] [!] 注册表为空 - 跳过注射")
        return

    # 4. 对每个文档引用提取 + 注入
    for doc_id in doc_ids:
        doc_path = resolve_doc(doc_id, registry)
        if doc_path is None:
            warning = f"> [!] 文档 ID `{doc_id}` 不在注册表中，未找到对应文件\n"
            inject_into_brief(brief_path, doc_id, warning)
            print(f"[注射器] [!] {doc_id}: 未注册 - 注入告警")
            continue

        # 提取片段
        snippets = extract_snippets(doc_path)

        # D333: DECISION-REFERENCE 是决策框架文档（无 E-XX/src 路径）→ 全文注入
        # 否则 format_injection_block 会生成空壳块（只有标题+时间），框架内容丢失
        if doc_id == "DECISION-REFERENCE" and not snippets.get("edges") and not snippets.get("files"):
            try:
                full_text = Path(doc_path).read_text(encoding="utf-8")
                block = f"### {doc_id}\n\n> D333 决策参考框架全文（创始人 2026-08-13 定）:\n\n" + full_text
                success = inject_into_brief(brief_path, doc_id, block)
                print(f"[注射器] [OK] {doc_id}: 全文注入")
            except OSError as e:
                print(f"[注射器] [!] {doc_id}: 全文读取失败 {e}", file=sys.stderr)
                success = False
            if success:
                continue
        # 检查版本一致性（仅 verify 模式全面检查）
        version_warning = ""
        if snippets["version"]:
            version_warning = f"版本戳: {snippets['version'][0]}"

        # 格式化并注入
        block = format_injection_block(doc_id, snippets, version_warning)
        success = inject_into_brief(brief_path, doc_id, block)

        if success:
            edge_count = len(snippets.get("edges", []))
            file_count = len(snippets.get("files", []))
            func_count = len(snippets.get("functions", []))
            print(f"[注射器] [OK] {doc_id}: {edge_count}边, {file_count}文件, {func_count}函数")
        else:
            print(f"[注射器] [!] {doc_id}: 注入失败")

    if verify_mode:
        print("[注射器] [OK] 验证模式完成")
    else:
        print("[注射器] [OK] 注射完成")


if __name__ == "__main__":
    main()
