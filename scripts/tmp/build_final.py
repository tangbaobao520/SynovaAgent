import sys
sys.stdout.reconfigure(encoding='utf-8')

HEAD = r"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>ODC &amp; Last Stand — Research Report 2026-07-04</title>
<style>
:root{--bg:#0d1117;--fg:#c9d1d9;--accent:#58a6ff;--accent2:#3fb950;--warn:#d2991d;--crit:#f85149;--border:#30363d;--card:#161b22;--muted:#8b949e;--h1:#f0f6fc;--purple:#bc8cff;--cyan:#39c5cf}
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--bg);color:var(--fg);font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;font-size:14px;line-height:1.8;max-width:1040px;margin:0 auto;padding:48px 24px 120px}
h1{font-size:1.6rem;color:var(--h1);border-bottom:2px solid var(--accent);padding-bottom:12px;margin-bottom:8px}
h2{font-size:1.2rem;color:var(--h1);margin:44px 0 16px;padding-left:8px;border-left:4px solid var(--accent)}
h3{font-size:1rem;color:var(--h1);margin:28px 0 10px}
h4{font-size:.92rem;color:var(--purple);margin:20px 0 8px}
p,li{margin:0 0 8px}
table{width:100%;border-collapse:collapse;margin:0 0 18px;font-size:.86em}
th{background:var(--card);text-align:left;padding:7px 10px;border:1px solid var(--border);font-weight:600;color:var(--h1)}
td{padding:6px 10px;border:1px solid var(--border);vertical-align:top}
tr:nth-child(even) td{background:rgba(255,255,255,.015)}
.card{background:var(--card);border:1px solid var(--border);border-radius:6px;padding:14px 18px;margin:0 0 16px}
.highlight{background:rgba(88,166,255,.08);border:1px solid var(--accent);border-radius:6px;padding:14px 18px;margin:0 0 16px}
.warn-box{background:rgba(210,153,29,.06);border:1px solid var(--warn);border-radius:6px;padding:14px 18px;margin:0 0 16px}
.crit-box{background:rgba(248,81,73,.06);border:1px solid var(--crit);border-radius:6px;padding:14px 18px;margin:0 0 16px}
.green{color:var(--accent2)}.yellow{color:var(--warn)}.red{color:var(--crit)}.cyan{color:var(--cyan)}.muted{color:var(--muted)}
.divider{border:none;border-top:1px solid var(--border);margin:32px 0}
.formula{font-family:"SF Mono","Cascadia Code",Consolas,monospace;background:var(--card);display:block;padding:12px 16px;border-radius:4px;margin:8px 0;font-size:.92em;color:var(--cyan);letter-spacing:.02em}
.case-tag{display:inline-block;font-size:.78rem;padding:2px 8px;border-radius:3px;margin-right:6px}
.case-netflix{background:rgba(229,9,20,.15);color:#e50914;border:1px solid rgba(229,9,20,.4)}
.case-apple{background:rgba(85,85,85,.2);color:#a0a0a0;border:1px solid rgba(160,160,160,.4)}
.case-bytedance{background:rgba(58,110,165,.2);color:#5a9fd4;border:1px solid rgba(90,159,212,.4)}
ul,ol{margin:6px 0 10px 1.6em}li{margin-bottom:4px}
.ref{font-size:.82em;color:var(--muted)}.ref a{color:var(--accent)}
</style>
</head>
<body>
"""

outpath = r"D:\novis-backup-20260526\Novis\synova-agent\docs\research\growth-diagnostics\RESEARCH-ODC-LastStand-20260704.html"
with open(outpath, 'w', encoding='utf-8') as f:
    f.write(HEAD)

print(f"HEAD written: {len(HEAD)} chars")
