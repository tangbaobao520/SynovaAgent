"""Feishu connector — fetch members and messages via Feishu Open API.

Day 2 T2.1 + T2.2: Python-first connector implementation.
Per DECISIONS-AND-IMPLICATIONS: all connectors use Python SDKs.
"""
import time
import hashlib
import hmac
import json
import urllib.request
from typing import Any, Dict, List, Optional


class FeishuClient:
    """Minimal Feishu Open API client (no external SDK dependency)."""

    BASE_URL = "https://open.feishu.cn/open-apis"

    def __init__(self, app_id: str, app_secret: str):
        self.app_id = app_id
        self.app_secret = app_secret
        self._tenant_token: Optional[Dict[str, Any]] = None

    def _get_token(self) -> str:
        now = int(time.time())
        if self._tenant_token and self._tenant_token.get("expire", 0) > now + 60:
            return self._tenant_token["token"]

        url = f"{self.BASE_URL}/auth/v3/tenant_access_token/internal"
        body = json.dumps({"app_id": self.app_id, "app_secret": self.app_secret}).encode()
        req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
            self._tenant_token = {
                "token": data.get("tenant_access_token", ""),
                "expire": now + data.get("expire", 7200),
            }
            return self._tenant_token["token"]

    def _get(self, path: str, params: Optional[Dict] = None) -> Dict:
        token = self._get_token()
        qs = ""
        if params:
            from urllib.parse import urlencode
            qs = "?" + urlencode(params)
        url = f"{self.BASE_URL}{path}{qs}"
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read())


def handle_connector_feishu_fetch_members(params: Dict[str, Any]) -> Dict[str, Any]:
    """T2.1: Fetch organization members from Feishu."""
    client = FeishuClient(app_id=params["appId"], app_secret=params["appSecret"])
    all_members = []
    page_token = None

    for _ in range(10):  # max 10 pages = 500 members
        req_params = {"page_size": 50, "department_id_type": "open_department_id"}
        if page_token:
            req_params["page_token"] = page_token

        data = client._get("/contact/v3/users", req_params)
        items = data.get("data", {}).get("items", [])
        for m in items:
            all_members.append({
                "id": m.get("open_id", ""),
                "name": m.get("name", ""),
                "email": m.get("email", ""),
                "mobile": m.get("mobile", ""),
                "departmentIds": m.get("department_ids", []),
                "title": m.get("job_title", ""),
                "employeeType": m.get("employee_type", ""),
                "status": "active" if m.get("status", {}).get("is_activated") else "inactive",
            })

        if not data.get("data", {}).get("has_more"):
            break
        page_token = data.get("data", {}).get("page_token")

    return {"members": all_members, "total": len(all_members)}


def handle_connector_feishu_fetch_messages(params: Dict[str, Any]) -> Dict[str, Any]:
    """T2.2: Fetch recent messages from a Feishu chat group."""
    client = FeishuClient(app_id=params["appId"], app_secret=params["appSecret"])
    group_id = params.get("groupId", "")
    if not group_id:
        return {"error": "groupId is required", "messages": []}

    all_messages = []
    page_token = None

    for _ in range(5):  # max 5 pages = 250 messages
        req_params = {"page_size": 50, "container_id_type": "chat"}
        if page_token:
            req_params["page_token"] = page_token

        data = client._get(f"/im/v1/messages", req_params)
        items = data.get("data", {}).get("items", [])
        for msg in items:
            if msg.get("msg_type") != "text":
                continue
            body = msg.get("body", {}).get("content", "")
            all_messages.append({
                "id": msg.get("message_id", ""),
                "senderId": msg.get("sender", {}).get("id", ""),
                "senderName": "",  # resolve in mapper
                "content": json.loads(body).get("text", body) if body.startswith("{") else body,
                "timestamp": msg.get("create_time", ""),
                "channelId": group_id,
                "threadId": msg.get("root_id") or msg.get("parent_id") or "",
            })

        if not data.get("data", {}).get("has_more"):
            break
        page_token = data.get("data", {}).get("page_token")

    return {"messages": all_messages, "total": len(all_messages)}


def handle_connector_feishu_health_check(params: Dict[str, Any]) -> Dict[str, Any]:
    """Verify Feishu connectivity."""
    try:
        client = FeishuClient(app_id=params.get("appId", ""), app_secret=params.get("appSecret", ""))
        token = client._get_token()
        return {"healthy": True, "message": "Feishu API connected"}
    except Exception as e:
        return {"healthy": False, "error": str(e)}
