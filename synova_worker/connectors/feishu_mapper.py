"""Feishu data → SOG ontology mapper. Day 2 T2.3."""

from synova_worker.sog.schema import SOGNodeType, SOGEdgeType


def handle_connector_feishu_mapper_members(params: dict) -> dict:
    """Map Feishu members to SOG Person nodes + BELONGS_TO edges."""
    members = params.get("members", [])
    org_id = params.get("orgId", "default")

    nodes = []
    edges = []
    for m in members:
        node_id = f"person_{m['id']}"
        nodes.append({
            "id": node_id,
            "type": SOGNodeType.PERSON,
            "props": {
                "name": m.get("name", ""),
                "email": m.get("email", ""),
                "mobile": m.get("mobile", ""),
                "title": m.get("title", ""),
                "employeeType": m.get("employeeType", ""),
                "status": m.get("status", "active"),
                "source": "feishu",
            },
            "graph": org_id,
        })

        # BELONGS_TO edges for each department
        for dept_id in m.get("departmentIds", []):
            nodes.append({
                "id": f"team_{dept_id}",
                "type": SOGNodeType.TEAM,
                "props": {"name": f"Department_{dept_id}", "source": "feishu"},
                "graph": org_id,
            })
            edges.append({
                "from": node_id,
                "to": f"team_{dept_id}",
                "type": SOGEdgeType.BELONGS_TO,
                "weight": 1.0,
                "graph": org_id,
            })

    return {"nodes": nodes, "edges": edges, "nodeCount": len(nodes), "edgeCount": len(edges)}


def handle_connector_feishu_mapper_messages(params: dict) -> dict:
    """Map Feishu messages to INTERACTS_WITH edges between Person nodes."""
    messages = params.get("messages", [])
    org_id = params.get("orgId", "default")

    edges = []
    seen = set()
    for msg in messages:
        if not msg.get("senderId") or not msg.get("channelId"):
            continue
        sender_node = f"person_{msg['senderId']}"
        channel_node = f"channel_{msg['channelId']}"

        # INTERACTS_WITH: person → person (cross-referencing by channel)
        key = f"{sender_node}|{channel_node}"
        if key not in seen:
            seen.add(key)
            edges.append({
                "from": sender_node,
                "to": channel_node,
                "type": SOGEdgeType.INTERACTS_WITH,
                "weight": 0.5,
                "props": {"channelId": msg["channelId"], "source": "feishu"},
                "graph": org_id,
            })

    return {"edges": edges, "edgeCount": len(edges)}
