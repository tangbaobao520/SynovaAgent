"""
synova_observer — Python SDK for Synova Agent Observer

One-line integration for LangChain, CrewAI, AutoGen, and OpenAI Agents SDK.

LangChain:
    from synova_observer import SynovaCallback
    chain.invoke(input, config={"callbacks": [SynovaCallback()]})

CrewAI:
    from synova_observer import SynovaTaskCallback
    crew = Crew(task_callback=SynovaTaskCallback(agent_id="my-crew"))

AutoGen:
    from synova_observer import SynovaObserver
    observer = SynovaObserver()
    observer.register(agent)

Custom agent loop:
    from synova_observer import SynovaObserver
    obs = SynovaObserver(agent_id="my-agent", platform="custom")
    obs.on_tool_start("fetch_data", {"url": "..."})
    obs.on_tool_end("fetch_data", success=True, duration_ms=150)
"""

import os
import threading
from datetime import datetime, timezone
import json
import urllib.request


class SynovaObserver:
    """
    Base observer that reports agent activity to Synova.
    Thread-safe, fire-and-forget.
    """

    def __init__(
        self,
        agent_id: str = None,
        platform: str = "python-sdk",
        name: str = None,
        team_id: str = None,
        base_url: str = None,
    ):
        self.agent_id = agent_id or os.environ.get("SYNOVA_AGENT_ID", "python-agent")
        self.platform = platform
        self.name = name or os.environ.get("SYNOVA_AGENT_NAME", self.agent_id)
        self.team_id = team_id or os.environ.get("SYNOVA_TEAM_ID", "default")
        self.base_url = base_url or os.environ.get("SYNOVA_BASE_URL", "http://localhost:3000")

    def _report(self, activity_type: str, **kwargs):
        """Fire-and-forget POST to Synova. Runs in daemon thread."""
        def _send():
            activity = {
                "agentId": self.agent_id,
                "platform": self.platform,
                "name": self.name,
                "agentType": "external",
                "teamId": self.team_id,
                "activityType": activity_type,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                **kwargs,
            }
            payload = json.dumps(activity).encode("utf-8")
            req = urllib.request.Request(
                f"{self.base_url.rstrip('/')}/api/agent-observer/report",
                data=payload,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            try:
                urllib.request.urlopen(req, timeout=3)
            except Exception:
                pass  # Degrade gracefully

        t = threading.Thread(target=_send, daemon=True)
        t.start()

    def on_tool_start(self, tool_name: str, tool_args: dict = None):
        self._report("tool_call", lastToolName=tool_name,
                     detail=json.dumps(tool_args)[:1000] if tool_args else None)

    def on_tool_end(self, tool_name: str, success: bool = True, duration_ms: int = 0):
        self._report("tool_call", lastToolName=tool_name,
                     success=success, durationMs=duration_ms)

    def on_llm_call(self, model: str = None, token_in: int = 0, token_out: int = 0):
        self._report("llm_call", model=model, tokenIn=token_in, tokenOut=token_out)

    def on_error(self, error: str, tool_name: str = None):
        self._report("error", detail=error[:1000], lastToolName=tool_name, success=False)

    def heartbeat(self):
        self._report("heartbeat")

    def lifecycle(self, status: str):
        self._report("lifecycle", status=status)


# ── LangChain Integration ──

class SynovaCallback(SynovaObserver):
    """
    LangChain BaseCallbackHandler compatible.
    Usage: chain.invoke(input, config={"callbacks": [SynovaCallback()]})
    """

    def on_tool_start(self, serialized: dict = None, input_str: str = "", **kwargs):
        tool_name = (serialized or {}).get("name", "unknown_tool")
        super().on_tool_start(tool_name)

    def on_tool_end(self, output: str = "", **kwargs):
        super().on_tool_end("unknown_tool", success=True)


# ── CrewAI Integration ──

class SynovaTaskCallback(SynovaObserver):
    """
    CrewAI task_callback compatible.
    Usage: crew = Crew(task_callback=SynovaTaskCallback(agent_id="my-crew"))
    """

    def __call__(self, task_output):
        super().on_tool_end(
            task_output.agent if hasattr(task_output, "agent") else "crew_task",
            success=True,
        )


# ── Convenience alias ──
Observer = SynovaObserver
