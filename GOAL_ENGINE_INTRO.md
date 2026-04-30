# 🚀 Goal Engine: Persistent Goal & Behavioral Evolution Engine

[English](GOAL_ENGINE_INTRO.md) | [中文](GOAL_ENGINE_INTRO_zh.md)

> **"Make agents more than just executors—make them evolutionaries that never stop until the goal is achieved."**

## 1. Vision
`goal-engine` is a goal-governance and behavioral evolution system specifically designed for autonomous agents. It transforms agents from reactive predictors into goal-oriented evolutionaries by shifting from "process-based logs" to **"fact-based evidence."**

In the Goal Engine universe, a task is not a prompt interaction, but a **legally binding contract backed by immutable evidence.**

---

## 2. Architecture: Platform Facts Foundation

![Goal Engine Architecture](assets/images/architecture.svg)

*   **Goal Contract (The Commitment)**: Every mission starts with a contract defining the outcome, success evidence, and boundary rules. This prevents "success hallucination."
*   **Attempt Evidence (The Fact)**: Every meaningful progress or block is recorded as first-class evidence (Artifacts, Facts, Channel Checks). Process is data; Evidence is truth.
*   **Evidence-Backed Completion (The Squeeze)**: A goal cannot be "marked done." It must be "proven done" by referencing specific evidence IDs that satisfy the initial contract.
*   **Centralized Brain**: A persistent backend powered by SQLite, storing the immutable facts foundation and synchronizing cognitive policies across agents.

---

## 3. Differentiation: Moving Beyond Conventional Paradigms

### A. vs. Mainstream Harness Engineering
| Dimension | Traditional Harness (e.g., OpenHarness) | Goal Engine (Platform Facts) |
| :--- | :--- | :--- |
| **Trust Model** | **Implicit**: Agent says it's done. | **Explicit**: Agent proves it's done via Evidence IDs. |
| **Persistence** | **Stateless**: Context lost after session. | **Fact Foundation**: Immutable history of evidence. |
| **Goal Tracking** | **Drifting**: Prompt-based targets. | **Contractual**: Enforced Goal Contracts. |
| **Completion** | **Patching**: `status = "completed"`. | **Referenced**: Completion record links to Evidence. |

### B. vs. Other Agent Products
*   **Vs. MemGPT / Letta**: While MemGPT focuses on "Contextual Memory," Goal Engine focuses on **"Behavioral Governance through Facts."**
*   **Vs. NVIDIA Voyager**: Voyager proves code-level skills; Goal Engine brings industrial-grade **Goal Contracts and Evidence-referenced completion** into production.

---

## 4. Ecosystem & Future

*   **Platform Fact Protocol**: A common language (via `shared/types.ts`) for agents to record evidence across different environments (browsers, servers, CLI).
*   **Zero-Trust Completion**: Future versions will implement automatic semantic verification of evidence against the contract, ensuring that no agent can "fake" a successful outcome.

---

**Goal Engine is not just managing tasks; it is engineering "willpower" through an immutable foundation of platform facts.**
