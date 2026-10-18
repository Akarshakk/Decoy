;;; ============================================================
;;; constitutional_composition.sip
;;; SIP (Session Initiation Protocol) Configuration File
;;; Project: Constitutional Composition
;;; Version: broker/m10@2.0.0 | harness/lsession@1.1.0
;;; Target venue: USENIX Security '27 (Cycle 2)
;;;
;;; This file maps the runtime communication flows of the
;;; "Constitutional Composition" research pipeline onto SIP
;;; dialog semantics. Each MCP participant, enforcement layer,
;;; and harness component is modelled as a SIP User Agent (UA).
;;;
;;; Legend:
;;;   AI-HOST       → The AI host that composes MCP servers
;;;   MCP-SRV-*     → Individual MCP tool-providing servers
;;;   L-PRE         → Input sanitizer (semantics/lpre.py)
;;;   L-CALL        → Admission + ceiling clamp (participants/lcall.py)
;;;   L-SESSION     → Cross-turn session monitor (harness/lsession.py)
;;;   L-COMP        → Composition broker (broker/decision.py)
;;;   LEDGER        → Hash-chained trust-trace ledger (ledger/chain.py)
;;;   PROXY         → Harness MCP proxy (harness/proxy/proxy.py)
;;;   CANARY        → Egress canary + sinkhole (harness/egress_sinkhole.py)
;;; ============================================================

[global]
listen          = 0.0.0.0:5060
protocol        = UDP
transport       = internal              ; no real network egress (block_network=True)
record_route    = no
max_forwards    = 10
user_agent      = ConstitutionalComposition/0.1.0
log_level       = INFO

;;; ============================================================
;;; Section 1: SIP User Agents (UAs)
;;; Each runtime component is a UA with a SIP URI.
;;; ============================================================

[ua:ai-host]
; The AI host that assembles MCP servers and initiates tool calls.
sip_uri         = sip:ai-host@constitutional.internal
display_name    = "AI Host (Composition Root)"
transport       = internal
outbound_proxy  = sip:proxy@constitutional.internal
contact         = sip:ai-host@constitutional.internal:5060
capabilities    = tool_invocation, server_promotion, session_management
role            = ORIGINATOR

[ua:mcp-server-filesystem]
; MCP server: filesystem read/write tools (sensitive source)
sip_uri         = sip:mcp-srv-fs@constitutional.internal
display_name    = "MCP Server - Filesystem"
transport       = internal
contact         = sip:mcp-srv-fs@constitutional.internal:5061
capability_ref  = cap-inv-filesystem-read_file
declared_effect = read:sensitive
server_family   = local-filesystem
participant_id  = mcp-srv-001

[ua:mcp-server-network]
; MCP server: external network/HTTP tools (external sink)
sip_uri         = sip:mcp-srv-net@constitutional.internal
display_name    = "MCP Server - Network/HTTP"
transport       = internal
contact         = sip:mcp-srv-net@constitutional.internal:5062
capability_ref  = cap-inv-network-http_request
declared_effect = write:external
server_family   = external-http
participant_id  = mcp-srv-002

[ua:mcp-server-code-exec]
; MCP server: code execution / dynamic skill synthesis (self-evolving)
sip_uri         = sip:mcp-srv-exec@constitutional.internal
display_name    = "MCP Server - Code Execution (Self-Evolving)"
transport       = internal
contact         = sip:mcp-srv-exec@constitutional.internal:5063
capability_ref  = cap-inv-exec-run_code
declared_effect = execute:arbitrary
server_family   = code-execution
participant_id  = mcp-srv-003
evolving        = true                  ; synthesises tools at runtime

[ua:l-pre]
; L-PRE: Input sanitizer. Validates and sanitizes tool invocation
; requests BEFORE they reach L-CALL. Unit-tested only; not wired
; into the pilot request path.
sip_uri         = sip:l-pre@constitutional.internal
display_name    = "L-PRE Input Sanitizer (semantics/lpre.py)"
transport       = internal
contact         = sip:l-pre@constitutional.internal:5070
module          = semantics/lpre.py
pilot_wired     = false
role            = SANITIZER

[ua:l-call]
; L-CALL: Per-invocation admission + capability ceiling clamp.
; Blocks calls whose declared effect exceeds the server's registered
; non-amplification bound B^(i).
sip_uri         = sip:l-call@constitutional.internal
display_name    = "L-CALL Admission + Ceiling Clamp (participants/lcall.py)"
transport       = internal
contact         = sip:l-call@constitutional.internal:5071
module          = participants/lcall.py
ceiling_module  = participants/ceiling.py
pilot_wired     = false
role            = ADMISSION

[ua:l-session]
; L-SESSION: Cross-turn session behaviour monitor.
; Detects multi-step exfiltration chains across the turn sequence.
; Wired into the harness proxy in the canonical pilot.
sip_uri         = sip:l-session@constitutional.internal
display_name    = "L-SESSION Monitor (harness/lsession.py)"
transport       = internal
contact         = sip:l-session@constitutional.internal:5072
module          = harness/lsession.py
version         = harness/lsession@1.1.0
pilot_wired     = true
evidence_basis  = capability-binding,name-heuristic  ; in precedence order
role            = SESSION_MONITOR

[ua:l-comp]
; L-COMP: Composition-level admission broker.
; Runs FRESH, CAPOK, SCOPEOK, FLOWOK, EVIDENCEOK checks.
; Operates in shadow-counterfactual or enforced mode (never pooled).
sip_uri         = sip:l-comp@constitutional.internal
display_name    = "L-COMP Composition Broker (broker/decision.py)"
transport       = internal
contact         = sip:l-comp@constitutional.internal:5073
module          = broker/decision.py
version         = broker/m10@2.0.0
checks          = FRESH,CAPOK,SCOPEOK,FLOWOK,EVIDENCEOK
outcomes        = ADMIT,HOLD,BLOCK
modes           = shadow-counterfactual,enforced       ; never pooled
pilot_wired     = true
role            = COMPOSITION_BROKER

[ua:ledger]
; LEDGER: Hash-chained trust-trace ledger.
; Every broker decision is appended as a ledger entry with a
; sha256 chain link. Stored under datasets/pilot/<date>/ledger/.
sip_uri         = sip:ledger@constitutional.internal
display_name    = "Trust-Trace Ledger (ledger/chain.py)"
transport       = internal
contact         = sip:ledger@constitutional.internal:5074
module          = ledger/chain.py
storage_path    = datasets/pilot/<date>/ledger/
chain_algo      = sha256
pilot_wired     = true
role            = LEDGER

[ua:proxy]
; HARNESS PROXY: MCP protocol proxy that intercepts all tool calls
; and feeds them to L-SESSION and L-COMP in the request path.
sip_uri         = sip:proxy@constitutional.internal
display_name    = "Harness MCP Proxy (harness/proxy/proxy.py)"
transport       = internal
contact         = sip:proxy@constitutional.internal:5075
module          = harness/proxy/proxy.py
pilot_wired     = true
role            = PROXY

[ua:canary]
; CANARY: Egress canary + DNS sinkhole.
; Detects unexpected outbound network calls from within the sandbox.
; Active in canonical 2026-09-30 pilot (block_network=True).
sip_uri         = sip:canary@constitutional.internal
display_name    = "Egress Canary + Sinkhole (harness/egress_sinkhole.py)"
transport       = internal
contact         = sip:canary@constitutional.internal:5076
module          = harness/egress_sinkhole.py
block_network   = true
pilot_wired     = true
role            = CANARY

;;; ============================================================
;;; Section 2: Dialog Flows (SIP INVITE Sequences)
;;; Each "dialog" maps to a key communication path in the pipeline.
;;; ============================================================

;;; ----------------------------------------------------------
;;; Dialog 1: Tool Invocation Request Path (Pilot-Wired)
;;; AI-HOST → PROXY → L-SESSION → L-COMP → LEDGER → MCP-SRV
;;;
;;; SIP call flow:
;;;   INVITE  ai-host      → proxy        (tool call arrives)
;;;   INVITE  proxy        → l-session    (session monitoring)
;;;   INFO    l-session    → proxy        (verdict: ALLOW|WARN|FLAG)
;;;   INVITE  proxy        → l-comp       (composition check)
;;;   INFO    l-comp       → proxy        (ADMIT|HOLD|BLOCK)
;;;   INVITE  proxy        → ledger       (record decision)
;;;   200 OK  ledger       → proxy        (ledger appended)
;;;   INVITE  proxy        → mcp-srv-*    (forward if ADMIT)
;;;   200 OK  mcp-srv-*    → proxy        (tool result)
;;;   200 OK  proxy        → ai-host      (return result)
;;; ----------------------------------------------------------

[dialog:tool-invocation]
name            = "Tool Invocation (Pilot-Wired Request Path)"
direction       = ai-host > proxy > l-session > l-comp > ledger > mcp-server
from            = sip:ai-host@constitutional.internal
to              = sip:proxy@constitutional.internal
call_id         = tool-invocation-{case_id}
cseq_method     = INVITE
mode            = enforced

[hop:1]
; AI-HOST → PROXY
from            = ai-host
to              = proxy
method          = INVITE
body_schema     = schemas/promotion_event.v1.json
x-from-display  = "AI Host"
x-subject       = tool_invocation/{tool_name}/{server_id}

[hop:2]
; PROXY → L-SESSION (cross-turn monitor)
from            = proxy
to              = l-session
method          = INVITE
x-subject       = session_check/{session_id}/{turn_index}
x-capability-ref = {capability_ref}
x-server-id     = {server_id}

[hop:3]
; L-SESSION → PROXY (verdict)
from            = l-session
to              = proxy
method          = INFO
verdict         = ALLOW | WARN | FLAG
evidence_basis  = capability-binding | name-heuristic | none

[hop:4]
; PROXY → L-COMP (composition broker check)
from            = proxy
to              = l-comp
method          = INVITE
body_schema     = schemas/promotion_event.v1.json
x-mode          = enforced | shadow-counterfactual

[hop:5]
; L-COMP → PROXY (broker decision)
from            = l-comp
to              = proxy
method          = INFO
body_schema     = schemas/broker_decision.v1.json
outcome         = ADMIT | HOLD | BLOCK
checks          = FRESH,CAPOK,SCOPEOK,FLOWOK,EVIDENCEOK
input_hash      = sha256_of_inputs
mode            = enforced | shadow-counterfactual

[hop:6]
; PROXY → LEDGER (append decision)
from            = proxy
to              = ledger
method          = INVITE
body_schema     = schemas/broker_decision.v1.json
prev_hash       = {chain_link_sha256}

[hop:7]
; LEDGER → PROXY (confirmation)
from            = ledger
to              = proxy
method          = 200 OK
entry_id        = {ledger_entry_id}
chain_hash      = {new_chain_head_sha256}

[hop:8]
; PROXY → MCP-SRV (forward if ADMIT)
from            = proxy
to              = mcp-server
method          = INVITE
condition       = outcome == ADMIT
body_schema     = schemas/tool_invocation.v1.json

[hop:9]
; MCP-SRV → PROXY (tool result)
from            = mcp-server
to              = proxy
method          = 200 OK
body_schema     = schemas/tool_result.v1.json

[hop:10]
; PROXY → AI-HOST (return)
from            = proxy
to              = ai-host
method          = 200 OK
body_schema     = schemas/tool_result.v1.json

;;; ----------------------------------------------------------
;;; Dialog 2: Server Promotion / Self-Evolution Event
;;; MCP-SRV-EXEC synthesises a new tool and submits it for
;;; L-COMP composition-level review before admission.
;;;
;;;   REGISTER  mcp-srv-exec  → l-comp   (promotion_event.v1)
;;;   INFO      l-comp        → ledger   (record shadow decision)
;;;   200 OK    l-comp        → proxy    (ADMIT|HOLD|BLOCK)
;;; ----------------------------------------------------------

[dialog:server-promotion]
name            = "Server Promotion / Self-Evolution Review"
direction       = mcp-srv-exec > l-comp > ledger
from            = sip:mcp-srv-exec@constitutional.internal
to              = sip:l-comp@constitutional.internal
call_id         = promotion-{mutation_id}
cseq_method     = REGISTER

[hop:1]
from            = mcp-srv-exec
to              = l-comp
method          = REGISTER
body_schema     = schemas/promotion_event.v1.json
event_type      = tool_synthesised | skill_loaded
server_id       = mcp-srv-003
mutation_id     = {mutation_id}

[hop:2]
from            = l-comp
to              = ledger
method          = INFO
body_schema     = schemas/broker_decision.v1.json
mode            = shadow-counterfactual

[hop:3]
from            = l-comp
to              = proxy
method          = 200 OK
outcome         = ADMIT | HOLD | BLOCK
mode            = shadow-counterfactual | enforced

;;; ----------------------------------------------------------
;;; Dialog 3: Egress Canary Check
;;; PROXY routes every outbound DNS/connect attempt through CANARY.
;;; Under block_network=True, all external calls return 403 Forbidden.
;;;
;;;   OPTIONS  proxy  → canary  (probe egress)
;;;   403      canary → proxy   (network blocked)
;;; ----------------------------------------------------------

[dialog:egress-canary]
name            = "Egress Canary / Network Block Check"
direction       = proxy > canary
from            = sip:proxy@constitutional.internal
to              = sip:canary@constitutional.internal
call_id         = egress-{egress_id}
cseq_method     = OPTIONS

[hop:1]
from            = proxy
to              = canary
method          = OPTIONS
x-subject       = egress_probe/{destination_host}
x-egress        = dns | connect | http

[hop:2]
from            = canary
to              = proxy
method          = 403 Forbidden
blocked         = true
reason          = block_network=True
destination     = {destination_host}

;;; ----------------------------------------------------------
;;; Dialog 4: Reauthorization (HOLD Path)
;;; When L-COMP returns HOLD, the AI-HOST may supply additional
;;; context and request reauthorization from broker.
;;;
;;;   REFER  ai-host → l-comp  (reauth request)
;;;   INFO   l-comp  → ledger  (record reauth attempt)
;;;   200 OK l-comp  → proxy   (ADMIT|BLOCK)
;;; ----------------------------------------------------------

[dialog:reauthorization]
name            = "HOLD Reauthorization (broker/reauthorization.py)"
direction       = ai-host > l-comp > ledger
from            = sip:ai-host@constitutional.internal
to              = sip:l-comp@constitutional.internal
call_id         = reauth-{event_id}
cseq_method     = REFER

[hop:1]
from            = ai-host
to              = l-comp
method          = REFER
refer_to        = sip:l-comp@constitutional.internal
x-subject       = reauthorization/{event_id}
original_decision_id = {decision_id}

[hop:2]
from            = l-comp
to              = ledger
method          = INFO
reauth_attempt  = true
decision_id     = {decision_id}

[hop:3]
from            = l-comp
to              = proxy
method          = 200 OK
outcome         = ADMIT | BLOCK
reauth          = true

;;; ============================================================
;;; Section 3: Routing Table
;;; Maps SIP Request-URIs to UA contacts within the internal
;;; virtual network (no real egress).
;;; ============================================================

[routing]
domain          = constitutional.internal

sip:ai-host@constitutional.internal         = 127.0.0.1:5060
sip:mcp-srv-fs@constitutional.internal      = 127.0.0.1:5061
sip:mcp-srv-net@constitutional.internal     = 127.0.0.1:5062
sip:mcp-srv-exec@constitutional.internal    = 127.0.0.1:5063
sip:l-pre@constitutional.internal           = 127.0.0.1:5070
sip:l-call@constitutional.internal          = 127.0.0.1:5071
sip:l-session@constitutional.internal       = 127.0.0.1:5072
sip:l-comp@constitutional.internal          = 127.0.0.1:5073
sip:ledger@constitutional.internal          = 127.0.0.1:5074
sip:proxy@constitutional.internal           = 127.0.0.1:5075
sip:canary@constitutional.internal          = 127.0.0.1:5076

; All external destinations are sinkholed by the canary UA.
; No real SIP traffic leaves the sandbox (egress_enforced: true).
default_route   = sip:canary@constitutional.internal

;;; ============================================================
;;; Section 4: Security & TLS (design target, not activated)
;;; NOTE: No production deployment exists.
;;; ============================================================

[security]
tls_enabled     = false
sips_uri        = sips:constitutional.internal
cert_file       = /etc/ssl/constitutional/server.crt
key_file        = /etc/ssl/constitutional/server.key
verify_peer     = true
digest_auth     = true
auth_realm      = constitutional.internal
body_integrity  = sha256-input-hash

;;; ============================================================
;;; Section 5: Logging & Audit Trail
;;; Mirrors the hash-chained ledger in ledger/chain.py.
;;; ============================================================

[logging]
sip_trace       = true
log_file        = datasets/pilot/<date>/ledger/sip_trace.log
chain_link      = sha256
audit_fields    = call_id, from, to, method, body_sha256, timestamp_utc

;;; ============================================================
;;; End of constitutional_composition.sip
;;; ============================================================
