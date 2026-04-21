# Goal Engine Docs-to-Implementation Matrix

> Status: working alignment matrix  
> Updated: 2026-04-21  
> Purpose: map the current documentation spine to what is already implemented, partially implemented, or still missing in the codebase.

---

## 1. Why this document exists

The product documents now describe Goal Engine as a continuous evolution engine, not only a long-horizon control layer.

That is the right direction, but a direction alone is not enough for planning or review. This matrix exists to answer one harder question:

**Which parts of that direction are already present in the code, and which parts still exist only in the docs?**

This document should be read together with:

- `goal-engine-prd.md`
- `goal-engine-evolution-roadmap.md`
- `goal-engine-continuous-improvement-index.md`

---

## 2. Reading guide

Statuses in this matrix mean:

- **Implemented**: already represented in types, service behavior, adapter behavior, or UI-facing output
- **Partial**: the concept exists, but the product behavior is incomplete or weaker than the docs describe
- **Missing**: the concept is documented but not yet represented as a first-class runtime capability

---

## 3. Product-object alignment

| Object / capability | Documentation expectation | Current implementation status | Evidence in code | Gap summary |
| --- | --- | --- | --- | --- |
| `Goal` | Durable long-horizon target | Implemented | `shared/types.ts` defines `Goal` and service/UI flows use active goals | Basic object exists and is already central |
| `Goal Contract` | First-class executable goal contract | Implemented | `shared/types.ts` defines `GoalContract`; adapter recovery path reads contract; dispatch and supervision workflows rely on it | Present as a durable fact source |
| `Attempt` | Execution record for what actually happened | Implemented | `shared/types.ts` defines `Attempt`; attempts can now carry optional `experimentId` / `experiment_id` linkage | Present and can be tied to the active experiment without breaking legacy clients |
| `Evidence` / `AttemptEvidence` | First-class verifiable evidence object | Implemented | `shared/types.ts` defines `AttemptEvidence`; `dispatch-entrypoint.ts` supports `record evidence`; completion references evidence ids | This is one of the strongest completed slices |
| `GoalCompletion` | Completion judged against evidence | Implemented | `shared/types.ts` defines `GoalCompletion`; `dispatch-entrypoint.ts` requires `evidenceIds` for completion | Matches the fact-foundation direction |
| `Reflection` | Structured post-attempt learning input | Implemented | `shared/types.ts` defines `Reflection`; failure handling writes back reflections through workflow paths | Present, but current reflection depth is still limited |
| `Policy` | Current-goal guard plus next-step guidance | Partial | `shared/types.ts` defines `Policy`; retry guard and recovery packet expose preferred next step and must-check items | Works as a guard/guidance layer, not yet as a full replanner |
| `Knowledge` / shared wisdom | Reusable learning carried into recovery and retry surfaces | Partial | `shared/types.ts` defines `Knowledge` and `KnowledgePromotion`; `recovery-packet-get.ts` maps `relevantKnowledge` and `sharedWisdom` | Exists, but still not a full learning lifecycle |
| `Experiment` | First-class bounded experiment and unit of progress | Implemented | `shared/types.ts`, `service/src/db/schema.sql`, `service/src/repos/experiment.repo.ts`, `service/src/routes/experiments.ts`, recovery/UI surfaces, adapter tools, workflows, and projections | Batch 1 runtime foundation is landed; future batches still need next-experiment recommendation and richer lifecycle learning |
| `CapabilityGap` | Durable backlog of repeated capability blockers | Missing | No first-class `CapabilityGap` type in `shared/types.ts`; no backlog surface in inspected adapter paths | Improvement index accepts this direction, but runtime has not landed it |
| `Recovery State` | Compressed control state for resuming a goal | Partial | `RecoveryPacket` exists in `shared/types.ts`; `recovery-packet-get.ts` maps recovery state and `activeExperiment` from service | Recovery now includes active experiment state, but full evolution-state recovery remains future work |

---

## 4. Runtime-loop alignment

### 4.1 Goal -> Goal Contract

**Status:** Implemented

Current support:

- Goal creation and external-goal supervision compile user intent into structured goal state
- contract data is persisted and surfaced through recovery

Why that matters:

- the product no longer depends only on raw task text

### 4.2 Goal Contract -> Experiment

**Status:** Implemented

Current reality:

- the engine can now persist a bounded experiment with hypothesis, expected signal, cost, boundary, and why-different context
- service, recovery, UI, adapter tools, and local projections all surface active experiment state

Gap:

- policy-driven next-experiment recommendation is still a Batch 3 concern

### 4.3 Experiment -> Attempt

**Status:** Implemented

Current reality:

- attempts exist
- experiments exist
- attempts can link to experiments through optional `experiment_id`

Gap:

- attempt linkage is available; richer experiment-level evidence aggregation remains future work

### 4.4 Attempt -> Evidence

**Status:** Implemented

Current support:

- the adapter can write evidence explicitly
- completion requires evidence ids

Why that matters:

- this is the strongest protection against false progress claims

### 4.5 Evidence -> Reflection

**Status:** Partial

Current support:

- the failure path writes structured reflection inputs

Gap:

- reflection exists, but the current product still behaves closer to structured failure summary than a rich causal learning loop

### 4.6 Reflection -> Learning / Policy

**Status:** Partial

Current support:

- `Knowledge`, `KnowledgePromotion`, and policy hints are already part of the type surface
- recovery and retry can expose some knowledge context and advisories

Gap:

- no explicit learning lifecycle
- policy is still lightweight compared with the PRD target

### 4.7 Learning / Policy -> Retry / Recovery

**Status:** Partial

Current support:

- `check-retry-and-explain.ts` exposes human-readable retry reasoning
- `RecoveryPacket` exposes current policy, recent attempts, and knowledge context

Gap:

- retry delta is still comparatively thin
- recovery does not yet represent the full evolution state described in the new docs

### 4.8 Retry / Recovery -> Next Experiment

**Status:** Missing

Current reality:

- retry guard can block repetition
- recovery can restore context

Gap:

- there is still no explicit "next experiment" orchestration layer
- policy does not yet function as a first-class replanner

---

## 5. Improvement-index alignment

This section maps the major accepted improvement directions to the current code state.

| Improvement area | Current status | Notes |
| --- | --- | --- |
| Persisted `GoalContract` | Implemented | Already part of the shared type system and recovery surface |
| First-class `Experiment` | Implemented | Shared type, schema, repo, routes, recovery/UI, adapter tools, workflows, and projections are landed |
| First-class `AttemptEvidence` | Implemented | One of the clearest completed improvements |
| Evidence-backed completion | Implemented | Completion now references service-side evidence ids |
| Learning lifecycle fields | Partial | Knowledge exists, lifecycle does not |
| Capability-gap backlog | Missing | Still an accepted direction, not a landed product object |
| Structured retry delta | Partial | Retry has `whatChanged`, evidence intent, and policy ack; not yet a richer structured delta object |
| Control events | Partial | Some decision surfaces exist, but not yet as a full machine-readable control-event layer |
| Lifecycle events | Partial | Product has runtime/recovery/retry artifacts, but not yet a clean, unified lifecycle event model |
| Recovery as runtime state | Partial | Recovery packet exists and matters; richer state packaging remains future work |
| Cross-platform goal memory direction | Partial | The docs define the direction; current code remains mostly OpenClaw-centered |

---

## 6. Strategic conclusion

The codebase has already completed the hardest part of becoming more than a prompt wrapper:

- durable goal facts
- evidence-backed progress
- retry guard
- recovery surface

That is meaningful progress.

But the codebase has not yet completed the shift from:

**goal control with learning hints**

to:

**experiment-driven continuous evolution**

The main missing pieces are now clear:

1. explicit learning lifecycle
2. capability-gap backlog
3. policy as replanner, not only guard
4. stronger cross-task learning transfer
5. richer evolution-state recovery beyond the active experiment slice

---

## 7. Recommended use of this matrix

Use this document in three ways:

1. **PRD review**
   - check whether a documented concept is already in code or still aspirational
2. **Roadmap sequencing**
   - decide whether the next step belongs to fact foundation, experiment runtime, learning lifecycle, or transfer
3. **Implementation review**
   - reject claims that a capability is "already done" when the matrix still marks it partial or missing

If this matrix drifts from the code, update it alongside product-document changes rather than letting planning and implementation diverge again.
