# GEMINI.md - Goal Engine Context & Instructions

> **IMPORTANT:** Read and follow `WORKSPACE_RULES.md`, `BOOT.md`, and `BOOTSTRAP.md`. These files define project-wide conventions and the mandatory Goal Engine workflow for all agents.

This file provides the necessary context and instructions for AI agents operating within the `goal-engine` project. It defines the project's purpose, architecture, and core development standards.

## Project Overview

**Goal Engine** is a persistent goal-management and behavioral evolution system for autonomous agents (specifically local OpenClaw agents). It transforms LLMs from "reactive predictors" into "goal-oriented evolutionaries."

### Core Philosophy
- **Goal Persistence:** Goals must survive session restarts and failures.
- **Continuous Evolution:** Agents learn from failures via reflections and update their internal policies.
- **Distributed Governance:** A centralized backend (`service/`) manages goals and policies, while distributed adapters (`agent-adapter/`) handle environment-specific execution and "squeezing" of agent potential.
- **Skill Acquisition:** Agents are encouraged to proactively "hunt" or "forge" new skills (via network search or code generation) when existing ones fail.

### Key Components
- **`service/`**: Node.js/Hono server backed by Better-SQLite3. Manages goals, attempts, reflections, and policies.
- **`agent-adapter/`**: Orchestration layer connecting the agent to the environment. Handles retry-guards and recovery.
- **`shared/`**: Common TypeScript types and contracts defining the communication protocol.
- **`openclaw/`**: Integration shell for the OpenClaw plugin ecosystem.

---

## Building and Running

### Prerequisites
- **Node.js**: >= 22.0.0
- **pnpm**: >= 9.0.0

### Key Commands

| Action | Command | Directory |
| :--- | :--- | :--- |
| **Install** | `pnpm install` | Root |
| **Start Service (Dev)** | `cd service && pnpm dev` | Root |
| **Run Unit Tests** | `pnpm test` | Root, `service/`, or `agent-adapter/` |
| **Run E2E Tests** | `cd service && pnpm test:e2e` | Root |
| **Check Types** | `pnpm exec tsc --noEmit` | `service/` or `agent-adapter/` |

---

## Development Conventions

### 1. Goal Lifecycle & "The Squeeze"
Every agent action should be part of the **Attempt -> Reflect -> Evolve** loop:
- **Failure is Data:** Never ignore a failure. Always trigger a `Reflection` and update the `Policy`.
- **Proactive Retrieval:** Before a retry, the agent must check the `RetryGuard` against current `Policy`.

### 2. Safety & Governance (Anti-Contamination)
- **Environment Fingerprinting:** When persisting learning, include context metadata (OS, project stack) to avoid "cross-session contamination" (e.g., using `yarn` logic in an `npm` project).
- **Scope Isolation:** Distinguish between **Global** values, **Domain** technical patterns, and **Workspace**-specific paths.

### 3. Coding Standards
- **Strict Types:** Use the shared types in `shared/types.ts` for all IPC and persistence.
- **Atomic Operations:** Ensure SQLite transactions are used for writing back reflections and policies to maintain data integrity.
- **Surgical Edits:** When modifying the service or adapter, ensure backward compatibility with the existing OpenClaw plugin shell.

### 4. Memory Management
- **Persistence First:** If a decision is made, it must be written to a file or the database. "Mental notes" do not exist.
- **Identity Alignment:** Respect `SOUL.md` (personality/vibe) and `IDENTITY.md` (avatar/name) during agent interactions.

---

## Project Structure (High Level)
```text
goal-engine/
  ├── service/        # Hono + SQLite Backend
  ├── agent-adapter/  # Environment Adapter & Orchestration
  ├── shared/         # Contract Layer (Types)
  ├── docs/           # Architecture & API Specs
  ├── openclaw/       # Plugin Integration
  └── .learnings/     # Historical Errors & Lessons
```

---

## TODOs & Missing Links
- [ ] Implement automatic `goal_engine_bootstrap` lifecycle.
- [ ] Wire up OpenClaw plugin hooks for seamless failure interception.
- [ ] Add Multi-Agent goal partitioning and coordination logic.
