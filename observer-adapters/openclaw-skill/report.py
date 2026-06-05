#!/usr/bin/env python3
"""
OpenClaw agent_end hook — reports agent activity to Synova.

Triggered after every agent turn completes in OpenClaw.
Reads hook event from stdin, extracts activity data, sends to Synova.

Install: clawhub install synova-observer
or manually copy to ~/.openclaw/agents/*/skills/synova-observer/
"""
import sys
import json
import os

# Add synova_worker to path (adjust as needed)
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))
from synova_worker.observer.report import send_report


def main():
    try:
        input_data = json.loads(sys.stdin.read())
        hook_event = input_data.get("hookEvent", {})
        agent_context = input_data.get("context", {})

        activity = {
            "agentId": agent_context.get("agentId", agent_context.get("agent_id", "unknown")),
            "platform": "openclaw",
            "name": agent_context.get("agentName", agent_context.get("agent_name", agent_context.get("agentId", "openclaw-agent"))),
            "teamId": agent_context.get("teamId", agent_context.get("team_id", "")),
            "agentType": "internal",
            "activityType": "tool_call",
            "success": hook_event.get("success", True),
            "durationMs": hook_event.get("durationMs", 0),
            "lastToolName": hook_event.get("toolName", hook_event.get("tool_name", "")),
            "timestamp": hook_event.get("timestamp", ""),
        }
        send_report(activity)

    except Exception:
        pass  # Never block the agent

    # Output empty JSON → hook success
    print(json.dumps({}))


if __name__ == "__main__":
    main()
