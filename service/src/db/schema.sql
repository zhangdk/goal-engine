-- Goal Engine v0 SQLite Schema
-- 外键在 client.ts 中通过 PRAGMA foreign_keys = ON 启用

CREATE TABLE IF NOT EXISTS agents (
  id               TEXT PRIMARY KEY,
  display_name     TEXT,
  created_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS goals (
  id               TEXT PRIMARY KEY,
  agent_id         TEXT NOT NULL REFERENCES agents(id),
  title            TEXT NOT NULL,
  status           TEXT NOT NULL CHECK(status IN ('active','blocked','completed','abandoned')),
  success_criteria TEXT NOT NULL DEFAULT '[]',  -- JSON string[]
  stop_conditions  TEXT NOT NULL DEFAULT '[]',  -- JSON string[]
  priority         INTEGER NOT NULL DEFAULT 1,
  current_stage    TEXT NOT NULL DEFAULT '',
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  UNIQUE(agent_id, id)
);

-- 每个 Agent 允许一个 active goal
CREATE UNIQUE INDEX IF NOT EXISTS idx_goals_one_active_per_agent
  ON goals(agent_id) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_goals_agent_status
  ON goals(agent_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS attempts (
  id             TEXT PRIMARY KEY,
  agent_id       TEXT NOT NULL REFERENCES agents(id),
  goal_id        TEXT NOT NULL,
  stage          TEXT NOT NULL,
  action_taken   TEXT NOT NULL,
  strategy_tags  TEXT NOT NULL DEFAULT '[]',  -- JSON string[]
  result         TEXT NOT NULL CHECK(result IN ('success','partial','failure')),
  failure_type   TEXT CHECK(failure_type IN (
    'tool_error','capability_gap','strategy_mismatch','external_blocker',
    'resource_limit','validation_fail','stuck_loop','ambiguous_goal'
  )),
  confidence     REAL,
  next_hypothesis TEXT,
  created_at     TEXT NOT NULL,
  -- result=failure 时 failure_type 必须填写
  CHECK(result != 'failure' OR failure_type IS NOT NULL),
  UNIQUE(agent_id, id),
  FOREIGN KEY(agent_id, goal_id) REFERENCES goals(agent_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_attempts_agent_goal_created ON attempts(agent_id, goal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attempts_created_at ON attempts(created_at);

CREATE TABLE IF NOT EXISTS reflections (
  id              TEXT PRIMARY KEY,
  agent_id        TEXT NOT NULL REFERENCES agents(id),
  goal_id         TEXT NOT NULL,
  attempt_id      TEXT NOT NULL,
  summary         TEXT NOT NULL,
  root_cause      TEXT NOT NULL,
  must_change     TEXT NOT NULL,
  avoid_strategy  TEXT,  -- 可选，输出给 policy
  created_at      TEXT NOT NULL,
  UNIQUE(agent_id, attempt_id),
  FOREIGN KEY(agent_id, goal_id) REFERENCES goals(agent_id, id) ON DELETE CASCADE,
  FOREIGN KEY(agent_id, attempt_id) REFERENCES attempts(agent_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_reflections_agent_goal_created
  ON reflections(agent_id, goal_id, created_at DESC);

CREATE TABLE IF NOT EXISTS knowledge (
  id                    TEXT PRIMARY KEY,
  agent_id              TEXT NOT NULL REFERENCES agents(id),
  goal_id               TEXT NOT NULL,
  source_attempt_id     TEXT,
  context               TEXT NOT NULL,
  observation           TEXT NOT NULL,
  hypothesis            TEXT NOT NULL,
  implication           TEXT NOT NULL,
  related_strategy_tags TEXT NOT NULL DEFAULT '[]',
  created_at            TEXT NOT NULL,
  UNIQUE(agent_id, id),
  FOREIGN KEY(agent_id, goal_id) REFERENCES goals(agent_id, id) ON DELETE CASCADE,
  FOREIGN KEY(agent_id, source_attempt_id) REFERENCES attempts(agent_id, id)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_agent_goal_created
  ON knowledge(agent_id, goal_id, created_at DESC);

CREATE TABLE IF NOT EXISTS knowledge_promotions (
  id             TEXT PRIMARY KEY,
  knowledge_id   TEXT NOT NULL,
  visibility     TEXT NOT NULL CHECK(visibility IN ('private', 'agent', 'global')),
  agent_id       TEXT,
  subject        TEXT NOT NULL,
  condition      TEXT NOT NULL DEFAULT '{}',
  summary        TEXT NOT NULL,
  recommendation TEXT NOT NULL,
  confidence     REAL NOT NULL DEFAULT 0.5 CHECK(confidence >= 0 AND confidence <= 1),
  support_count  INTEGER NOT NULL DEFAULT 1 CHECK(support_count >= 1),
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  CHECK(
    (visibility = 'global' AND agent_id IS NULL)
    OR
    (visibility IN ('private', 'agent') AND agent_id IS NOT NULL)
  ),
  FOREIGN KEY(knowledge_id) REFERENCES knowledge(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_knowledge_promotions_visibility_subject
  ON knowledge_promotions(visibility, subject);

CREATE INDEX IF NOT EXISTS idx_knowledge_promotions_agent
  ON knowledge_promotions(agent_id, visibility);

CREATE TABLE IF NOT EXISTS policies (
  id                    TEXT PRIMARY KEY,
  agent_id              TEXT NOT NULL REFERENCES agents(id),
  goal_id               TEXT NOT NULL,
  preferred_next_step   TEXT,
  avoid_strategies      TEXT NOT NULL DEFAULT '[]',     -- JSON string[]
  must_check_before_retry TEXT NOT NULL DEFAULT '[]',   -- JSON string[]
  updated_at            TEXT NOT NULL,
  UNIQUE(agent_id, goal_id),
  FOREIGN KEY(agent_id, goal_id) REFERENCES goals(agent_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS retry_check_events (
  id                  TEXT PRIMARY KEY,
  agent_id            TEXT NOT NULL REFERENCES agents(id),
  goal_id             TEXT NOT NULL,
  planned_action      TEXT NOT NULL,
  what_changed        TEXT NOT NULL DEFAULT '',
  strategy_tags       TEXT NOT NULL DEFAULT '[]',
  policy_acknowledged INTEGER NOT NULL CHECK(policy_acknowledged IN (0, 1)),
  allowed             INTEGER NOT NULL CHECK(allowed IN (0, 1)),
  reason              TEXT NOT NULL CHECK(reason IN (
    'allowed',
    'policy_not_acknowledged',
    'blocked_strategy_overlap',
    'no_meaningful_change',
    'repeated_failure_without_downgrade'
  )),
  warnings            TEXT NOT NULL DEFAULT '[]',
  tag_overlap_rate    REAL,
  created_at          TEXT NOT NULL,
  FOREIGN KEY(agent_id, goal_id) REFERENCES goals(agent_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_retry_check_events_agent_goal_created_at
  ON retry_check_events(agent_id, goal_id, created_at DESC);

CREATE TABLE IF NOT EXISTS knowledge_reference_events (
  id                    TEXT PRIMARY KEY,
  agent_id              TEXT NOT NULL REFERENCES agents(id),
  goal_id               TEXT NOT NULL,
  retry_check_event_id  TEXT,
  knowledge_ids         TEXT NOT NULL DEFAULT '[]',
  promotion_ids         TEXT NOT NULL DEFAULT '[]',
  decision_surface      TEXT NOT NULL CHECK(decision_surface IN ('recovery_packet', 'retry_guard')),
  created_at            TEXT NOT NULL,
  FOREIGN KEY(agent_id, goal_id) REFERENCES goals(agent_id, id) ON DELETE CASCADE,
  FOREIGN KEY(retry_check_event_id) REFERENCES retry_check_events(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_knowledge_reference_events_agent_goal_created
  ON knowledge_reference_events(agent_id, goal_id, created_at DESC);

CREATE TABLE IF NOT EXISTS recovery_events (
  id            TEXT PRIMARY KEY,
  agent_id      TEXT NOT NULL REFERENCES agents(id),
  goal_id       TEXT NOT NULL,
  goal_title    TEXT NOT NULL,
  current_stage TEXT NOT NULL,
  summary       TEXT NOT NULL,
  source        TEXT NOT NULL CHECK(source IN ('service', 'projection')),
  created_at    TEXT NOT NULL,
  FOREIGN KEY(agent_id, goal_id) REFERENCES goals(agent_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_recovery_events_agent_goal_created_at
  ON recovery_events(agent_id, goal_id, created_at DESC);

CREATE TABLE IF NOT EXISTS goal_agent_assignments (
  id                TEXT PRIMARY KEY,
  goal_id           TEXT NOT NULL REFERENCES goals(id),
  agent_id          TEXT NOT NULL,
  agent_name        TEXT NOT NULL,
  workspace         TEXT NOT NULL,
  session           TEXT NOT NULL,
  assignment_reason TEXT NOT NULL CHECK(assignment_reason IN ('goal_started', 'runtime_switch', 'session_rollover')),
  assigned_at       TEXT NOT NULL,
  released_at       TEXT
);

CREATE INDEX IF NOT EXISTS idx_goal_agent_assignments_goal_id_assigned_at
  ON goal_agent_assignments(goal_id, assigned_at DESC);

CREATE INDEX IF NOT EXISTS idx_goal_agent_assignments_agent_id_assigned_at
  ON goal_agent_assignments(agent_id, assigned_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_goal_agent_assignments_one_open_per_goal
  ON goal_agent_assignments(goal_id)
  WHERE released_at IS NULL;
