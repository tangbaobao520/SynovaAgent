#!/usr/bin/env python3
"""
Claude Code PreToolUse hook — reports tool calls to Synova.

Triggered before each tool execution in Claude Code.
Reads hook input from stdin (JSON), extracts tool_name/tool_input,
fire-and-forget POST to Synova /api/agent-observer/report.

Install: Add to ~/.claude/settings.json:
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "*",
        "hooks": [
          { "type": "command", "command": "python3 /path/to/hook.py", "timeout": 5 }
        ]
      }
    ]
  }
}
"""
import sys
import json
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
from synova_worker.observer.report import send_report


def main():
    try:
        input_data = json.loads(sys.stdin.read())
        tool_name = input_data.get("tool_name", "")
        tool_input = input_data.get("tool_input", {})

        activity = {
            "agentId": "claude-code",
            "platform": "claude-code",
            "name": "Claude Code",
            "agentType": "external",
            "activityType": "tool_call",
            "toolName": tool_name,
            "lastToolName": tool_name,
            "detail": json.dumps(tool_input)[:1000] if tool_input else None,
            "timestamp": "",
        }
        send_report(activity)

    except Exception:
        pass  # Never block the agent's tool execution

    # Allow tool to continue
    print(json.dumps({}))


if __name__ == "__main__":
    main()
