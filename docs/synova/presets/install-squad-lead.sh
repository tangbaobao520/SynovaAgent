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
txt=src[:m.start()]+new+src[m.end():]

# D931 修复（创始人 2026-09-23 指出「小队是摆设」）：CTO 预设挂的是 **legacy delegation（子代理）**，
#   而 Agent Teams 需要 @deepseek-ai/dsh-experimental-tool-agent-team（README 原文：it replaces
#   legacy subagent controls with the same tool names → 两者同名，须移除 legacy）。不换 = 队长
#   物理上只会开子代理，小队只是面板摆设。
_m=re.search(r'\n- id: delegation\n[\s\S]*?(?=\n- id: |\Z)', txt)
if _m:
    team_blocks = ("\n- id: agent-team\n  name: '@deepseek-ai/dsh-experimental-agent-team'\n"
                   "  config:\n    maxMembers: 4        # 纪律物理化：成员 ≤4（队长 + ≤2 编码 + 1 自验）\n"
                   "    maxTasks: 256\n    maxPendingMessagesPerMember: 64\n"
                   "    maxMessageBytes: 65536\n    disposalTimeoutMs: 5000\n"
                   "\n- id: tool-agent-team\n  name: '@deepseek-ai/dsh-experimental-tool-agent-team'\n"
                   "  config:\n    freshProvider: spawn\n    forkProvider: fork\n"
                   "\n- id: ui-agent-team\n  name: '@deepseek-ai/dsh-experimental-client-ui-agent-team'\n")
    txt = txt[:_m.start()] + team_blocks + txt[_m.end():]
    print('已替换 delegation → agent-team + tool-agent-team')
else:
    print('⚠️ 未定位 delegation 块（组成模板可能已变）— 未替换')
open(out,'w',encoding='utf-8').write(txt)
print('已生成', out)
PY
echo "✅ 安装完成：${DST}（重启 DSH 后在选择器里选 🎽 Synova 小队队长）"
