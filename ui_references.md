# Swaroop: UI references and design direction

Every site below was opened and looked at on 2026-10-18. Each row says what to take and what to leave. We borrow **patterns**, never layouts, colours or illustrations.

## 1. Why the Remit workflow page works, and how we beat it

What makes it good (`remit-pi.vercel.app/app/workflows/invoice-fraud`):
- A 4-step stepper: Build → Bind → Replay → Review.
- Two lanes side by side: the attack lane against the legitimate lane.
- Each node carries its verdict chip, and each edge is labelled with the evidence (`IBAN LT12…1000 from docs.read_attachment (untrusted)`).
- A right panel shows replay metrics with sparklines, then "value provenance" chips at the bottom.

Its limits:
- It is a recording.
- The canvas is a generic editor (zoom, pan, add/delete tools) that judges will never use.
- The two lanes are different *tasks*, so they don't show what our PS is about: the *same identity* drifting.

**Our signature page: "Investigate"** (`/app/investigate/:scenario`):
- **Session spine.** Calls run down a vertical spine (reads like a log), not a free canvas. Each call node shows a **score ring** (0–100, coloured by band) and factor chips (S1 · S3 · S4 …).
- **Taint thread.** A coloured line starts at the culprit document (`inv-204511.pdf`) and threads through every call it influenced. You can see the injection travel.
- **Twin lane (our unique moment).** Optionally put a *healthy twin* beside the spine: the same calls by an agent in a different role (D2 procurement vs D3 HR). Same action, different verdict. Remit can't show this because it has no role model.
- **Delegation branches** leave the spine sideways into a child-agent lane (D7). The restriction badge lands on the branch, not on the child agent.
- **Scrubber + live engine.** A timeline scrubber at the bottom (step / autoplay / reset) drives the *real* engine. A **shadow toggle** reveals the counterfactual: "without Swaroop: 1 POST to acme-verify.co, 48 salary rows out".
- **Right panel = alert card** (section 2, Sentry + Stripe patterns).
- Built on `@xyflow/react` with a fixed, deterministic top-down layout and editing turned off. Pan/zoom only.

## 2. Product-UI references (console)

| Reference (verified link) | What we take | What we leave |
|---|---|---|
| **Sentry: Issue Details** · https://docs.sentry.io/product/issues/issue-details/ | Triage layout: header with a short trend chart, evidence in the main column, a right sidebar with **"Suspect Commits"**. That is our **culprit document** slot on the alert card. | Their density and purple chrome. |
| **Stripe Radar: Risk insights** · https://docs.stripe.com/radar/reviews/risk-insights | Explaining a score as **rows of signals, each with a small multiplier badge** ("3.5×"). Ours: factor rows with a "−14 if removed" badge. Plus a "show all insights" disclosure for the full evidence. | The map widget and payment specifics. |
| **Langfuse: Agent Graphs** · https://langfuse.com/docs/observability/features/agent-graphs | Three panes (trace tree / graph / detail); deterministic layout; **aggregated vs expanded** modes. Aggregated mode is how we keep D6/D11 (30 sessions, 45 calls) readable. | Dark-terminal look, tiny type. |
| **Vercel: Observability (alerts section)** · https://vercel.com/products/observability | Anomaly card pattern: a one-line headline with the metric in bold ("/api/auth error rate increased to **42%**") over a line chart with a **shaded anomaly window**. That's our drift-accumulator chart: shade from first excess to the alarm, H drawn as a line. | Black marketing styling. |
| **Linear** · https://linear.app | Console shell: quiet sidebar, a detail pane with a right-hand properties column, keyboard-first feel, restrained colour. Agent page = issue page (properties: role, charter v, token v, state, confidence). | Dark-only theme, their iconography. |
| **React Flow: examples** · https://reactflow.dev/examples | Technical base: custom nodes, edge labels, node toolbar. Use only the MIT examples; "Pro" examples are paid. | Their demo styling. |

## 3. Landing-page references

| Reference | What we take | What we leave |
|---|---|---|
| **Resend** · https://resend.com | Restraint: one headline, one object, two buttons, generous whitespace, a serif display face for the headline only. | The dark 3D cube. |
| **WorkOS** · https://workos.com | The hero shows the *product itself* as a stack of small state cards. Our version: the **response ladder** (ALLOW → HOLD → DOWN-SCOPE → QUARANTINE → REVOKE) as five stacked rows, with a live D2 run lighting them up as the score climbs. | Gradient headline, purple brand. |
| **Arcjet** · https://arcjet.com | Positioning check: the same space ("Runtime security for AI agents"). Their line is about *where* the decision runs; ours is about *whether the agent is still itself*. Don't drift toward their copy. | Dark nebula visuals. |

Visited and **rejected** as references: Tines (illustration-heavy, not minimal), PostHog (desktop-OS metaphor, busy), Wiz homepage (marketing illustration; the product graph isn't visible), Trigger.dev (landing shows code, not the run view), Socket and Descope (generic dark hero).

## 4. Design direction: "स्वरूप, true form"

- **Idea:** every agent has a *shape* (its role) and a *trace* (its behaviour). Drift = trace leaving the shape. Use that metaphor consistently; don't decorate.
- **Agent identity card (signature component #2):**
  - A radial "role ring": one arc per charter tool, with arc thickness = baseline frequency.
  - Off-charter calls show as marks **outside** the ring, coloured by band.
  - Under it: role, charter v, token v + scopes (over-provisioned scopes struck through in grey), baseline confidence n/(n+k).
- **Score ring:** 0–100 ring with five band ticks (30/55/75/90). The number sits inside in Geist Mono.
- **Colour:**
  - Paper `#FAFAF9`, ink `#0A0A0A`, hairlines `#E7E5E4`.
  - Bands carry all the colour: ALLOW stone-grey `#78716C` (normal shouldn't shout) · HOLD amber `#D97706` · DOWN-SCOPE orange `#EA580C` · QUARANTINE red `#DC2626` · REVOKE ink with a red outline.
  - Accent for links/focus only: deep teal `#0F766E`. Avoid Remit's indigo.
  - Dark mode = the same tokens inverted (define all as CSS variables on `:root`).
- **Type:** Geist for UI and Geist Mono for numbers, hashes and tool names (both verified on Google Fonts; npm `geist` 1.8.1). One serif for the landing headline only (e.g. Instrument Serif, Google Fonts).
- **Motion:** only for state changes: a score ring fills, a band chip flips, a token version ticks v1 → v2. No ambient animation.
- **Density:** 14 px base, 8 px grid, 1 px hairlines, no drop shadows except on the floating scrubber.
- **Rules:** no fake numbers anywhere (everything comes from the engine or eval JSON) · every coloured element maps to a band · every alert names its root cause in plain words before any chart.
