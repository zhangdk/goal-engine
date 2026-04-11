---
name: external-goal-learning-loop
description: Use when an agent is executing an external-world goal with a result outside the repository, especially when retries, environment blockers, login requirements, or token growth could cause drift.
---

# External Goal Learning Loop

## Overview

Use this skill for external goals such as ordering, booking, comparing real-world options, or reaching a pre-confirmation page outside the repo.

Do not hardcode website-specific answers. Constrain the agent to a repeatable learning loop.

This skill assumes the agent should first discover whether a better skill already exists, then fail in a structured way, then preserve only the smallest useful memory.

## Use This Skill When

- Success depends on a website, app, account, booking flow, or outside data
- The result is not “edit a file” but “reach a real-world outcome”
- A failed attempt could be retried in a different way
- Prompt size is starting to grow from repeated exploration

## Before You Start

For an external goal, do these checks first:

1. Check whether a more specific local skill already exists.
2. If OpenClaw exposes a skill-market or `find-skill` capability, search for a relevant skill before broad exploration.
3. Check whether the task may require local native software, not just web access.

If a more specific skill exists, use it instead of improvising.

## Core Rule

Do not ask “what is the correct site-specific script?”  
Ask “what is the smallest next path, what failed, and what must change?”

## Execution Protocol

### 1. Lock the goal

State these fields first:

- `goal`
- `success_criteria`
- `hard_constraints`
- `current_stage`

### 2. Choose one path only

For this round, choose:

- one `primary_path`
- one optional `fallback_path`

Do not explore multiple primary channels in parallel.

### 3. Keep the attempt small

Budget per round:

- up to 3 external pages
- up to 1 channel switch
- up to 1 long extraction

If the budget is exhausted, summarize before continuing.

### 4. If blocked, classify the failure

Choose one:

- `missing_user_input`
- `environment_blocked`
- `login_or_auth_required`
- `tool_unavailable`
- `strategy_mismatch`
- `validation_fail`
- `stuck_loop`

Then immediately run a failure-learning step:

- capture the failure in Goal Engine if the service path works
- call or follow `self-improvement` so the failure becomes a reusable lesson
- separate infrastructure failure from strategy failure

### 5. Write the minimum failure packet

Output:

- `goal`
- `stage`
- `attempted_path`
- `failure_reason`
- `what_must_change_next`

### 6. Prove the next round is different

Before retrying, explicitly state:

- `do_not_repeat`
- `new_path`
- `why_better_than_last_round`

### 7. Keep the recovery packet tiny

Preserve only:

- current goal
- current stage
- latest failure summary
- avoid strategies
- next-step guidance

Do not re-inject full history unless strictly necessary.

### 8. Preserve memory at the right level

If the failure or workaround is likely to matter again:

- short-lived execution detail -> daily `memory/YYYY-MM-DD.md`
- durable cross-session lesson -> `MEMORY.md`
- repeated failure or user correction -> `.learnings/LEARNINGS.md` or `.learnings/ERRORS.md`

Do not use `MEMORY.md` as a substitute for Goal Engine state. Use it only for durable lessons and preferences.

## External Goal State Model

Use these stages:

1. `goal-clarification`
2. `channel-selection`
3. `candidate-validation`
4. `action-execution`
5. `pre-confirmation`
6. `handoff-or-block`

## Handoff Rule

If the blocker is payment, login, or environment capability and no safe alternative exists:

- stop pretending progress
- report the blocker clearly
- hand off with the smallest actionable summary

Before handoff, verify you have checked:

- alternative skill availability
- local native-app path
- self-improvement logging

## Bad Pattern

- Search many channels at once
- Re-explain the full history every turn
- Retry the same path with new wording only
- Mix environment failures with strategy failures

## Good Pattern

- Small round
- One path
- Clear failure class
- Explicit change before retry
- Tiny recovery packet
- Skill discovery before improvisation
- Self-improvement after meaningful failure
