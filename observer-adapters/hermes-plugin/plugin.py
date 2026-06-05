"""
Hermes Plugin — Agent Observer for Hermes Agent Framework.

Reports agent activity (tool calls, LLM calls, errors) to Synova.

Install: Add to ~/.hermes/config.yaml:
  plugins:
    - path: /path/to/synova-agent/observer-adapters/hermes-plugin/plugin.py

The Hermes plugin system calls register(api) on load.
"""

import os
import sys

# Make synova_worker importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
from synova_worker.observer.report import send_report


def register(api):
    """
    Called by Hermes plugin loader.
    Registers event handlers for tool_call_completed and error events.
    """

    @api.on("tool_call_completed")
    def on_tool_call_completed(tool_name: str, args: dict, result, ctx):
        """Report completed tool calls to Synova."""
        activity = {
            "agentId": getattr(ctx, "agent_id", "hermes-agent"),
            "platform": "hermes",
            "name": getattr(ctx, "agent_name", getattr(ctx, "agent_id", "Hermes Agent")),
            "agentType": "internal",
            "activityType": "tool_call",
            "lastToolName": tool_name,
            "success": getattr(result, "success", True),
            "durationMs": getattr(result, "duration_ms", 0),
            "timestamp": getattr(ctx, "timestamp", ""),
        }
        send_report(activity)

    @api.on("agent_error")
    def on_agent_error(error: Exception, ctx):
        """Report agent errors to Synova."""
        activity = {
            "agentId": getattr(ctx, "agent_id", "hermes-agent"),
            "platform": "hermes",
            "name": getattr(ctx, "agent_name", "Hermes Agent"),
            "agentType": "internal",
            "activityType": "error",
            "success": False,
            "detail": str(error)[:1000],
            "timestamp": "",
        }
        send_report(activity)

    @api.on("llm_call_completed")
    def on_llm_call_completed(model: str, token_in: int, token_out: int, ctx):
        """Report LLM call metrics to Synova."""
        activity = {
            "agentId": getattr(ctx, "agent_id", "hermes-agent"),
            "platform": "hermes",
            "name": getattr(ctx, "agent_name", "Hermes Agent"),
            "agentType": "internal",
            "activityType": "llm_call",
            "model": model,
            "tokenIn": token_in,
            "tokenOut": token_out,
            "timestamp": "",
        }
        send_report(activity)
