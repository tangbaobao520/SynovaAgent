# SynovaAgent -- D104 ima Connector + D105 Knowledge Agent Extension Implementation v1.0

> 2026-07-21 | Auth Doc #16: Enterprise Multi-User + ima Integration -- Ch5 S5.3 + S5.4
> **D104 builds the ima API client. D105 wires it into the knowledge agent for automated PKB extraction.**
> **This doc is the sole execution basis for claude code.**

---

## Loop Engineering V4.4.5 -- MANDATORY TASK-START (Q1-Q4)

### Q0: Project Identity
SynovaAgent ima knowledge integration. D104 creates the connector that authenticates with Tencent ima, scans enterprise documents, and extracts structured knowledge. D105 adds an imaDataSource tool to the knowledge agent, enabling automated PKB extraction during diagnosis cycles.

### Q1: Research
- Industry: Notion API integration, Confluence connector pattern, SharePoint document extraction
- Memory lessons: Iron Law 3 -- external API failures must not crash the system. ima unavailable -> degraded, continue diagnosis without ima knowledge.

### Q2: Scope
- D104: ImaClient class (authenticate, scanDocuments, extractContent, validateToken)
- D105: Knowledge Agent extension (imaDataSource tool, runGear6 ima extraction)
- NOT doing: ima real-time sync (D110 cron job), full-document corpus extraction

### Q3: Acceptance
- Entry: Admin binds ima API key via D103 endpoint -> stored encrypted
- Interaction: Knowledge agent calls imaDataSource.scanDocuments() -> extracts strategy/operations/meeting docs
- Result: Extracted PKB entries written to KnowledgeStore with source:ima traceability

### Q4: Contract and Test
- D104 @input: ima API key + enterpriseId
- D104 @output: { documents[], extractionResults[] }
- D105 @input: document type filter (strategy/operations/meetings)
- D105 @output: PKB entries written to KnowledgeStore
- @degraded: ima API unreachable -> log.warn + return empty + continue diagnosis
- Tests: D104 (auth success, auth fail, scan documents, empty results); D105 (extract strategy doc, extract meeting doc, ima unreachable -> degrade)

---

> Standard: Anthropic Engineering | Iron Law 0-2 | 5-Layer Architecture

---

## Loop Engineering V4.4.5 -- MANDATORY EXECUTION CONSTRAINTS

```
=== Pre-Commit Hard Gates ===
G1: as any = 0
G2: empty catch has log.warn
G4: new src/ files -> paired tests
G5: new exports -> callers
G6: new compute-like functions -> JSDoc contract + tests

=== Post-Code Agent Self-Check ===
1. [WIRING] imaClient called from where? knowledgeAgent uses imaDataSource?
2. [EXCEPTION] ima API unreachable -> degraded + log.warn?
3. [TYPES] as any = 0?
4. [TESTS] expect()? Normal/degrade/boundary?
5. [DEAD CODE] None?
```

---

## Current State (2026-07-21, verified by grep)

- src/connectors/ directory: DOES NOT EXIST (need to create)
- src/l3/knowledge-agent.ts: EXISTS, has runGear5 (D63/D64 knowledge injection)
- D63: 4 SKILL pull-mode DONE (KnowledgeStore entries)
- D64: 4 expert knowledge files DONE
- D76: Knowledge feedback (Goal -> PKB write) DONE
- ima connector: ZERO existence
- Auth Doc #16 S5.3: ima connector spec (ImaConfig, ImaDocument, ExtractedPkbEntry, SyncResult)
- Auth Doc #16 S5.4: knowledge agent extension spec

---

## What We Build -- D104

### 1. src/connectors/ima.ts -- ImaClient (New, ~250 lines)

```
class ImaClient {
  constructor(config: ImaConfig)
  authenticate(apiKey: string): Promise<string>    // -> accessToken
  validateToken(apiKey: string): Promise<boolean>  // test ima connection
  scanDocuments(filter?: DocumentFilter): Promise<ImaDocument[]>
  extractContent(documentId: string): Promise<ExtractedPkbEntry>
  checkHealth(): Promise<{ ok: boolean }>
}

interface ImaConfig {
  baseUrl: string         // ima API endpoint
  apiKey: string          // encrypted at rest
  enterpriseId: string
  timeoutMs: number       // default 30s
}

interface ImaDocument {
  id: string
  title: string
  type: 'strategy' | 'operations' | 'meetings' | 'other'
  content: string
  author: string
  createdAt: string
  updatedAt: string
}

interface ExtractedPkbEntry {
  text: string
  sourceType: 'ima_document'
  sourceId: string         // ima document ID for traceability
  authorityLevel: 'internal_stored'
  accessLevel: 'team'
  metadata: {
    documentType: string
    author: string
    createdAt: string
    extractedAt: string
  }
}
```

### 2. API Key Encryption

- deriveEncryptionKey(): derive AES key from JWT_SECRET (via HKDF)
- encryptApiKey(apiKey): AES-256-GCM encrypt + return ciphertext
- decryptApiKey(ciphertext): AES-256-GCM decrypt -> return plaintext API key
- Store ciphertext in GraphStore Enterprise node properties

## What We Build -- D105

### 1. Modify src/l3/knowledge-agent.ts

Add imaDataSource function:
```
async function imaDataSource(
  enterpriseId: string,
  filter?: { documentTypes?: string[], limit?: number }
): Promise<ExtractedPkbEntry[]>
```

Extend runGear6 (knowledge extraction gear):
- Before: only extracts from diagnosis reports and middle manager feedback
- After: includes ima document extraction as first step in the pipeline

### 2. Knowledge extraction flow

```
runGear6(enterpriseId):
  1. imaDataSource.scanDocuments(enterpriseId) -> ima documents
  2. For each document: extractContent() -> PKB entry
  3. Write to KnowledgeStore with sourceType='ima_document'
  4. Log extraction count + degraded status
  5. Continue to existing knowledge extraction steps
```

### 3. tests/connectors/ima.test.ts + tests/l3/knowledge-agent-ima.test.ts (New, >=10 tests total)

```
D104 tests (6):
[ ] authenticate: valid API key -> accessToken
[ ] authenticate: invalid API key -> degrade + error
[ ] scanDocuments: returns document list
[ ] scanDocuments: empty -> empty array + degraded:false
[ ] extractContent: valid doc -> ExtractedPkbEntry with all fields
[ ] validateToken: valid -> true, invalid -> false

D105 tests (4):
[ ] imaDataSource: returns extracted entries
[ ] imaDataSource: ima unreachable -> degrade + empty
[ ] runGear6: includes ima extraction step
[ ] runGear6: ima fails -> continues to other steps (does not crash)
```

---

## What We Don't Do

- Don't implement ima cron sync job (D110)
- Don't build ima webhook listener for real-time updates
- Don't extract all document types (only strategy/operations/meetings for MVP)
- Don't modify D63/D64 knowledge entries

---

## Architecture Layer

L3 (src/connectors/ima.ts + src/l3/knowledge-agent.ts) + L5 (API calls to external ima)

---

## Completion Standard

```
[ ] ImaClient class: authenticate + validateToken + scanDocuments + extractContent + checkHealth
[ ] API key encryption: AES-256-GCM encrypt/decrypt with HKDF key derivation
[ ] Document filter: strategy/operations/meetings only (MVP)
[ ] Knowledge agent: imaDataSource function added
[ ] Knowledge agent: runGear6 extended with ima extraction step
[ ] PKB traceability: sourceType='ima_document' + sourceId = ima document ID
[ ] Degrade: ima API unreachable -> log.warn + return empty + continue pipeline
[ ] Degrade: API key decryption fails -> log.error + skip ima step
[ ] Zero as any (Iron Law 38)
[ ] Every new src/ file has paired test file (Iron Law 0-2)
[ ] tsc --noEmit zero new errors
[ ] vitest run --changed zero new failures
[ ] >=10 tests: D104 (6) + D105 (4)
```

---

## Auth Doc References

- Auth Doc #16: Enterprise Multi-User + ima Integration -- Ch5 S5.3 (ima connector) + S5.4 (knowledge agent)
- D63: 4 SKILL pull-mode (knowledge entries)
- D64: 4 expert knowledge files
- D76: Knowledge feedback (PKB write pattern)
