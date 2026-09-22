#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
check-ownership.py — 模块域归属校验器（D733；ownership.yaml 的唯一机器消费者）

一句话: 回答「这个写集属于哪条线？派给 X 线是否越域？」——把只写在
        docs/synova/coordination/TASK-ROUTING.md 里的人读域划分，变成可机器判定的门禁。

背景（D733 派单 §一）: 域划分此前零机器消费者，Codeowners 26 条规则里 Win 域靠 `src/`
兜底且排在 Mac 例外之后（CODEOWNERS 语义 = 最后匹配者胜出 → 例外被吞）。后果是
CTO 2026-09-13 两次派错线（D728/D729 写集 100% 落 Win 域却派给 Mac 线）。

D911 切片 B（2026-09-22，「代行」机制 —— 本件为切片 B 前半 B1/B2/B4/B5）:
  B1 `standby:` 段 = **单点开关**（在 ownership.yaml；当前仅 win 离线 → mac 代行）。
     **win 回归 = 删该段，立即恢复严格**（该段是「事实状态登记」，不是权限授予）。
  B2 `--proxy <域>=<代行域>` = **代行断言路径**：逐条打印被代行文件的归属 + 理由。
     只有 ownership.yaml 的 standby 段**授权过的 (域, 代行域) 对**才生效；未授权/不匹配 →
     ⚠️ 显式打印「不代行」并按原始归属判定（不静默改判、也不是 fail-open）。
  B4 判据钉死：standby 段**缺失** → 严格模式（= 现状，删段即 win 回归，**合法**）；
     段**存在但结构非法（含字段值：`offline_since` 必须是合法 `YYYY-MM-DD` 日期）** →
     exit 2（fail-closed，绝不静默放行）。
  B5 变更集出现 `docs/**` 或 `tests/**` 下**无显式规则的目录**时，显式诊断「这些目录在
     ownership.yaml 里没有显式规则」（现状是静默落 `**` 兜底 = win，再以误导性的「变更跨域」
     失败，执行方看不出真正的错）。文案按层级区分「顶层目录 / 子目录」，不把既有顶层目录
     称「新目录」。**本件只做诊断性提示，不新增阻断**（派单 §三 零新增红）。

契约（铁律 47）:
  @input  — 位置参数 FILE...: 待校验文件路径（仓库相对，允许尚未创建的文件，如 src/evidence/x.ts）
            选项 --owner {mac|win|k3}  断言每个文件归属该 owner（越域 → exit 1）
                 --proxy <域>=<代行域> 声明代行（可重复；须与 standby 段授权一致才生效；
                                       **域值非法（未知域）→ exit 2**；合法但未授权的域对 → 不代行 + exit 1）
                 --yaml PATH            ownership.yaml 路径（默认 docs/synova/coordination/ownership.yaml）
                 --emit-codeowners      生成 .github/CODEOWNERS 全文到 stdout（不校验文件）
                 --quiet                只输出结论行（⚠️/❌/代行 警示不受抑制）
  @output — stdout 逐文件一行 "<owner> <path>"；代行命中逐条 `↪ 代行 <原域>→<代行域>` + 归属/理由；
             B5 目录未登记逐条 `⚠️` 点名；越域/跨域逐行点名「期望 X 实际 Y」；
             --emit-codeowners → CODEOWNERS 全文（UTF-8 + LF，与 .github/CODEOWNERS 逐字节可比）；
             **standby 段不是 CODEOWNERS 的输入**（删段重跑 → 输出逐字节不变）= 单点开关无双写点
  @exit   — 0 = 全部文件与声明 owner 一致；或未声明 owner 时全部同域（含全部无归属）
            1 = **确实**越域（声明 owner ≠ 实际归属）或跨域（未声明 owner 但出现 >1 个域）
            2 = 检查执行失败（yaml 缺失/解析失败/未知 owner/无输入/解析器不可用/
                **standby 段结构或字段值非法**/--proxy 语法非法/--proxy 域值非法）—— fail-closed
  @degraded — 无规则匹配的文件 → stdout「⚠️ 无归属规则」明示 + 不计阻断（不静默）；
               未授权/不匹配的 --proxy 声明 → stdout「⚠️ 不代行」明示（不静默、不阻断升级）；
               B5 目录未登记 → stdout「⚠️」显式诊断（不静默、本件不阻断）；
               其余失败一律 exit 2，绝不与「通过」混同（D328 三态）
   域判定豁免（D734）: ownership.yaml 的 domain_neutral 列出的路径（各线都写自己那一份的
               簿记/过程产物）在**两种模式下都不判域**，只明示 `domain-neutral`；
               它们仍留在 rules 里供 CODEOWNERS 生成使用。
  @error  — 不抛异常给调用方；全部经退出码表达（Ctrl-tower 模式 1）
"""
from __future__ import annotations

import argparse
import datetime
import fnmatch
import sys
from pathlib import Path

# UTF-8 + LF 强制（PLATFORM-CHECKLIST #4；newline="\n" 防 Windows 把 CODEOWNERS 写成 CRLF）
try:
    sys.stdout.reconfigure(encoding="utf-8", newline="\n")
except (AttributeError, ValueError):  # PowerShell 重定向等场景 reconfigure 不可用
    pass

SCRIPT_PATH = Path(__file__).resolve()
REPO_ROOT = SCRIPT_PATH.parent.parent.parent
DEFAULT_YAML = REPO_ROOT / "docs" / "synova" / "coordination" / "ownership.yaml"
CODEOWNERS_GLOB_FOR_CATCHALL = "*"  # ownership.yaml 的 "**" → CODEOWNERS 的 "*"（唯一一条生成期变换）

# D911 B5: 只对这两个根目录下的「未登记子目录」做诊断（派单 §一 B5 原话）
B5_ROOTS = ("docs", "tests")
# D911 B1/B4: standby 条目必填字段（缺 → exit 2）。offline_since / domains 可选（有缺省）。
STANDBY_REQUIRED_FIELDS = ("proxy", "authority")

EXIT_OK = 0
EXIT_VIOLATION = 1
EXIT_FAILED = 2


def _die(msg: str) -> None:
    """检查执行失败 → exit 2（fail-closed，绝不与通过混同）。"""
    print("❌ check-ownership: %s" % msg, file=sys.stderr)
    sys.exit(EXIT_FAILED)


def _load_parser():
    """载入仓内严格 YAML 子集解析器（零三方依赖；本机实测 PyYAML 不可用）。

    @input  — 无
    @output — productline_yaml 模块对象
    @degraded — 不可用 → exit 2（fail-closed；不静默跳过归属校验）
    """
    mod_dir = REPO_ROOT / "scripts" / "product-lines"
    if not mod_dir.is_dir():
        _die("YAML 子集解析器目录不存在: %s" % mod_dir)
    sys.path.insert(0, str(mod_dir))
    try:
        import productline_yaml  # noqa: E402  (路径注入后才能导入)

        return productline_yaml
    except ImportError as e:
        _die("YAML 子集解析器不可用（%s）→ 无法校验归属" % e)


def known_owners(data, rules, github) -> set:
    """已知域集合 = owners 段键 ∪ rules 的 owner ∪ github 段键。

    @input  — data: ownership.yaml 顶层映射；rules / github（见 load_ownership）
    @output — set[str]（standby / --proxy 的域名合法性判据）
    @degraded — owners 段存在但非映射 → exit 2（fail-closed）
    """
    owners = {str(r["owner"]) for r in rules} | {str(k) for k in github}
    section = data.get("owners")
    if section is not None:
        if not isinstance(section, dict):
            _die("ownership.yaml 的 owners 段必须是映射")
        owners |= {str(k) for k in section}
    return owners


def _parse_standby(data, known) -> dict:
    """解析并**结构校验** ownership.yaml 的 standby 段（D911 B1/B4）。

    @input  — data: yaml 顶层映射；known: 已知域集合（known_owners）
    @output — {offline_domain: {"proxy": str, "authority": str,
                                "offline_since": str|None, "domains": [str]}}
    @degraded — **段缺失 → {}（严格模式 = 现状，合法；删段即「win 回归」）**；
                段存在但结构非法（非映射/空映射/未知域/缺 proxy|authority/proxy=自身/
                domains 非非空列表或不含自身域）→ _die → exit 2（fail-closed）
    """
    section = data.get("standby")
    if section is None:
        return {}
    if not isinstance(section, dict):
        _die("standby 段必须是映射（<离线域>: {proxy/authority/...}），实际为 %s —— 格式非法 → fail-closed"
             % type(section).__name__)
    if not section:
        _die("standby 段是空映射 —— 语义不明（删掉整段 = win 回归，写空 = 非法）→ fail-closed")
    out = {}
    for domain, entry in section.items():
        d = str(domain)
        if d not in known:
            _die("standby[%s]: 未知域（已知域: %s）" % (d, ", ".join(sorted(known))))
        if not isinstance(entry, dict):
            _die("standby[%s]: 值必须是映射（proxy/authority/offline_since/domains）" % d)
        for field in STANDBY_REQUIRED_FIELDS:
            v = entry.get(field)
            if not isinstance(v, str) or not v.strip():
                _die("standby[%s]: 必填字段 %s 缺失/非字符串/空 —— 无授权出处的代行不生效 → fail-closed"
                     % (d, field))
        proxy = str(entry["proxy"]).strip()
        if proxy not in known:
            _die("standby[%s]: proxy=%s 不是已知域（%s）" % (d, proxy, ", ".join(sorted(known))))
        if proxy == d:
            _die("standby[%s]: proxy 不能等于自身（%s）—— 代行必须跨域" % (d, proxy))
        since = entry.get("offline_since")
        if since is not None:
            if not isinstance(since, str) or not since.strip():
                _die("standby[%s]: offline_since 必须是非空字符串（YYYY-MM-DD，如 \"2026-09-20\"）" % d)
            since = since.strip()
            # 返工 1（B4 判据钉到字段值）: 坏日期会被 B2 原样织进「理由」串，而理由串是 K3 可核的
            #   审计链 —— 坏值进链 = 审计证据不可信。故不做「宽松接受」，fail-closed。
            if len(since) != 10 or since[4] != "-" or since[7] != "-":
                _die("standby[%s]: offline_since=%r 不是 YYYY-MM-DD（10 字符 + 连字符位）→ fail-closed"
                     % (d, since))
            try:
                datetime.date.fromisoformat(since)
            except ValueError:
                _die("standby[%s]: offline_since=%r 不是合法日历日期（月/日越界）→ 坏值不进审计链 → fail-closed"
                     % (d, since))
        domains = entry.get("domains")
        if domains is None:
            domains = [d]
        if not isinstance(domains, list) or not domains:
            _die("standby[%s]: domains 必须是非空列表（单行内联写法 [\"%s\"]）" % (d, d))
        domains = [str(x) for x in domains]
        unknown = [x for x in domains if x not in known]
        if unknown:
            _die("standby[%s]: domains 含未知域 %s（已知域: %s）" % (d, unknown, ", ".join(sorted(known))))
        if d not in domains:
            _die("standby[%s]: domains 必须包含自身域 %s（当前 %s）" % (d, d, domains))
        out[d] = {
            "proxy": proxy,
            "authority": str(entry["authority"]).strip(),
            "offline_since": since,
            "domains": domains,
        }
    return out


def load_ownership(yaml_path: Path):
    """读 ownership.yaml → (rules, github_owner_map, domain_neutral, standby, known_owners)。

    @input  — yaml_path: ownership.yaml 路径
    @output — (rules: list[dict], github: dict, neutral: list[str], standby: dict, known: set[str])；
              rules 保持文件顺序（最后匹配者胜出）；neutral 缺省为空列表；
              **standby 段缺失 → {}（= 严格模式，不是错误；D911 B4）**
    @degraded — 文件缺失 / 解析失败 / 结构非法（含 standby 段非法、offline_since 非 YYYY-MM-DD）
                → exit 2（fail-closed）
    """
    parser = _load_parser()
    if not yaml_path.is_file():
        _die("ownership.yaml 不存在: %s（检查执行失败，非「通过」）" % yaml_path)
    try:
        data = parser.load_file(str(yaml_path))
    except parser.YamlSubsetError as e:
        _die("ownership.yaml 解析失败: %s" % e)
    if not isinstance(data, dict):
        _die("ownership.yaml 顶层必须是映射（key: value），实际为 %s" % type(data).__name__)
    rules = data.get("rules")
    if not isinstance(rules, list) or not rules:
        _die("ownership.yaml 缺少非空 rules 列表")
    for i, r in enumerate(rules):
        if not isinstance(r, dict) or "glob" not in r or "owner" not in r:
            _die("rules[%d] 必须是含 glob/owner 的映射" % i)
    github = data.get("github") or {}
    if not isinstance(github, dict):
        _die("ownership.yaml 的 github 段必须是映射")
    neutral = data.get("domain_neutral") or []
    if not isinstance(neutral, list):
        _die("ownership.yaml 的 domain_neutral 必须是列表")
    known = known_owners(data, rules, github)
    standby = _parse_standby(data, known)
    return rules, github, [str(g) for g in neutral], standby, known


def glob_match(glob: str, path: str) -> bool:
    """单条 glob 是否匹配仓库相对路径。

    @input  — glob: 规则里的模式（"**" / "dir/**" / 含 * 的路径）；path: 仓库相对路径
    @output — bool（"dir/**" 同时覆盖目录本身 "dir"，B5 的目录登记判定依赖此语义）
    @degraded — 无（纯函数）
    """
    if glob == "**":
        return True
    if glob.endswith("/**"):
        prefix = glob[:-3]
        return path == prefix or path.startswith(prefix + "/")
    return fnmatch.fnmatchcase(path, glob)


def normalize(path: str) -> str:
    """仓库相对路径归一（Windows 反斜杠 / 前导 ./ 与 /）。"""
    p = path.replace("\\", "/").strip()
    while p.startswith("./"):
        p = p[2:]
    return p.lstrip("/")


def resolve_owner_rule(rules, path: str):
    """按「最后匹配者胜出」解析单文件归属，并返回命中的规则。

    @input  — rules: 规则列表（文件顺序）；path: 仓库相对路径
    @output — (owner|None, rule|None)；无任何规则匹配 → (None, None)（调用方须明示，不得静默）
    @degraded — 无（纯函数）
    """
    owner, hit = None, None
    for r in rules:
        if glob_match(str(r["glob"]), path):
            owner, hit = str(r["owner"]), r
    return owner, hit


def resolve_owner(rules, path: str):
    """兼容包装: 只取归属（见 resolve_owner_rule 契约）。"""
    return resolve_owner_rule(rules, path)[0]


def parse_proxy_pair(text: str):
    """argparse type: 解析 --proxy <域>=<代行域>。

    @input  — "win=mac"
    @output — ("win", "mac")
    @degraded — 格式非法（无 '=' / 多 '=' / 空串）→ argparse.ArgumentTypeError → exit 2（用法错误，fail-closed）
    """
    if text.count("=") != 1:
        raise argparse.ArgumentTypeError("格式必须是 <域>=<代行域>（如 win=mac），实际: %r" % text)
    d, p = (s.strip() for s in text.split("=", 1))
    if not d or not p:
        raise argparse.ArgumentTypeError("域与代行域都不能为空，实际: %r" % text)
    return d, p


def resolve_proxies(standby, pairs):
    """把 --proxy 声明与 standby 段授权逐条对照（只有 yaml 授权过的对才生效）。

    @input  — standby: _parse_standby 结果；pairs: [(domain, proxy), ...]（CLI 顺序）
    @output — (effective: dict[domain→proxy], rejected: list[(domain, proxy, why)])
    @degraded — 未授权 / 不匹配的声明 → 放进 rejected，**调用方必须 ⚠️ 显式打印**
                （不静默改判、不静默丢弃；按原始归属继续判定 = 「代行断言未声明 → 不代行」）
    """
    effective, rejected = {}, []
    for d, p in pairs:
        entry = standby.get(d)
        if entry is None:
            rejected.append((d, p, "standby 段无「%s」条目（该域未登记离线；删段 = win 回归 = 严格）" % d))
            continue
        if entry["proxy"] != p:
            rejected.append((d, p, "standby[%s].proxy=%s，与声明不一致" % (d, entry["proxy"])))
            continue
        effective[d] = p
    return effective, rejected


def is_registered_dir(rules, d: str) -> bool:
    """目录 d 是否被 ownership.yaml 的**显式规则**（非 `**` 兜底）登记。

    @input  — rules: 规则列表；d: 目录路径（如 "tests/agent"）
    @output — bool（"tests/agent/**" 规则经 glob_match 同时覆盖目录本身 "tests/agent"）
    @degraded — 无（纯函数）
    """
    for r in rules:
        if r.get("default"):
            continue
        if glob_match(str(r["glob"]), d):
            return True
    return False


def unregistered_dir_for(rules, path: str):
    """path 所在的最深「未登记目录」（D911 B5 诊断用）。

    @input  — rules: 规则列表；path: 仓库相对路径
    @output — str|None；None = 该路径被显式规则覆盖，或不在 docs/**、tests/** 下
    @degraded — 无（纯函数）
    @note   — 只在路径**未被任何显式规则覆盖**时报告；报告单元 = 最深的未登记祖先目录
              （"tests/agent/x.ts" → "tests/agent"；"tests/a.test.ts" → "tests"）。
    """
    parts = path.split("/")
    if not parts or parts[0] not in B5_ROOTS:
        return None
    if any((not r.get("default")) and glob_match(str(r["glob"]), path) for r in rules):
        return None
    deepest = None
    for i in range(1, len(parts)):
        d = "/".join(parts[:i])
        if not is_registered_dir(rules, d):
            deepest = d
    return deepest


def default_owner(rules):
    """兜底规则（default: true）的 owner；无兜底 → None（由调用方明示）。"""
    for r in rules:
        if r.get("default"):
            return str(r["owner"])
    return None


def emit_codeowners(rules, github) -> str:
    """由 ownership.yaml 生成 CODEOWNERS 全文（生成期变换: "**" → "*"）。

    @input  — rules / github（见 load_ownership）。**standby 段刻意不是本函数的输入**：
              「win 回归」只改 ownership.yaml 一处，CODEOWNERS 零 churn（单点开关，无双写点）。
    @output — 文本（UTF-8，LF 结尾）
    @degraded — github 段缺 owner → 该行报错信息写入 stderr 并 exit 2（不产出半截文件）
    """
    out = [
        "# .github/CODEOWNERS — 【生成产物，请勿手改】",
        "# 源: docs/synova/coordination/ownership.yaml（唯一权威；改那里再重跑下面的命令）",
        "# 生成: python3 scripts/control-tower/check-ownership.py --emit-codeowners > .github/CODEOWNERS",
        "# 漂移门禁: tests/control-tower/ownership.test.sh 逐字节断言本文件 == 生成结果（D733）",
        "# 语义: CODEOWNERS「最后匹配者胜出」→ 宽规则在前、例外在后（与 ownership.yaml 同序）。",
        "#",
        "# owner 账号体系待创始人定（2026-08-16 B1 落地）：当前全部指向主账号 @tangbaobao520",
        "# （兜底 = 创始人最终把关）。建议建三个团队 @synova-dsh / @synova-claude / @synova-k3，",
        "# 改 ownership.yaml 的 github: 段后重跑生成命令即可 —— 本文件不需要手改。",
        "",
    ]
    width = max(len(CODEOWNERS_GLOB_FOR_CATCHALL if r["glob"] == "**" else str(r["glob"])) for r in rules)
    width = max(width, 40)
    for r in rules:
        pattern = CODEOWNERS_GLOB_FOR_CATCHALL if r["glob"] == "**" else str(r["glob"])
        handle = github.get(str(r["owner"]))
        if not handle:
            _die("github 段缺少 owner「%s」的账号（规则 %s）" % (r["owner"], r["glob"]))
        territory = r.get("territory")
        if isinstance(territory, list) and territory:
            # 派单 §一.2「Win 域必须显式列出」：兜底行的领地正面枚举在产物里可见
            out.append("# %s 领地（显式列出）: %s" % (r["owner"], "、".join(str(t) for t in territory)))
        out.append("%-*s %s" % (width, pattern, handle))
    return "\n".join(out) + "\n"


def main(argv) -> int:
    ap = argparse.ArgumentParser(
        prog="check-ownership.py",
        description="模块域归属校验（D733）：越域 exit 1，检查执行失败 exit 2；代行见 --proxy（D911）",
    )
    ap.add_argument("files", nargs="*", help="待校验文件（仓库相对路径）")
    ap.add_argument("--owner", choices=["mac", "win", "k3"], default=None, help="声明 owner；逐文件断言归属")
    ap.add_argument("--proxy", action="append", type=parse_proxy_pair, default=None, metavar="域=代行域",
                    help="代行断言（可重复，如 --proxy win=mac）；须与 ownership.yaml 的 standby 段授权一致才生效")
    ap.add_argument("--yaml", default=str(DEFAULT_YAML), help="ownership.yaml 路径")
    ap.add_argument("--emit-codeowners", action="store_true", help="生成 CODEOWNERS 全文到 stdout")
    ap.add_argument("--quiet", action="store_true", help="只输出结论行（⚠️/❌/代行 警示不受抑制）")
    args = ap.parse_args(argv)

    rules, github, neutral, standby, known = load_ownership(Path(args.yaml))

    if args.emit_codeowners:
        if args.proxy:
            _die("--proxy 与 --emit-codeowners 互斥（生成产物不代行；代行只作用于归属判定）")
        sys.stdout.write(emit_codeowners(rules, github))
        return EXIT_OK

    # 返工 2（三态分类统一）: `--proxy <域>=<代行域>` 的**域值非法** = 调用者给坏参数
    #   → exit 2（「判不了/参数坏」），不与「确实越域 → exit 1」混同（D328）。
    #   合法但**未授权**的域对（如 k3=mac / mac=win）仍走 exit 1 + ⚠️ 不生效（红线不动）。
    for d, p in (args.proxy or []):
        for label, val in (("域", d), ("代行域", p)):
            if val not in known:
                _die("--proxy %s=%s: %s「%s」不在已知域集合 %s —— 坏参数 → fail-closed（exit 2，"
                     "不与「越域 exit 1」混同）" % (d, p, label, val, sorted(known)))

    if not args.files:
        _die("未给出待校验文件（用法: check-ownership.py <文件...> [--owner mac|win|k3] [--proxy win=mac]）")

    effective, rejected = resolve_proxies(standby, args.proxy or [])

    rows = []          # (path, raw_owner|None, matched_rule|None)
    unmatched = []
    neutral_rows = []
    for raw in args.files:
        path = normalize(raw)
        if not path:
            continue
        if any(glob_match(g, path) for g in neutral):
            neutral_rows.append(path)   # 域判定豁免：两种模式都不判域，只明示（各线都写的那一份）
            continue
        owner, rule = resolve_owner_rule(rules, path)
        rows.append((path, owner, rule))
        if owner is None:
            unmatched.append(path)

    for path in neutral_rows:
        print("·   domain-neutral  %s" % path)
    if not rows and not neutral_rows:
        _die("待校验文件列表为空（全为空白路径）")

    # ── D911 B2: --proxy 声明逐条回执（生效 / 不生效都显式打印，绝不静默）──
    for d, p, why in rejected:
        print("⚠️  --proxy %s=%s 不生效: %s —— 不代行，按原始归属判定" % (d, p, why))

    proxied = []   # (path, raw_owner, proxy_owner, rule, entry)
    eff_rows = []  # (path, effective_owner|None)
    for path, owner, rule in rows:
        if owner is not None and owner in effective:
            entry = standby[owner]
            proxied.append((path, owner, effective[owner], rule, entry))
            eff_rows.append((path, effective[owner]))
        else:
            eff_rows.append((path, owner))

    for path, raw_owner, proxy_owner, rule, entry in proxied:
        glob_txt = "规则 glob=%s" % (rule.get("glob") if rule else "?")
        if rule is not None and rule.get("default"):
            glob_txt += "（兜底/default）"
        print("↪   代行 %s→%s  %s" % (raw_owner, proxy_owner, path))
        print("      · 归属: 原始 owner=%s（%s）→ 代行 owner=%s" % (raw_owner, glob_txt, proxy_owner))
        print("      · 理由: standby[%s] offline_since=%s｜授权: %s"
              % (raw_owner, entry.get("offline_since") or "未记录", entry["authority"]))
        print("      · 依据: 本次命令行显式声明 --proxy %s=%s（win 回归 = 删 standby 段后本行不再出现）"
              % (raw_owner, proxy_owner))

    if not args.quiet:
        for path, owner in eff_rows:
            if owner is None:
                print("⚠️  无归属规则  %s" % path)
            else:
                print("%-4s %s" % (owner, path))
        print("")

    for path in unmatched:
        print("⚠️  %s 无归属规则匹配 —— 未计入阻断（ownership.yaml 可能缺规则或兜底被删）" % path)

    # ── D911 B5: 目录无显式规则 → 显式诊断（真正的错是「该目录没登记」，不是「变更跨域」）──
    #   返工 3（文案）: `tests` / `docs` 是**既有**顶层目录，不得叫「新目录」——统一说
    #   「无显式规则的目录」，并按层级标注（顶层目录 / 子目录）。逻辑、阻断、范围均不变。
    unregistered = {}   # dir -> [paths]
    for path, _owner, _rule in rows:
        d = unregistered_dir_for(rules, path)
        if d:
            unregistered.setdefault(d, []).append(path)
    if unregistered:
        fallback = default_owner(rules)
        print("⚠️  B5 目录未登记（ownership.yaml 内**无显式规则** → 落 `**` 兜底 = %s）:"
              % (fallback if fallback else "无兜底/无归属"))
        for d in sorted(unregistered):
            kind = "顶层目录" if "/" not in d else "子目录"
            print("      %s  ←  %s（%s：无显式规则）" % (d, "、".join(unregistered[d]), kind))
        print("    ⚠️  真正的错是「这些目录在 ownership.yaml 里没有显式规则」——不是「变更跨域」。修复:")
        print("       1) 在 docs/synova/coordination/ownership.yaml 为上述目录补一条**显式规则**（登记到正确域）")
        print("       2) 重跑: python3 scripts/control-tower/check-ownership.py --emit-codeowners > .github/CODEOWNERS")
        print("       （win 离线期代行另见 --proxy；本提示不新增阻断）")

    violations = []
    if args.owner is not None:
        for path, owner in eff_rows:
            if owner is not None and owner != args.owner:
                violations.append((path, owner))
    for path, actual in violations:
        print("❌ 越域: %s —— 声明 owner=%s，实际 owner=%s" % (path, args.owner, actual))

    n_proxy = len(proxied)
    n_neutral = len(neutral_rows)
    if args.owner is not None:
        if violations:
            print("❌ FAIL 越域 %d 处（声明 owner=%s，代行 %d）" % (len(violations), args.owner, n_proxy))
            return EXIT_VIOLATION
        print("✅ PASS %d 个文件全部归属 owner=%s（无归属 %d，代行 %d）"
              % (len(eff_rows) - len(unmatched), args.owner, len(unmatched), n_proxy))
        return EXIT_OK

    domains = sorted({owner for _, owner in eff_rows if owner is not None})
    _suffix = "（无归属 %d，域判定豁免 %d，代行 %d）" % (len(unmatched), n_neutral, n_proxy)
    if len(domains) > 1:
        print("❌ FAIL 跨域: 变更落在 %d 个域 %s —— 单个 PR 只许一个域%s" % (len(domains), domains, _suffix))
        if unregistered:
            print("   ⚠️  上面点名的「无显式规则的目录」可能就是本次跨域的真因：若这些路径本不该属 %s，"
                  "修复 = 补登记（见上），不是改代码。" % (default_owner(rules) or "该域"))
        if standby and not effective:
            for d in sorted(standby):
                print("   💡 %s 已在 standby 段登记离线（代行 %s）—— 若本次跨域来自它，用 --proxy %s=%s 声明代行。"
                      % (d, standby[d]["proxy"], d, standby[d]["proxy"]))
        return EXIT_VIOLATION
    shown = domains[0] if domains else "无归属"
    print("✅ PASS %d 个文件同域: %s%s" % (len(eff_rows) - len(unmatched), shown, _suffix))
    return EXIT_OK


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
