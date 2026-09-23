#!/usr/bin/env bash
# 安装 synova-squad-lead 预设：从 CTO 预设派生 agent.cordis.yml（换 persona），再落 preset.yml
set -euo pipefail
REPO="${1:-/Users/wane/SynovaAgent}"
SRC="$REPO/docs/synova/presets/synova-squad-lead"
DST="$HOME/.dsh/.agent-presets/synova-squad-lead"
CTO="$HOME/.dsh/.agent-presets/synova-cto/agent.cordis.yml"
[ -d "$SRC" ] || { echo "缺 $SRC"; exit 1; }
[ -f "$CTO" ] || { echo "缺 CTO 预设（用作 cordis 组成模板）: $CTO"; exit 1; }
mkdir -p "$DST"
cp "$SRC/preset.yml" "$DST/preset.yml"
python3 - "$CTO" "$SRC/SYSTEM-PROMPT.md" "$DST/agent.cordis.yml" <<'PY'
import sys,re
cto,prompt,out=sys.argv[1],sys.argv[2],sys.argv[3]
src=open(cto,encoding='utf-8').read()
persona=open(prompt,encoding='utf-8').read()
# 用新 persona 替换 CTO 预设中 persona 行的 prefix 块（保留其余 composition 行不动）
m=re.search(r'(- id: persona\n\s+name: \'@deepseek-ai/dsh-persona\'\n\s+config:\n\s+prefix: \|-)([\s\S]*?)(?=\n- id: |\Z)', src)
assert m, '未定位 persona prefix 块'
body='\n'.join('      '+l if l.strip() else l for l in persona.rstrip().splitlines())
new=m.group(1)+'\n'+body+'\n'
open(out,'w',encoding='utf-8').write(src[:m.start()]+new+src[m.end():])
print('已生成', out)
PY
echo "✅ 安装完成：$DST（重启 DSH 后在选择器里选 🎽 Synova 小队队长）"
