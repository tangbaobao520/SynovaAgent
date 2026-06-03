"""SOG schema constants — mirrors @synova/sog-core TypeScript enum values."""

class SOGNodeType:
    PERSON = "Person"
    TEAM = "Team"
    RISK = "Risk"
    CAPABILITY = "Capability"
    PROCESS = "Process"
    TOOL = "Tool"
    GOAL = "Goal"
    FINANCIAL = "Financial"
    AGENT = "Agent"
    DOCUMENT = "Document"
    EVENT = "Event"
    METRIC = "Metric"
    PROJECT = "Project"
    EXTERNAL = "External"

class SOGEdgeType:
    BELONGS_TO = "BELONGS_TO"
    INTERACTS_WITH = "INTERACTS_WITH"
    AFFECTS = "AFFECTS"
    REPORTS_TO = "REPORTS_TO"
    PROVIDES = "PROVIDES"
    CONSUMES = "CONSUMES"
    DEPENDS_ON = "DEPENDS_ON"
    TRIGGERS = "TRIGGERS"
    ALIGNS_WITH = "ALIGNS_WITH"
    PRECEDES = "PRECEDES"

# Endpoint rules: edge type → valid (from_type, to_type)
EDGE_ENDPOINT_MAP = {
    SOGEdgeType.BELONGS_TO: (SOGNodeType.PERSON, SOGNodeType.TEAM),
    SOGEdgeType.INTERACTS_WITH: (SOGNodeType.PERSON, SOGNodeType.PERSON),
    SOGEdgeType.REPORTS_TO: (SOGNodeType.PERSON, SOGNodeType.PERSON),
    SOGEdgeType.AFFECTS: (SOGNodeType.RISK, SOGNodeType.PERSON),
    SOGEdgeType.PROVIDES: (SOGNodeType.TOOL, SOGNodeType.CAPABILITY),
    SOGEdgeType.TRIGGERS: (SOGNodeType.PROCESS, SOGNodeType.EVENT),
}
