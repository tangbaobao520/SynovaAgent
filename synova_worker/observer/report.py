"""
Common HTTP reporter for Agent Observer Python adapters.

Used by: OpenClaw Skill, Claude Code Hook, Python SDK (LangChain/CrewAI/AutoGen),
Hermes Plugin, and any custom Python-based agent framework.

Usage:
    from synova_worker.observer.report import send_report
    send_report({
        "agentId": "my-agent",
        "platform": "openclaw",
        "name": "My Agent",
        "agentType": "external",
        "activityType": "tool_call",
        "lastToolName": "Bash",
        "timestamp": "2026-06-05T10:00:00.000Z",
    })

Environment Variables:
    SYNOVA_BASE_URL — Synova service URL (default: http://localhost:3000)
    SYNOVA_TEAM_ID   — Team/org ID (default: default)
"""

import os
import json
import urllib.request
from datetime import datetime, timezone


SYNOVA_BASE_URL = os.environ.get("SYNOVA_BASE_URL", "http://localhost:3000")
REPORT_ENDPOINT = f"{SYNOVA_BASE_URL.rstrip('/')}/api/agent-observer/report"
DEFAULT_TEAM_ID = os.environ.get("SYNOVA_TEAM_ID", "default")

# JSON encoder that handles non-serializable types gracefully
class _SafeEncoder(json.JSONEncoder):
    def default(self, obj):
        try:
            return str(obj)
        except Exception:
            return "<non-serializable>"


def send_report(activity: dict, timeout: int = 3) -> bool:
    """
    Fire-and-forget report to Synova Agent Observer.

    Args:
        activity: dict matching the AgentActivity schema:
            Required fields: agentId, platform, name, agentType, activityType, timestamp
            Optional fields: teamId, model, status, lastToolName, detail, sessionId,
                             success, durationMs, tokenIn, tokenOut, costUsd
        timeout: HTTP timeout in seconds (default 3)

    Returns:
        True if report was successfully sent, False otherwise.
        NEVER raises an exception — always degrades gracefully.
    """
    # Ensure required fields
    activity.setdefault("timestamp", datetime.now(timezone.utc).isoformat())
    activity.setdefault("teamId", DEFAULT_TEAM_ID)
    activity.setdefault("agentType", "external")

    payload = json.dumps(activity, cls=_SafeEncoder).encode("utf-8")
    req = urllib.request.Request(
        REPORT_ENDPOINT,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "User-Agent": "synova-observer-python/1.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status == 200
    except Exception:
        # Iron Law 31: Silently degrade — never crash the host agent
        return False
