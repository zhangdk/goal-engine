# Goal Engine Continuous Evolution Implementation Program

> Status: execution program  
> Updated: 2026-04-21  
> Purpose: provide one end-to-end implementation program that turns the current documentation spine into an actionable engineering sequence.

---

## 1. What this program is

This is the execution document that sits below:

- `goal-engine-prd.md`
- `goal-engine-evolution-roadmap.md`
- `goal-engine-docs-to-implementation-matrix.md`
- `goal-engine-priority-backlog.md`

Those documents answer:

- what Goal Engine is
- what it should become
- what is already implemented
- what is most important next

This document answers the next question:

**how to implement the next full slice without falling back into piecemeal work**

It is intentionally program-shaped rather than sprint-shaped. The goal is to let the team review the whole sequence before implementing the first batch.

---

## 2. Current engineering baseline

The codebase already contains a real control-layer foundation.

Reusable pieces already present:

- shared type surface in `shared/types.ts`
- durable service repos under `service/src/repos/`
- routes for goals, attempts, evidence, reflections, retry guard, recovery, knowledge, and UI
- service logic for policy, retry guard, recovery, and knowledge
- adapter tools and workflows for goal start, failure writeback, retry checks, evidence record, completion, and recovery
- UI projection and verdict/timeline surfaces
- a healthy test base across routes, repos, services, and e2e

Concrete reuse points already confirmed:

- `GoalContract` is already durable and reused across service, adapter, and recovery surfaces
- `AttemptEvidence` and evidence-backed completion already form a clean fact path
- retry guard already has both a decision surface and a durable history path
- reflection already fans out into policy and knowledge creation
- recovery is already assembled as a derived view, which is the right place to add active experiment and lifecycle state
- adapter entrypoints are already centralized in `agent-adapter/src/openclaw/dispatch-entrypoint.ts`
- UI detail and timeline surfaces already expose attempts, retry checks, recovery events, knowledge, and verdicts, so they can absorb experiment/lifecycle state without a redesign

That matters because the next implementation slice should extend this structure, not replace it.

The main gap is now structural:

**the code knows how to remember attempts, but it still does not know how to represent bounded experiments as the unit of progress**

That is the pivot this program is designed around.

---

## 3. Program outcome

The target outcome of this program is:

```text
Goal
  -> Goal Contract
  -> Experiment
  -> Attempt
  -> Evidence
  -> Reflection
  -> Learning / Policy
  -> Retry / Recovery
  -> Next Experiment
```

By the end of the planned batches, Goal Engine should be able to:

1. represent the active experiment explicitly
2. distinguish a real new trial from a repeated attempt
3. treat learning as lifecycle-managed state rather than loose notes
4. make policy outputs drive the next bounded move
5. recover not only goal continuity but evolution continuity
6. accumulate repeated capability blockers into a durable backlog

This program does not try to finish the entire future vision at once. It is the shortest honest path from the current product to a real continuous evolution loop.

---

## 4. Program structure

The work is organized into five implementation batches.

### Batch 1: Experiment Runtime Foundation

Status:

- implemented in the experiment runtime foundation slice

Objective:

- make `Experiment` a first-class runtime object

Why first:

- without experiments, the rest of the loop stays rhetorically strong but behaviorally weak

Primary deliverables:

- new `Experiment` type in `shared/types.ts`
- service persistence for experiments
- attempts linked to experiments
- recovery and UI surfaces show active experiment state
- adapter tools, OpenClaw-facing workflows, and local projections expose active experiment context

### Batch 2: Retry and Learning Upgrade

Objective:

- upgrade repetition judgment and learning quality

Primary deliverables:

- structured retry delta
- learning lifecycle fields
- stronger recovery preference for validated/promoted learnings

### Batch 3: Policy as Replanner

Objective:

- turn policy from a guard layer into a next-step orchestration layer

Primary deliverables:

- next-experiment recommendation
- machine-readable path-switch rules
- bounded handling for permission and capability blockers

### Batch 4: Recovery as Evolution State

Objective:

- recover the active evolution loop, not only a task summary

Primary deliverables:

- experiment-aware recovery packet
- lifecycle-aware learning summary
- unresolved blockers and capability gaps in recovery

### Batch 5: System Learning and Cross-Goal Readiness

Objective:

- start making repeated blockers and reusable patterns durable beyond the current goal

Primary deliverables:

- `CapabilityGap` backlog
- control/lifecycle events
- scaffolding for future cross-goal retrieval and evaluation export

---

## 5. Batch 1 in detail: Experiment Runtime Foundation

**Status:** Implemented as of 2026-04-21.

### 5.1 Product behavior change

Before Batch 1:

- a goal has attempts
- retry guard evaluates proposed changes
- recovery can restore goal context

After Batch 1:

- a goal has an active experiment
- attempts belong to a specific experiment
- recovery can tell a new session exactly what is being tested
- UI can show whether the current path is a real experiment or just another attempt thread

### 5.2 Data model changes

Add to `shared/types.ts`:

- `Experiment`
- `ExperimentStatus`
- experiment summary shape for recovery and UI where needed

Suggested shape:

```ts
type ExperimentStatus = 'planned' | 'active' | 'completed' | 'abandoned' | 'blocked';

type Experiment = {
  id: string;
  agentId: string;
  goalId: string;
  stage: string;
  hypothesis: string;
  actionPlan: string;
  expectedSignal: string;
  costLevel: 'low' | 'medium' | 'high';
  boundaryLevel: 'safe' | 'permission_required' | 'blocked';
  whyDifferent: string;
  status: ExperimentStatus;
  createdAt: string;
  updatedAt: string;
};
```

Service schema additions in `service/src/db/schema.sql`:

- `experiments` table
- `attempts.experiment_id` foreign key
- indexes on `(goal_id, status)` and `(goal_id, created_at)`

Repository additions:

- `service/src/repos/experiment.repo.ts`

Repository changes:

- `service/src/repos/attempt.repo.ts` reads/writes optional `experiment_id`
- direct evidence-to-experiment scoping remains a future extension if experiment-level evidence queries need it

### 5.3 API surface changes

Add service routes:

- `POST /api/v1/experiments`
- `GET /api/v1/experiments/:id`
- `GET /api/v1/goals/:goalId/experiments`
- `PATCH /api/v1/experiments/:id`

Update existing routes:

- attempt creation route accepts `experiment_id`
- recovery route includes active experiment
- UI route includes experiment summary

Adapter additions:

- `agent-adapter/src/tools/experiment-create.ts`
- `agent-adapter/src/tools/experiment-get.ts`
- `agent-adapter/src/tools/experiment-update.ts`

Adapter workflow changes:

- `start-goal-session.ts` stays goal-oriented
- `show-goal-status.ts` and `recover-goal-session.ts` surface active experiment state
- `record-failure-and-refresh.ts` preserves experiment linkage on attempts/reflections
- `dispatch-entrypoint.ts` remains the single OpenClaw-facing seam for introducing experiment awareness

Projection changes:

- `agent-adapter/src/projections/refresh-projections.ts`
- local recovery projection includes active experiment summary derived from the recovery packet

### 5.4 UI changes

Likely touch points:

- `service/src/ui/agent-detail.ts`
- `service/src/ui/path-analysis.ts`
- `service/src/ui/verdict.ts`
- `service/src/ui/timeline.ts`

UI additions:

- active experiment card
- attempt grouped under experiment
- explicit display of `whyDifferent` and `expectedSignal`

### 5.5 Test plan

Add:

- repo tests for experiments
- route tests for experiments
- route tests covering attempt-to-experiment linkage
- recovery tests covering active experiment
- UI tests verifying active experiment rendering

Existing suites likely to extend:

- `service/test/routes.attempts.test.ts`
- `service/test/routes.recovery.test.ts`
- `service/test/routes.ui-agents.test.ts`
- `service/test/integration.behavior-loop.test.ts`
- `agent-adapter/test/workflows.test.ts`
- `agent-adapter/test/tools.test.ts`

### 5.6 Batch 1 definition of done

- Done: experiment object exists in shared types, schema, repos, routes, and adapter
- Done: attempts support optional experiment context without breaking legacy clients
- Done: recovery returns active experiment state
- Done: UI shows current experiment context
- Done: projections and OpenClaw-facing workflows surface active experiment state
- Done: tests cover the new object and linkage rules

---

## 6. Batch 2 in detail: Retry and Learning Upgrade

### 6.1 Product behavior change

Before Batch 2:

- retry guard knows `plannedAction`, `whatChanged`, tags, and evidence intent
- knowledge exists, but lifecycle is weak

After Batch 2:

- retry guard judges meaningfully different paths with richer structured input
- the system distinguishes fresh learning from validated learning

### 6.2 Data model changes

Extend `shared/types.ts`:

- `RetryDelta`
- `LearningStatus`
- richer `Knowledge` or adjacent learning record metadata

Suggested retry-delta shape:

```ts
type RetryDelta = {
  changedTool?: string;
  changedChannel?: string;
  changedTarget?: string;
  downgradedScope?: string;
  expectedEvidenceKind?: AttemptEvidenceKind;
  evidenceSource?: string;
  whyDifferent: string;
};
```

This should extend the existing retry event path rather than introduce a second retry object. The clean move is:

- keep `RetryCheckEvent` as the durable retry-decision record
- add structured delta fields to that event
- let the existing retry route, repo, timeline, and agent-detail surfaces expose them

Suggested learning additions:

- `status`
- `source`
- `confidence`
- `suggestedAction`
- `resolution`

Service schema changes:

- add lifecycle/source/confidence fields to knowledge table or a dedicated learning table
- extend retry-history persistence for richer delta fields

Important modeling rule:

- `KnowledgePromotion` should remain the sharing/visibility mechanism
- learning lifecycle should live on the learning itself, not be inferred from promotion

### 6.3 API and workflow changes

Service:

- retry-guard route accepts structured delta fields
- recovery route returns lifecycle-aware learnings
- knowledge endpoints expose lifecycle transitions where needed

Adapter:

- `check-retry-and-explain.ts` accepts and explains structured delta
- `recovery-packet-get.ts` maps lifecycle-aware learning payloads
- projection formatting distinguishes candidate vs validated learning
- runtime entrypoints and UI should keep experiment first, retry delta second, lifecycle third as the rollout order

Services to extend:

- `service/src/services/retry-guard.service.ts`
- `service/src/services/knowledge.service.ts`
- `service/src/services/recovery.service.ts`
- `service/src/services/policy.service.ts`

### 6.4 Test plan

Extend:

- `service/test/retry-guard.service.test.ts`
- `service/test/routes.retry-guard.test.ts`
- `service/test/knowledge.service.test.ts`
- `service/test/routes.knowledge.test.ts`
- `service/test/recovery.service.test.ts`
- `agent-adapter/test/workflows.test.ts`

Definition of done:

- retry guard blocks prose-only changes that do not map to a real structured delta
- recovery and retry surfaces prefer validated/promoted learning over raw candidates

---

## 7. Batch 3 in detail: Policy as Replanner

### 7.1 Product behavior change

Before Batch 3:

- policy mostly warns and lightly guides

After Batch 3:

- policy can recommend the next bounded experiment
- policy can explicitly say when to switch variable, downgrade scope, stop, or request permission

### 7.2 Data and service changes

Extend `Policy` in `shared/types.ts` with fields such as:

- `nextExperimentRecommendation`
- `switchPathReason`
- `activeBlockers`
- `permissionBoundaryState`
- `recommendedControlAction`

Service logic changes:

- `service/src/services/policy.service.ts`
- `service/src/services/retry-guard.service.ts`
- `service/src/services/recovery.service.ts`

Possible route impact:

- policies route returns richer machine-readable output
- recovery route includes replanning recommendations

### 7.3 UI changes

UI should show:

- current policy recommendation
- why the path should switch
- whether the blocker is environmental, capability-based, or permission-based

### 7.4 Test plan

Add or extend tests proving:

- repeated low-information failures cause a change in policy recommendation
- permission-boundary cases produce explicit control guidance
- policy output is no longer only prose

Definition of done:

- after repeated blocked attempts, the service recommends a materially different bounded next move

---

## 8. Batch 4 in detail: Recovery as Evolution State

### 8.1 Product behavior change

Before Batch 4:

- recovery answers "what goal am I on?"

After Batch 4:

- recovery answers "what was I testing, what did I learn, what is still blocked, and what should happen next?"

### 8.2 Recovery packet changes

Extend `RecoveryPacket` with:

- active experiment summary
- lifecycle-segmented learnings
- unresolved blockers
- capability-gap references
- required next control action

Adapter changes:

- `agent-adapter/src/tools/recovery-packet-get.ts`
- `agent-adapter/src/workflows/recover-goal-session.ts`
- projection refresh to include compact evolution state

Service changes:

- `service/src/services/recovery.service.ts`
- `service/src/routes/recovery.ts`

Definition of done:

- a fresh session can resume the evolution loop without reconstructing it from chat

---

## 9. Batch 5 in detail: System Learning and Cross-Goal Readiness

### 9.1 Capability-gap backlog

Add:

- `CapabilityGap` type
- persistence and route surface
- generation path from repeated blocker patterns

Likely service touch points:

- `service/src/services/knowledge.service.ts`
- `service/src/services/policy.service.ts`
- new repo and route files

### 9.2 Control and lifecycle events

Add machine-readable events for:

- goal started
- experiment created
- attempt recorded
- evidence recorded
- retry checked
- recovery generated
- goal completed
- protocol violation detected

Why:

- improves auditability, UI clarity, and later export/evaluation support

### 9.3 Cross-goal readiness

Do not fully solve transfer here.

Instead, make later transfer possible by:

- normalizing event and learning state
- keeping recovery compact and queryable
- avoiding ad hoc one-off learning formats

Definition of done:

- repeated blockers can become durable platform backlog inputs
- later cross-goal retrieval has a stable substrate to build on

---

## 10. Code ownership map for implementation

This is the cleanest write-scope split for the next execution round.

Rollout order confirmed by both service-side and adapter/UI inspection:

1. `Experiment`
2. structured retry delta
3. experiment-aware recovery and projection
4. learning lifecycle
5. policy/verdict semantic upgrade

### Shared contract layer

Files:

- `shared/types.ts`
- `shared/runtime.d.ts`

Owns:

- new first-class objects
- shape contracts between service and adapter

### Service data layer

Files:

- `service/src/db/schema.sql`
- `service/src/repos/*`

Owns:

- persistence
- migrations
- query boundaries

### Service behavior layer

Files:

- `service/src/services/*`
- `service/src/routes/*`

Owns:

- retry logic
- policy generation
- recovery assembly
- lifecycle decisions

### Adapter/runtime layer

Files:

- `agent-adapter/src/tools/*`
- `agent-adapter/src/workflows/*`
- `agent-adapter/src/openclaw/*`
- `agent-adapter/src/projections/*`

Owns:

- tool exposure
- OpenClaw-facing entrypoints
- local projection state
- human-readable explanations layered on top of service facts

### UI/observer layer

Files:

- `service/src/ui/*`

Owns:

- making evolution state observable without redefining the facts

---

## 11. Recommended multi-agent execution split

If this program is implemented with multiple sub-agents, the safest split is:

### Worker A: shared + schema + repos

Scope:

- `shared/types.ts`
- `service/src/db/schema.sql`
- `service/src/repos/*`

Best for:

- Batch 1 and Batch 2 structural work

### Worker B: service routes + services

Scope:

- `service/src/routes/*`
- `service/src/services/*`

Best for:

- experiment APIs
- retry/policy/recovery logic

### Worker C: adapter + projections

Scope:

- `agent-adapter/src/tools/*`
- `agent-adapter/src/workflows/*`
- `agent-adapter/src/openclaw/*`
- `agent-adapter/src/projections/*`

Best for:

- mapping new service shapes into runtime entrypoints and projection docs

### Worker D: UI + tests

Scope:

- `service/src/ui/*`
- `service/test/*`
- `agent-adapter/test/*`
- `service/e2e/*`

Best for:

- observer updates
- regression safety

This split keeps write boundaries mostly separate and minimizes merge pressure.

---

## 12. Verification program

Every batch should be verified at four levels:

1. **type level**
   - `pnpm test` or equivalent type/runtime validation for shared contracts
2. **route/service level**
   - targeted Vitest suites for repos, routes, services
3. **adapter/runtime level**
   - adapter workflow/tool tests
4. **observer level**
   - UI and e2e verification where relevant

The minimum verification expectation for each batch is:

- new object has repo coverage
- route behavior has route coverage
- recovery changes have recovery coverage
- retry/policy behavior has service coverage
- any UI-visible change has UI or e2e coverage

---

## 13. What should not be done during this program

Do not mix these into the same implementation wave:

- broad host-runtime takeover ideas
- large product-copy rewrites unrelated to runtime behavior
- new standalone evaluation platform work
- generic memory abstraction layers with no immediate runtime use
- unrelated UI redesigns

Those can all wait. The current bottleneck is the evolution loop, not the story around it.

---

## 14. Final implementation order

The recommended order for actual code execution is:

1. Batch 1: Experiment Runtime Foundation
2. Batch 2: Retry and Learning Upgrade
3. Batch 3: Policy as Replanner
4. Batch 4: Recovery as Evolution State
5. Batch 5: System Learning and Cross-Goal Readiness

If the team wants a first concrete delivery target, start with:

**Batch 1 + the retry-delta part of Batch 2**

That is the smallest honest slice that materially changes runtime behavior while preserving the current fact foundation.
