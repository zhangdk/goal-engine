-- Goal Engine v0 SQLite Schema
-- 外键在 client.ts 中通过 PRAGMA foreign_keys = ON 启用

CREATE TABLE IF NOT EXISTS goals (
  id               TEXT PRIMARY KEY,
  title            TEXT NOT NULL,
  status           TEXT NOT NULL CHECK(status IN ('active','blocked','completed','abandoned')),
  success_criteria TEXT NOT NULL DEFAULT '[]',  -- JSON string[]
  stop_conditions  TEXT NOT NULL DEFAULT '[]',  -- JSON string[]
  priority         INTEGER NOT NULL DEFAULT 1,
  current_stage    TEXT NOT NULL DEFAULT '',
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);

-- v0 只允许一个 active goal
CREATE UNIQUE INDEX IF NOT EXISTS idx_goals_single_active
  ON goals(status) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS attempts (
  id             TEXT PRIMARY KEY,
  goal_id        TEXT NOT NULL REFERENCES goals(id),
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
  CHECK(result != 'failure' OR failure_type IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_attempts_goal_id ON attempts(goal_id);
CREATE INDEX IF NOT EXISTS idx_attempts_created_at ON attempts(created_at);

CREATE TABLE IF NOT EXISTS reflections (
  id              TEXT PRIMARY KEY,
  goal_id         TEXT NOT NULL REFERENCES goals(id),
  attempt_id      TEXT NOT NULL UNIQUE REFERENCES attempts(id),  -- 一次失败最多一条 reflection
  summary         TEXT NOT NULL,
  root_cause      TEXT NOT NULL,
  must_change     TEXT NOT NULL,
  avoid_strategy  TEXT,  -- 可选，输出给 policy
  created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reflections_goal_id ON reflections(goal_id);

CREATE TABLE IF NOT EXISTS policies (
  id                    TEXT PRIMARY KEY,
  goal_id               TEXT NOT NULL UNIQUE REFERENCES goals(id),  -- 一个 goal 只有一条当前 policy
  preferred_next_step   TEXT,
  avoid_strategies      TEXT NOT NULL DEFAULT '[]',     -- JSON string[]
  must_check_before_retry TEXT NOT NULL DEFAULT '[]',   -- JSON string[]
  updated_at            TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS retry_check_events (
  id                  TEXT PRIMARY KEY,
  goal_id             TEXT NOT NULL REFERENCES goals(id),
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
  created_at          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_retry_check_events_goal_id_created_at
  ON retry_check_events(goal_id, created_at DESC);

CREATE TABLE IF NOT EXISTS recovery_events (
  id            TEXT PRIMARY KEY,
  goal_id       TEXT NOT NULL REFERENCES goals(id),
  goal_title    TEXT NOT NULL,
  current_stage TEXT NOT NULL,
  summary       TEXT NOT NULL,
  source        TEXT NOT NULL CHECK(source IN ('service', 'projection')),
  created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_recovery_events_goal_id_created_at
  ON recovery_events(goal_id, created_at DESC);

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
