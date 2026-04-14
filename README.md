# Goal Engine

[English](README.md) | [中文](README_zh.md)

Goal Engine is a persistent goal-management and behavioral evolution system for autonomous agents (specifically local OpenClaw agents). It transforms LLMs from "reactive predictors" into "goal-oriented evolutionaries."

## Core Philosophy

- **Goal Persistence:** Goals survive session restarts, failures, and environment resets.
- **Continuous Evolution:** Agents learn from failures via structured reflections and update internal policies.
- **Autonomous Execution Stack:** Provides mission compilation, strategy selection, boundary management, and no-false-done guards.
- **Skill Acquisition:** Encourages agents to proactively "hunt" or "forge" new skills when existing ones fail.

## Key Components

- **`service/`**: Node.js/Hono server backed by SQLite. Manages goals, attempts, reflections, and policies.
- **`agent-adapter/`**: Orchestration layer handling retry-guards and session recovery.
- **`shared/`**: Common TypeScript types defining the communication protocol.
- **`openclaw/`**: Integration shell for the OpenClaw plugin ecosystem.

## Quick Start

### Prerequisites
- **Node.js**: >= 22.0.0
- **pnpm**: >= 9.0.0

### Install and Run Service
```bash
pnpm install
cd service
pnpm dev
```

### Access Local UI
Open `http://localhost:3100/ui` to observe agent evolution and evidence-based progress.

## License

This project is licensed under the [MIT](LICENSE) License.
