# Goal Engine

[English](README.md) | [中文](README_zh.md)

Goal Engine is a persistent goal-management and behavioral evolution system for autonomous agents (specifically local OpenClaw agents). It transforms LLMs from "reactive predictors" into "goal-oriented evolutionaries" by enforcing an **Attempt-Reflect-Evolve** loop.

## Core Philosophy

- **Goal Persistence:** Goals survive session restarts, failures, and environment resets.
- **Continuous Evolution:** Agents learn from failures via structured reflections and update internal policies.
- **Autonomous Execution Stack:** Provides mission compilation, strategy selection, boundary management, and no-false-done guards.

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

The Goal Engine exposes 5 core entrypoints to the OpenClaw agent. For best results, follow the **Tool-First** workflow.

#### **A. Start a New Goal**
When you give the agent a task (e.g., "Earn 100 RMB in a day"), it should compile it into a structured goal:
```bash
# Example invocation via adapter CLI
pnpm --dir agent-adapter openclaw entrypoint "start goal" --payload '{"title":"Earn 100 RMB in 24h","successCriteria":["Payment confirmation exists"],"currentStage":"initial"}'
```

#### **B. Check Status & Alignment**
Before any external action (search, browse, etc.), the agent must align the current task:
```bash
pnpm --dir agent-adapter openclaw entrypoint "show goal status" --payload '{"expectedGoalTitle":"Earn 100 RMB in 24h"}'
```

#### **C. Record a Failed Attempt**
If a strategy fails (e.g., blocked by a captcha), the agent **must** record it to update its policy:
```bash
pnpm --dir agent-adapter openclaw entrypoint "record failed attempt" --payload '{"stage":"initial","actionTaken":"Tried Baidu search","strategyTags":["search"],"failureType":"stuck_loop"}'
```

#### **D. Check Retry (The Guard)**
Before trying a similar path, the agent checks if the new plan is meaningfully different:
```bash
pnpm --dir agent-adapter openclaw entrypoint "check retry" --payload '{"plannedAction":"Try Bing search","whatChanged":"Switched from Baidu to Bing","strategyTags":["search"],"policyAcknowledged":true}'
```

#### **E. Recover Goal Session**
In a fresh session, use this to restore context from the service:
```bash
pnpm --dir agent-adapter openclaw entrypoint "recover current goal"
```

### 4. Example Workflow: "The Revenue Sprint"
1. **User**: "Give you a task: earn 100 RMB within one day, any method."
2. **Agent**: Calls `goal_engine_start_goal` to create the contract.
3. **Agent**: Selects a strategy (e.g., selling a micro-service).
4. **Agent**: Fails an attempt -> calls `record_failed_attempt`.
5. **Goal Engine**: Updates policy (e.g., "Avoid path X, try path Y").
6. **Agent**: Calls `check_retry` -> Allowed -> Executes new path.
7. **Agent**: Reaches success evidence -> Calls `record_success` (upcoming) or updates status.

## Key Components
- **`service/`**: Node.js/Hono server backed by SQLite.
- **`agent-adapter/`**: Orchestration layer handling retry-guards and session recovery.
- **`openclaw/`**: Integration shell for the OpenClaw plugin ecosystem.

## Access Local UI
Open `http://localhost:3100/ui` to observe agent evolution, evidence-based progress, and the learning timeline.

## License
This project is licensed under the [MIT](LICENSE) License.
