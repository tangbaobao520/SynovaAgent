import sys
sys.stdout.reconfigure(encoding='utf-8')
with open(r"D:\novis-backup-20260526\Novis\synova-agent\scripts\tmp\build_odc.py", "r", encoding="utf-8") as f:
    c = f.read()
# Check if exec or eval of FOOT exists
if "exec(" in c:
    print("exec found")
if "FOOT" in c[c.index("FOOT = r"):]:
    # Check if FOOT is used after definition
    after_foot_def = c[c.index("FOOT = r")+len("FOOT = r"):]
    if "FOOT" in after_foot_def[after_foot_def.index('"""'):]:
        print("FOOT referenced somewhere after")
    else:
        print("FOOT defined but never referenced")
# Show last 300 chars
print("===LAST 300===")
print(c[-300:])
