# Goal Engine Autonomous Execution Stack

> Date: 2026-04-13
> Context: OpenClaw main Agent received the goal "one day to earn 100 RMB, any method" at 15:18 and failed to run an autonomous execution loop.

## Summary

Goal Engine should not be satisfied with an Agent that remembers failures. It must turn rough user outcomes into executable missions, keep control of the goal across failures and heartbeats, and force strategy changes when the Agent stalls.

The 2026-04-13 revenue task did not primarily fail because the Agent lacked ideas for earning money. It failed because the runtime treated the user's outcome as a chat prompt instead of an external-world mission.

The project needs an Autonomous Execution Stack: a supervisor-enforced control layer that compiles rough goals, selects strategies, manages permission boundaries, records attempts, turns failure into policy, and resumes work automatically.

## Product Standard

Users will often give simple, blunt goals:

> Give you a task: earn 100 RMB within one day, any method.

The user should not need to decompose that into market research, channel selection, offer design, buyer outreach, payment handling, failure writeback, and retry strategy. That decomposition is the AI's job.

Goal Engine succeeds only if:

- the user gives an outcome, not a plan
- the Agent creates an executable goal contract
- the Agent chooses a strategy without asking the user to be the PM
- the Agent advances real external facts
- permission boundaries are handled as narrow authorization points
- failures change the next round of behavior
- heartbeat and session recovery continue unfinished goals
- the Agent cannot falsely claim completion without success evidence

If this does not work, Goal Engine remains a logged chat assistant instead of an autonomous goal-control layer.

## Failure Observed

In the 15:18 revenue task, the Agent:

- did not create or align a Goal Engine goal
- over-anchored on Protocol30 tool failures
- repeatedly asked the user to choose the path
- ignored the unfinished task during heartbeat
- drifted into infrastructure debugging
- generated a single digital asset but did not create a sales loop
- attempted channel inspection in a way that exposed secrets in logs
- failed to answer the user's critique due to model/runtime timeout and an empty response

The produced "cute lobster" SVG/PNG was not a completed revenue attempt. It was only a possible product artifact. There was no buyer, channel, payment path, outreach loop, or success evidence.

## Core Diagnosis

Current Goal Engine behavior is too instruction-based. It depends on the Agent voluntarily remembering to call Goal Engine tools.

That is not enough.

The control position must move from prompt guidance into runtime supervision:

```text
User Message
  -> Mission Classifier
  -> Goal Compiler
  -> Autonomy Supervisor
  -> Strategy Portfolio
  -> Execution Kernel
  -> Boundary Manager
  -> Attempt Writeback
  -> Reflection / Policy
  -> Retry Guard
  -> Heartbeat / Cron Continuation
```

The Agent should be the execution brain. Goal Engine should act as the external prefrontal cortex: maintain the goal, check evidence, manage risk, prevent self-deception, and force a different path after failure.

## Proposed Stack

### 1. Mission Classifier

Detect when a user message is an external-world goal.

Examples:

- earn money
- find a person or contact
- register for an event
- buy something
- publish content
- contact someone
- book a service
- complete research with real-world evidence

When a message is classified as an external-world goal, normal chat mode is not enough. Goal Engine must create or align an active goal before external tools are used.

### 2. Goal Compiler

Turn the user's rough outcome into a structured goal contract.

Example for the revenue task:

```text
Goal:
  outcome: earn at least 100 RMB within 24 hours
  deadline: 2026-04-14 15:18 Asia/Shanghai
  success_evidence:
    - payment confirmation
    - order confirmation
    - user-confirmed equivalent revenue
  constraints:
    - do not break laws
    - do not impersonate the user
    - do not publicly post or send private messages without permission
  autonomy_level:
    - strategy selection: autonomous
    - information gathering: autonomous
    - artifact creation: autonomous
    - external sending/public posting/payment: requires boundary authorization
```

The compiler must produce an executable contract, not a summary of the user's words.

### 3. Capability Inventory

The Agent must inventory its current affordances before asking the user for direction.

The inventory should include:

- local capabilities: code, writing, design, automation, data analysis
- available tools: browser, search, message channels, file system, OpenClaw agents, Feishu, GitHub
- available user assets: projects, documents, channels, contacts, with permission limits
- market paths: service, digital product, lead generation, automation, content, marketplace tasks, internal value exchange
- hard blockers: login, captcha, payment, public posting, identity use

The goal is an affordance graph: what value can the Agent create, for whom, through which permitted path.

### 4. Strategy Portfolio

The Agent must generate multiple candidate paths before choosing one.

For a 24-hour 100 RMB revenue goal, plausible paths include:

- quick service: 99 RMB bug triage, landing page copy, competitor scan, resume polish, pitch deck cleanup, project diagnosis
- digital product: prompt pack, template, micro-tool, SVG/icon pack, checklist, notion sheet
- internal value exchange: complete a user project task and ask the user to confirm equivalent value
- outreach: prepare targeted service offers and request permission to send
- marketplace: search for immediately executable gigs, record platform blockers quickly
- asset monetization: prepare idle-item listing, product page, or sales copy for user-owned assets

The Agent must not collapse into a single artifact path unless it has strong evidence that path can close the revenue loop.

### 5. Decision Engine

The Agent chooses the first path using an explicit scoring model:

```text
score = expected_value * probability / time_to_first_evidence - risk - permission_cost
```

For short-deadline revenue goals, the decision model should prefer:

- fastest path to real buyer feedback
- highest chance of a 100 RMB transaction
- lowest permission burden
- easiest delivery
- easiest fallback if blocked
- highest reuse value if the first attempt fails

The Agent should not ask "which one do you choose?" It should decide:

> I choose the high-ticket quick-service path because the deadline is short, the delivery is controllable, and one sale can satisfy the target. I will stop only at the external sending/payment authorization boundary.

### 6. Execution Kernel

Every attempt must produce an external fact or a concrete artifact that advances the mission.

Attempt format:

```text
Attempt:
  hypothesis: why this may achieve the goal
  action: what was done
  evidence: what external fact or artifact now exists
  result: success | partial | failure
  blocker: what blocked progress
  next_delta: what will change next round
```

No evidence means no real attempt.

Valid evidence can include:

- a buyer list
- a published or ready-to-send offer
- a channel check result
- a permission request at a specific boundary
- a generated deliverable sample
- a reply from a buyer
- a platform blocker
- payment/order confirmation

### 7. Boundary Manager

The Agent needs permission boundaries, not user handoff.

Suggested levels:

```text
Level 0: local analysis, public search, local artifact creation -> autonomous
Level 1: read non-sensitive workspace materials -> autonomous within workspace rules
Level 2: prepare messages, target lists, product pages, samples -> autonomous
Level 3: send private messages, post publicly, use user identity -> explicit authorization
Level 4: payment, contracts, legal/financial commitments -> explicit confirmation
```

When the Agent hits a boundary, it should request the smallest needed authorization:

> I have prepared 10 buyer-specific messages and 3 service samples. Next boundary: sending messages through channel X. Approve sending to these targets, or I will produce a copy-ready package for manual sending.

It should not say:

> I cannot collect money, so you go sell it.

### 8. Attempt Writeback

Goal Engine must require writeback for progress, failure, and success.

Writeback should happen when:

- a path is selected
- an artifact is created
- a channel is checked
- a blocker is found
- the Agent asks for permission
- an external reply is received
- the Agent changes strategy
- the Agent claims completion

This makes the UI a real evidence surface, not a passive transcript viewer.

### 9. Reflection and Policy

Failure must update behavior, not just memory.

For the revenue failure, policy should become:

```text
Avoid:
  - Do not downgrade external revenue goals into brainstorming.
  - Do not stop non-Protocol30 execution because Protocol30 is unavailable.
  - Do not create one digital artifact and ask the user to handle sales.
  - Do not claim completion before revenue evidence exists.

Must:
  - Create a GoalContract for revenue goals.
  - Produce at least one external fact per attempt.
  - Request minimal authorization at messaging/payment boundaries.
  - Continue active external goals during heartbeat.
  - Change strategy after failure and state what changed.

Preferred next step:
  - For short-deadline revenue goals, prefer high-ticket service offers plus rapid buyer feedback over low-priced digital art without a channel.
```

The policy must be used by retry guard and response guard. It should not merely be displayed.

### 10. Retry Guard

After failure, the Agent may not retry without explaining what changed.

Required retry fields:

```text
planned_action:
what_changed:
strategy_tags:
policy_acknowledged:
why_better_than_last_attempt:
```

If the Agent repeats the same path, the guard should block or warn strongly.

### 11. No-False-Done Guard

The Agent may not claim completion unless success evidence exists.

For a revenue goal, valid completion evidence is:

- confirmed payment
- confirmed order
- user-confirmed equivalent value
- another project-defined revenue proof

Without evidence, allowed statuses are:

- progress
- blocked
- waiting for authorization
- strategy changed
- failed attempt recorded

Not allowed:

- "I did it" because an artifact exists
- "done" because a message was drafted
- "finished" because the user needs to handle sales

### 12. Heartbeat Continuation

Heartbeat must check active external goals.

If an active external goal is unfinished, heartbeat may not return `HEARTBEAT_OK` unless:

- the goal is waiting on an explicit user authorization
- there is a cooldown policy
- the deadline passed and a final failure report was written

Otherwise heartbeat must:

- recover current goal
- read current policy
- choose the next executable action
- write progress or failure

### 13. Session Recovery

A reset or new session must restore:

- current goal contract
- deadline
- success evidence requirements
- latest attempt
- current policy
- active blocker
- next recommended action
- permission boundary state

This prevents the Agent from acting as if no mission is active after a reset.

## Revenue Sprint Benchmark

The "earn 100 RMB within 24 hours" task should become a standing benchmark.

The benchmark does not require the Agent to always earn money. It tests whether the system behaves like an autonomous executor.

Suggested acceptance timeline:

```text
T+1 min:
  GoalContract created.

T+3 min:
  Capability inventory complete.

T+5 min:
  First strategy selected.

T+15 min:
  First external fact or concrete sales asset exists.

T+30 min:
  If blocked, failure is written and policy changes.

T+45 min:
  Second attempt uses a meaningfully different path.

Heartbeat:
  Cannot ignore unfinished external goal.

Session reset:
  Restores mission and next action.

User critique:
  Explains state and continues execution, not empty response.

Completion:
  Requires success evidence.
```

## Correct Revenue Task Shape

The failed run ended with:

> I made a cute lobster image. You sell it.

The expected autonomous shape is:

```text
15:18 Goal created:
  Earn 100 RMB within 24 hours.

15:20 Strategy selected:
  Choose a 99 RMB AI Ops / writing / automation micro-service because delivery is fast and one sale can satisfy the goal.

15:25 Assets created:
  - service title
  - three packages
  - sample deliverables
  - buyer-specific messages
  - target customer profile

15:30 Boundary request:
  Need authorization before sending messages. If not authorized, prepare copy-ready messages and continue building alternate channels.

15:40 Attempt 1:
  Channel A unavailable due to token/login blocker.
  Failure written.
  Policy updated: do not depend on Telegram; switch to Feishu/manual-copy/local-channel path.

15:50 Attempt 2:
  Prepare Feishu/group/contact-specific offer package and request minimal send authorization.

16:10 Attempt 3:
  Parallel fallback: build a 99 RMB project diagnosis sample for developer/startup audience.

16:30 If no external-send authorization:
  Continue creating sales page, target list, scripts, and sample report. Keep the mission active rather than handing the whole task back to the user.
```

## Minimal Implementation Path

The smallest useful version does not need a full AGI system. It needs a few hard runtime gates.

### MVP Features

1. External Goal Detector
   - Classify revenue/contact/booking/publishing/research goals as external missions.

2. Mandatory GoalContract
   - Create or align a goal before external tools are used.

3. Attempt Watchdog
   - At response end, require progress/failure/next-action writeback for unfinished external goals.

4. No-False-Done Guard
   - Prevent completion claims without success evidence.

5. Heartbeat Continuation
   - Prevent `HEARTBEAT_OK` when an unfinished external goal still has executable next steps.

6. Strategy Change Guard
   - Require `what_changed` after failure.

7. Permission Boundary Protocol
   - Ask only for the minimum authorization needed at external sending/payment/login boundaries.

8. Revenue Sprint Eval
   - Run the 24-hour 100 RMB task as a repeatable system benchmark.

## Engineering Direction

The next phase should be framed as:

> Move Goal Engine from instruction-based guidance to supervisor-enforced execution.

Implementation should prioritize runtime enforcement over more prompt text.

Recommended build order:

1. Add mission classification and goal contract creation.
2. Add external-goal response-end watchdog.
3. Add heartbeat active-goal continuation.
4. Add no-false-done guard.
5. Add retry `what_changed` enforcement.
6. Add permission boundary state.
7. Add revenue sprint benchmark and fixture logs.
8. Surface all of this in `/ui` as an evidence-based execution trace.

## Definition of Success

Goal Engine succeeds when a user can give only an outcome and the system can:

- compile the goal
- choose a path
- act in the real world
- stop at permission boundaries without surrendering the task
- record attempts
- learn from failure
- change strategy
- continue through heartbeat
- recover across sessions
- require evidence before claiming completion

That is the difference between a chat assistant with logs and an autonomous goal-control layer.
