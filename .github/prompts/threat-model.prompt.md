---
agent: "application-security-architect"
name: threat-model
description: "Threat model the system using Shostack’s 4Q framework and produce actionable artifacts with repo-grounded diagrams validated via Mermaid Chart tools."
---

# Prompt: 4Q Threat Model (DFDs + Supporting Diagrams, Tool-Validated Mermaid)

## Mission & Scope

**Goal:** Embed Adam Shostack’s **Four-Question** threat modeling into daily dev flow using VS Code + GitHub. Infer design from the repository (and/or PR diff), collaborate with the developer, and produce durable artifacts:

1. a repo-grounded threat model Markdown report **with validated Mermaid diagrams**
2. a concise PR-ready summary (copy/paste)

**4 Questions:**

1. *What are we working on?* → Infer & confirm scope, assets, data flows, trust boundaries  
2. *What can go wrong?* → Enumerate threats (context-specific), map to STRIDE + OWASP  
3. *What are we going to do about it?* → Identify mitigations + gaps; status w/ evidence  
4. *Did we do a good job?* → Validation plan: evidence to collect + owners

**Where it runs:**

- **Local:** VS Code Copilot Chat / Agent mode  
- **PR review:** Same output format works as PR comment or issue description

---

## ✅ Context / Assumptions

- Threat model the current repository and/or current PR diff (if available).
- Persist output as a Markdown file in project root:
  - `Threat Model Review - {{DATE}}.md`
- Evidence-first: cite file paths and (when possible) line ranges for claims about design, flows, mitigations, and trust boundaries.
- If you cannot confirm something from the repo/diff, label it **ASSUMPTION** or **UNKNOWN** (do not guess).
- Ask **2–4 clarifying questions** if scope, dataflows, deployment, or identities are unclear.
- Do not generate code changes unless explicitly requested.

---

## 🧰 Mermaid Diagram Tooling (Mandatory)

You have access to Mermaid Chart tools:

- `mermaidchart.vscode-mermaid-chart/get_syntax_docs`
- `mermaidchart.vscode-mermaid-chart/mermaid-diagram-validator`
- `mermaidchart.vscode-mermaid-chart/mermaid-diagram-preview`

**You MUST use them** to prevent syntax errors.

### Tool-driven diagram workflow (required)

For every Mermaid diagram you include:

1. **Pick the correct diagram type**  
   - Before drafting each diagram, consult `get_syntax_docs` for that diagram type (e.g., `flowchart`, `sequenceDiagram`, `C4`, `classDiagram`, `erDiagram`).
2. **Draft the diagram with minimal syntax**  
   - Prefer simpler constructs over fancy styling.
   - Avoid experimental/unsupported directives unless confirmed in syntax docs.
3. **Validate**  
   - Run `mermaid-diagram-validator` on each diagram block.
   - If validation fails, fix and re-validate until it passes.
4. **Preview sanity check (optional but recommended)**  
   - Use `mermaid-diagram-preview` for the final versions of the DFD Level 0 and Level 1 diagrams.

### Mermaid reliability rules (to avoid common breakage)

- Always start with a valid diagram header: `flowchart LR`, `sequenceDiagram`, `classDiagram`, `erDiagram`, etc.
- Don’t mix diagram grammars (e.g., don’t use `participant` in `flowchart`).
- Avoid parentheses/brackets in node IDs; put complex text in node *labels*.
  - Good: `API[Process: Web API]`
  - Avoid: `API(Process: Web API)`
- Quote edge labels if they contain special characters:
  - `A -->|"JWT (RS256)"| B`
- Use unique node IDs and keep them alphanumeric/underscore (e.g., `svc_orders`, `db_main`).
- Keep subgraph titles simple; avoid `:` if it breaks parsing.
- Prefer `flowchart`-based DFDs for compatibility; use C4 only if syntax docs confirm availability in your Mermaid environment.

**Gating requirement:**  
> Do not output any Mermaid diagram unless it has passed the Mermaid validator.

---

## 🔒 Diagram Requirements (Mermaid)

**You MUST include diagrams** unless Mermaid rendering is not supported. Use Mermaid code blocks.

### Required diagram set

1. **DFD Level 0 (Context)** — entire system + external entities + trust boundaries  
2. **DFD Level 1 (Container / Major Subsystems)** — major processes, datastores, and flows  
3. **Trust Boundary View** — explicitly call out boundary crossings (can be embedded in DFDs if clear)  
4. **Top 2–3 Sequence Diagrams** — highest-risk flows (auth/login, payment, admin action, data export)

### Optional (include when discoverable)

- **Deployment / Runtime Topology** (k8s/compose/serverless/IaC-derived)
- **Identity & Authorization model diagram** (actors → roles → permissions → enforcement points)
- **Data classification map** (PII/PHI/secrets/payment data) tied to datastores and flows

### Diagram evidence rules

- Every diagram must include a short **Evidence** list:
  - file path(s) + relevant symbol(s) (and line ranges when possible)
- If you cannot infer an element, label it **UNKNOWN** in the diagram and explain what evidence is missing.

---

## 🔍 Procedure (4Q)

### 0) Triage & Inventory (fast, evidence-based)

- Identify entry points, deployables, and primary data stores:
  - manifests (`package.json`, `pom.xml`, `.csproj`, `pyproject.toml`)
  - runtime configs (`docker-compose`, `k8s`, `serverless`, Terraform)
  - auth config and secrets patterns
- Produce a short inventory list with evidence links.

### 1) **Q1 — What are we working on?**

Deliver:

- System purpose (from README/docs where possible)
- Components / containers / deployables
- Key assets (data + systems)
- **Key dataflows** (ranked by sensitivity and exposure)
- Trust boundaries (internet/app/network/cloud/3rd party/admin)
- **Diagrams (DFD L0 + L1 + trust boundaries)** — tool-validated

### 2) **Q2 — What can go wrong?**

For each key flow in the DFD:

- Enumerate threats specific to that flow
- Map to:
  - **STRIDE** category
  - **OWASP** tag (Top 10 / ASVS control area / API Top 10 — whichever best fits)
- Include a short “Attack narrative” for the top risks (2–5 sentences)

Also include:

- Abuse cases for privileged/admin pathways
- Supply chain threats if dependency/build pipeline evidence exists

### 3) **Q3 — What are we going to do about it?**

For each threat:

- Identify mitigations as **PRESENT / ABSENT / UNKNOWN**
- Provide evidence when PRESENT:
  - exact file path + symbol + line range (when possible)
- If ABSENT/UNKNOWN:
  - propose remediation options
  - note expected effort (S/M/L) and blast-radius

### 4) **Q4 — Did we do a good job?**

Create a validation plan (no code changes) that includes:

- 3–6 scenarios (prioritize highest-risk flows)
- Evidence to collect (logs, config proof, test results, screenshots, policy outputs)
- Owners (team/person/role)

Include a final quality review checklist:

- Coverage: do DFD flows map to threats/mitigations?
- Boundary crossings: are they analyzed?
- Unknowns: are they actionable questions with owners?
- Mermaid diagrams: did all pass validator?

---

## 📦 Output Format (GitHub-Flavored Markdown)

Return the threat model as PR-comment-ready Markdown in chat.

If the environment supports writing files, also write: `./Threat Model Review - {{DATE}}.md`

### 0. Executive summary

- 5–10 bullets: top risks, what’s solid, what’s unknown, next actions

### 1. Scope

- In-scope components/containers:
- Out-of-scope:
- Trust boundaries:
- Key assets (with sensitivity: Public/Internal/Confidential/Restricted):

### 2. Assumptions & Unknowns

- **ASSUMPTION:** …
- **UNKNOWN:** … (include “Who can confirm” + question)

### 3. Architecture & Data Flows (with tool-validated diagrams)

#### 3.1 DFD Level 0 (Context)

```mermaid
flowchart LR
  %% (diagram content validated via Mermaid Chart tools)
```

**Evidence**

- `path/to/file` (symbol: …, lines …)

#### 3.2 DFD Level 1 (Subsystems / Containers)

```mermaid
flowchart LR
  %% (diagram content validated via Mermaid Chart tools)
```

**Evidence**

- …

#### 3.3 Supporting diagrams (as applicable)

- Trust boundary view (if not already clear)
- Deployment topology (if discoverable)
- Identity/authorization model (if discoverable)

### 4. Key Flows (ranked)

For each flow:

- Description
- Data elements involved (classify)
- Entry points and enforcement points
- Evidence links

### 5. Threats

Table:

`ID | Flow | Summary | STRIDE | OWASP | Likelihood (L/M/H) | Impact (L/M/H) | Status (Open/Mitigated/Unknown) | Rationale`

### 6. Mitigations

Table:

`Threat ID | Mitigation | Status (PRESENT/ABSENT/UNKNOWN) | Location/Evidence | Notes/Open questions`

### 7. High-risk interaction sequences (top 2–3, tool-validated)

Provide sequence diagrams for the riskiest flows:

```mermaid
sequenceDiagram
  %% (diagram content validated via Mermaid Chart tools)
```

**Evidence**

- …

### 8. Validation plan (no code)

Provide **3–6 scenarios**:

- Intent
- Preconditions
- Steps
- Expected result
- Evidence to collect
- Owner

### 9. Owners

- Who confirms assumptions:
- Who drives mitigations:
- Who validates fixes:

### 10. Open questions

- Bullets; each includes an owner and where to look in the repo

### ✅ Quality checks

- Every **PRESENT** mitigation includes concrete code/config location (path + lines when possible).
- **UNKNOWN** includes a follow-up question + owner.
- Threats are tied to DFD flows (no generic dump).
- Diagrams match actual repo components and are evidence-linked.
- Evidence vs. inference is clearly labeled.
- **All Mermaid diagrams were validated using `mermaid-diagram-validator`.**