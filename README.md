# Goal Engine

[English](README.md) | [中文](README_zh.md)

Goal Engine is a persistent goal-management and behavioral evolution system for autonomous agents (specifically local OpenClaw agents). It transforms LLMs from "reactive predictors" into "goal-oriented evolutionaries" by enforcing an **Attempt-Reflect-Evolve** loop.

For a deeper dive into the vision and architecture, see:
[**Introduction**](GOAL_ENGINE_INTRO.md) | [**中文介绍**](GOAL_ENGINE_INTRO_zh.md)

## Core Philosophy

![Goal Engine Architecture](assets/images/architecture.svg)

- **Goal Persistence:** Goals survive session restarts, failures, and environment resets.
- **Goal Contracts:** Every goal is governed by a formal contract (outcome, success criteria, autonomy level, and boundary rules).
- **Platform Facts (Evidence):** First-class evidence records (artifacts, facts, replies) are attached to goals as immutable proof of progress.
- **Continuous Evolution:** Agents learn from failures via structured reflections and update internal policies.
- **Evidence-backed Completion:** Goals are only marked completed when referenced evidence IDs prove the contract's success criteria are met.

## Detailed OpenClaw Integration

### 1. Prerequisites
- **Node.js**: >= 22.0.0
- **pnpm**: >= 9.0.0
- **OpenClaw**: A working local OpenClaw installation.

### 2. Installation
First, clone the repository and install dependencies:
```bash
git clone https://github.com/zhangdk/goal-engine.git
cd goal-engine
pnpm install
```

Start the Goal Engine service:
```bash
cd service
pnpm dev
```

Install the local OpenClaw plugin:
```bash
cd ..
./scripts/install-local.sh
```
This script registers the plugin, enables the necessary hooks (`boot-md`, `bootstrap-extra-files`), and configures the `serviceUrl` to `http://localhost:3100`.

### 3. Usage in OpenClaw

The Goal Engine exposes core entrypoints to the OpenClaw agent. For best results, follow the **Fact-First** workflow.

#### **A. Start a New Goal with a Contract**
When you give the agent a task (e.g., "Earn 100 RMB in a day"), it should compile it into a structured goal and a **Goal Contract**:
```bash
# Example invocation with a formal contract
pnpm --dir agent-adapter openclaw entrypoint "start goal" --payload '{
  "title": "Earn 100 RMB in 24h",
  "contract": {
    "outcome": "Revenue of 100 RMB earned through service sales",
    "successEvidence": ["Payment confirmation screenshot", "Bank statement entry"],
    "autonomyLevel": 2,
    "boundaryRules": ["No illegal methods", "Notify user before payments > 10 RMB"]
  }
}'
```

#### **B. Record Evidence**
As the agent progresses, it records first-class evidence (artifacts, replies, etc.) to prove progress:
```bash
pnpm --dir agent-adapter openclaw entrypoint "record evidence" --payload '{
  "goalId": "goal_1",
  "kind": "artifact",
  "summary": "Generated leads list",
  "filePath": "leads.csv"
}'
```

#### **C. Complete Goal with Evidence**
Completion is evidence-referenced. Every completion requires referencing specific evidence IDs that satisfy the contract:
```bash
pnpm --dir agent-adapter openclaw entrypoint "complete goal" --payload '{
  "goalId": "goal_1",
  "evidenceIds": ["ev_123", "ev_456"],
  "summary": "Earned 105 RMB via service sales"
}'
```

#### **D. Check Status & Alignment**
Before any external action (search, browse, etc.), the agent must align the current task:
```bash
pnpm --dir agent-adapter openclaw entrypoint "show goal status" --payload '{"expectedGoalTitle":"Earn 100 RMB in 24h"}'
```

#### **E. Record a Failed Attempt**
If a strategy fails (e.g., blocked by a captcha), the agent **must** record it to update its policy:
```bash
pnpm --dir agent-adapter openclaw entrypoint "record failed attempt" --payload '{"stage":"initial","actionTaken":"Tried Baidu search","strategyTags":["search"],"failureType":"stuck_loop"}'
```

#### **F. Check Retry (The Guard)**
Before trying a similar path, the agent checks if the new plan is meaningfully different:
```bash
pnpm --dir agent-adapter openclaw entrypoint "check retry" --payload '{"plannedAction":"Try Bing search","whatChanged":"Switched from Baidu to Bing","strategyTags":["search"],"policyAcknowledged":true}'
```

#### **G. Recover Goal Session**
In a fresh session, use this to restore context from the service:
```bash
pnpm --dir agent-adapter openclaw entrypoint "recover current goal"
```

## Key Components
- **`service/`**: Node.js/Hono server backed by SQLite.
- **`agent-adapter/`**: Orchestration layer handling platform facts, retry-guards, and session recovery.
- **`shared/`**: Common TypeScript types defining the Platform Fact Protocol.
- **`openclaw/`**: Integration shell for the OpenClaw plugin ecosystem.

## Access Local UI
Open `http://localhost:3100/ui` to observe agent evolution, evidence-based progress, and the learning timeline.

## License
This project is licensed under the [MIT](LICENSE) License.
