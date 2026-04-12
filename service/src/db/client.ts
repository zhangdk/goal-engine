import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DEFAULT_AGENT_ID } from '../agent-context.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GOAL_AGENT_ASSIGNMENTS_ALLOWED_REASONS = ['goal_started', 'runtime_switch', 'session_rollover'] as const;
const GOAL_AGENT_ASSIGNMENTS_TABLE_SQL = `
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
);`;
const GOAL_AGENT_ASSIGNMENTS_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS idx_goal_agent_assignments_goal_id_assigned_at
  ON goal_agent_assignments(goal_id, assigned_at DESC);
CREATE INDEX IF NOT EXISTS idx_goal_agent_assignments_agent_id_assigned_at
  ON goal_agent_assignments(agent_id, assigned_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_goal_agent_assignments_one_open_per_goal
  ON goal_agent_assignments(goal_id)
  WHERE released_at IS NULL;`;
const ATTEMPTS_TABLE_SQL = `
CREATE TABLE attempts (
  id             TEXT PRIMARY KEY,
  agent_id       TEXT NOT NULL REFERENCES agents(id),
  goal_id        TEXT NOT NULL,
  stage          TEXT NOT NULL,
  action_taken   TEXT NOT NULL,
  strategy_tags  TEXT NOT NULL DEFAULT '[]',
  result         TEXT NOT NULL CHECK(result IN ('success','partial','failure')),
  failure_type   TEXT CHECK(failure_type IN (
    'tool_error','capability_gap','strategy_mismatch','external_blocker',
    'resource_limit','validation_fail','stuck_loop','ambiguous_goal'
  )),
  confidence     REAL,
  next_hypothesis TEXT,
  created_at     TEXT NOT NULL,
  CHECK(result != 'failure' OR failure_type IS NOT NULL),
  UNIQUE(agent_id, id),
  FOREIGN KEY(agent_id, goal_id) REFERENCES goals(agent_id, id) ON DELETE CASCADE
);`;
const REFLECTIONS_TABLE_SQL = `
CREATE TABLE reflections (
  id              TEXT PRIMARY KEY,
  agent_id        TEXT NOT NULL REFERENCES agents(id),
  goal_id         TEXT NOT NULL,
  attempt_id      TEXT NOT NULL,
  summary         TEXT NOT NULL,
  root_cause      TEXT NOT NULL,
  must_change     TEXT NOT NULL,
  avoid_strategy  TEXT,
  created_at      TEXT NOT NULL,
  UNIQUE(agent_id, attempt_id),
  FOREIGN KEY(agent_id, goal_id) REFERENCES goals(agent_id, id) ON DELETE CASCADE,
  FOREIGN KEY(agent_id, attempt_id) REFERENCES attempts(agent_id, id) ON DELETE CASCADE
);`;
const POLICIES_TABLE_SQL = `
CREATE TABLE policies (
  id                    TEXT PRIMARY KEY,
  agent_id              TEXT NOT NULL REFERENCES agents(id),
  goal_id               TEXT NOT NULL,
  preferred_next_step   TEXT,
  avoid_strategies      TEXT NOT NULL DEFAULT '[]',
  must_check_before_retry TEXT NOT NULL DEFAULT '[]',
  updated_at            TEXT NOT NULL,
  UNIQUE(agent_id, goal_id),
  FOREIGN KEY(agent_id, goal_id) REFERENCES goals(agent_id, id) ON DELETE CASCADE
);`;
const RETRY_CHECK_EVENTS_TABLE_SQL = `
CREATE TABLE retry_check_events (
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
);`;
const RECOVERY_EVENTS_TABLE_SQL = `
CREATE TABLE recovery_events (
  id            TEXT PRIMARY KEY,
  agent_id      TEXT NOT NULL REFERENCES agents(id),
  goal_id       TEXT NOT NULL,
  goal_title    TEXT NOT NULL,
  current_stage TEXT NOT NULL,
  summary       TEXT NOT NULL,
  source        TEXT NOT NULL CHECK(source IN ('service', 'projection')),
  created_at    TEXT NOT NULL,
  FOREIGN KEY(agent_id, goal_id) REFERENCES goals(agent_id, id) ON DELETE CASCADE
);`;

function migrateGoalAgentAssignmentsIfNeeded(db: Database.Database): void {
  const row = db.prepare(
    `SELECT sql
     FROM sqlite_master
     WHERE type = 'table' AND name = 'goal_agent_assignments'`
  ).get() as { sql?: string } | undefined;

  if (!row?.sql) {
    return;
  }

  const normalizedSql = row.sql.replace(/\s+/g, ' ');
  const hasLatestConstraint = GOAL_AGENT_ASSIGNMENTS_ALLOWED_REASONS.every((reason) =>
    normalizedSql.includes(`'${reason}'`)
  );

  if (hasLatestConstraint) {
    return;
  }

  const migrate = db.transaction(() => {
    db.exec(`
DROP INDEX IF EXISTS idx_goal_agent_assignments_goal_id_assigned_at;
DROP INDEX IF EXISTS idx_goal_agent_assignments_agent_id_assigned_at;
DROP INDEX IF EXISTS idx_goal_agent_assignments_one_open_per_goal;
ALTER TABLE goal_agent_assignments RENAME TO goal_agent_assignments_legacy;
${GOAL_AGENT_ASSIGNMENTS_TABLE_SQL}
INSERT INTO goal_agent_assignments (
  id,
  goal_id,
  agent_id,
  agent_name,
  workspace,
  session,
  assignment_reason,
  assigned_at,
  released_at
)
SELECT
  id,
  goal_id,
  agent_id,
  agent_name,
  workspace,
  session,
  assignment_reason,
  assigned_at,
  released_at
FROM goal_agent_assignments_legacy;
DROP TABLE goal_agent_assignments_legacy;
${GOAL_AGENT_ASSIGNMENTS_INDEX_SQL}
`);
  });

  migrate();
}

function tableColumns(db: Database.Database, table: string): Set<string> {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return new Set(rows.map((row) => row.name));
}

function tableExists(db: Database.Database, table: string): boolean {
  const row = db.prepare(
    `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`
  ).get(table) as { 1: number } | undefined;
  return row !== undefined;
}

function foreignKeyCount(db: Database.Database, table: string): number {
  return (db.prepare(`PRAGMA foreign_key_list(${table})`).all() as unknown[]).length;
}

function ensureAgentsTable(db: Database.Database): void {
  db.exec(`
CREATE TABLE IF NOT EXISTS agents (
  id               TEXT PRIMARY KEY,
  display_name     TEXT,
  created_at       TEXT NOT NULL
);
`);
}

function ensureDefaultAgent(db: Database.Database): void {
  ensureAgentsTable(db);
  db.prepare(
    `INSERT OR IGNORE INTO agents (id, display_name, created_at)
     VALUES (?, ?, ?)`
  ).run(DEFAULT_AGENT_ID, DEFAULT_AGENT_ID, new Date().toISOString());
}

function addAgentIdColumnIfMissing(db: Database.Database, table: string): void {
  if (!tableExists(db, table)) {
    return;
  }

  const columns = tableColumns(db, table);
  if (columns.has('agent_id')) {
    return;
  }

  db.prepare(
    `ALTER TABLE ${table}
     ADD COLUMN agent_id TEXT NOT NULL DEFAULT '${DEFAULT_AGENT_ID}'`
  ).run();
}

function migrateAgentIsolationColumnsIfNeeded(db: Database.Database): void {
  ensureDefaultAgent(db);
  for (const table of ['goals', 'attempts', 'reflections', 'policies', 'retry_check_events', 'recovery_events']) {
    addAgentIdColumnIfMissing(db, table);
  }
}

function migrateAgentIsolationIndexesIfNeeded(db: Database.Database): void {
  db.exec(`
DROP INDEX IF EXISTS idx_goals_single_active;
CREATE UNIQUE INDEX IF NOT EXISTS idx_goals_agent_id_id
  ON goals(agent_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_goals_one_active_per_agent
  ON goals(agent_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_goals_agent_status
  ON goals(agent_id, status, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_attempts_agent_id_id
  ON attempts(agent_id, id);
CREATE INDEX IF NOT EXISTS idx_attempts_agent_goal_created
  ON attempts(agent_id, goal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reflections_agent_goal_created
  ON reflections(agent_id, goal_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_policies_agent_goal
  ON policies(agent_id, goal_id);
CREATE INDEX IF NOT EXISTS idx_retry_check_events_agent_goal_created_at
  ON retry_check_events(agent_id, goal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recovery_events_agent_goal_created_at
  ON recovery_events(agent_id, goal_id, created_at DESC);
`);
}

function migrateAttemptsCompositeForeignKeyIfNeeded(db: Database.Database): void {
  if (!tableExists(db, 'attempts') || foreignKeyCount(db, 'attempts') > 0) {
    return;
  }

  const columns = tableColumns(db, 'attempts');
  const hasRequiredColumns = [
    'id',
    'agent_id',
    'goal_id',
    'stage',
    'action_taken',
    'strategy_tags',
    'result',
    'failure_type',
    'confidence',
    'next_hypothesis',
    'created_at',
  ].every((column) => columns.has(column));
  if (!hasRequiredColumns) {
    return;
  }

  db.exec(`
CREATE UNIQUE INDEX IF NOT EXISTS idx_goals_agent_id_id
  ON goals(agent_id, id);
DROP INDEX IF EXISTS idx_attempts_agent_goal_created;
DROP INDEX IF EXISTS idx_attempts_created_at;
ALTER TABLE attempts RENAME TO attempts_legacy;
${ATTEMPTS_TABLE_SQL}
INSERT INTO attempts (
  id,
  agent_id,
  goal_id,
  stage,
  action_taken,
  strategy_tags,
  result,
  failure_type,
  confidence,
  next_hypothesis,
  created_at
)
SELECT
  id,
  agent_id,
  goal_id,
  stage,
  action_taken,
  strategy_tags,
  result,
  failure_type,
  confidence,
  next_hypothesis,
  created_at
FROM attempts_legacy;
DROP TABLE attempts_legacy;
CREATE INDEX IF NOT EXISTS idx_attempts_agent_goal_created
  ON attempts(agent_id, goal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attempts_created_at
  ON attempts(created_at);
`);
}

function migrateReflectionsCompositeForeignKeyIfNeeded(db: Database.Database): void {
  if (!tableExists(db, 'reflections') || foreignKeyCount(db, 'reflections') > 0) {
    return;
  }

  const columns = tableColumns(db, 'reflections');
  const hasRequiredColumns = [
    'id',
    'agent_id',
    'goal_id',
    'attempt_id',
    'summary',
    'root_cause',
    'must_change',
    'avoid_strategy',
    'created_at',
  ].every((column) => columns.has(column));
  if (!hasRequiredColumns) {
    return;
  }

  db.exec(`
DROP INDEX IF EXISTS idx_reflections_agent_goal_created;
ALTER TABLE reflections RENAME TO reflections_legacy;
${REFLECTIONS_TABLE_SQL}
INSERT INTO reflections (
  id,
  agent_id,
  goal_id,
  attempt_id,
  summary,
  root_cause,
  must_change,
  avoid_strategy,
  created_at
)
SELECT
  id,
  agent_id,
  goal_id,
  attempt_id,
  summary,
  root_cause,
  must_change,
  avoid_strategy,
  created_at
FROM reflections_legacy;
DROP TABLE reflections_legacy;
CREATE INDEX IF NOT EXISTS idx_reflections_agent_goal_created
  ON reflections(agent_id, goal_id, created_at DESC);
`);
}

function migratePoliciesCompositeForeignKeyIfNeeded(db: Database.Database): void {
  if (!tableExists(db, 'policies') || foreignKeyCount(db, 'policies') > 0) {
    return;
  }

  const columns = tableColumns(db, 'policies');
  const hasRequiredColumns = [
    'id',
    'agent_id',
    'goal_id',
    'preferred_next_step',
    'avoid_strategies',
    'must_check_before_retry',
    'updated_at',
  ].every((column) => columns.has(column));
  if (!hasRequiredColumns) {
    return;
  }

  db.exec(`
DROP INDEX IF EXISTS idx_policies_agent_goal;
ALTER TABLE policies RENAME TO policies_legacy;
${POLICIES_TABLE_SQL}
INSERT INTO policies (
  id,
  agent_id,
  goal_id,
  preferred_next_step,
  avoid_strategies,
  must_check_before_retry,
  updated_at
)
SELECT
  id,
  agent_id,
  goal_id,
  preferred_next_step,
  avoid_strategies,
  must_check_before_retry,
  updated_at
FROM policies_legacy;
DROP TABLE policies_legacy;
`);
}

function migrateRetryCheckEventsCompositeForeignKeyIfNeeded(db: Database.Database): void {
  if (!tableExists(db, 'retry_check_events') || foreignKeyCount(db, 'retry_check_events') > 0) {
    return;
  }

  const columns = tableColumns(db, 'retry_check_events');
  const hasRequiredColumns = [
    'id',
    'agent_id',
    'goal_id',
    'planned_action',
    'what_changed',
    'strategy_tags',
    'policy_acknowledged',
    'allowed',
    'reason',
    'warnings',
    'tag_overlap_rate',
    'created_at',
  ].every((column) => columns.has(column));
  if (!hasRequiredColumns) {
    return;
  }

  db.exec(`
DROP INDEX IF EXISTS idx_retry_check_events_agent_goal_created_at;
ALTER TABLE retry_check_events RENAME TO retry_check_events_legacy;
${RETRY_CHECK_EVENTS_TABLE_SQL}
INSERT INTO retry_check_events (
  id,
  agent_id,
  goal_id,
  planned_action,
  what_changed,
  strategy_tags,
  policy_acknowledged,
  allowed,
  reason,
  warnings,
  tag_overlap_rate,
  created_at
)
SELECT
  id,
  agent_id,
  goal_id,
  planned_action,
  what_changed,
  strategy_tags,
  policy_acknowledged,
  allowed,
  reason,
  warnings,
  tag_overlap_rate,
  created_at
FROM retry_check_events_legacy;
DROP TABLE retry_check_events_legacy;
CREATE INDEX IF NOT EXISTS idx_retry_check_events_agent_goal_created_at
  ON retry_check_events(agent_id, goal_id, created_at DESC);
`);
}

function migrateRecoveryEventsCompositeForeignKeyIfNeeded(db: Database.Database): void {
  if (!tableExists(db, 'recovery_events') || foreignKeyCount(db, 'recovery_events') > 0) {
    return;
  }

  const columns = tableColumns(db, 'recovery_events');
  const hasRequiredColumns = [
    'id',
    'agent_id',
    'goal_id',
    'goal_title',
    'current_stage',
    'summary',
    'source',
    'created_at',
  ].every((column) => columns.has(column));
  if (!hasRequiredColumns) {
    return;
  }

  db.exec(`
DROP INDEX IF EXISTS idx_recovery_events_agent_goal_created_at;
ALTER TABLE recovery_events RENAME TO recovery_events_legacy;
${RECOVERY_EVENTS_TABLE_SQL}
INSERT INTO recovery_events (
  id,
  agent_id,
  goal_id,
  goal_title,
  current_stage,
  summary,
  source,
  created_at
)
SELECT
  id,
  agent_id,
  goal_id,
  goal_title,
  current_stage,
  summary,
  source,
  created_at
FROM recovery_events_legacy;
DROP TABLE recovery_events_legacy;
CREATE INDEX IF NOT EXISTS idx_recovery_events_agent_goal_created_at
  ON recovery_events(agent_id, goal_id, created_at DESC);
`);
}

/**
 * 将 schema.sql 应用到给定数据库实例。
 * 用于生产初始化和测试内存数据库共享同一 schema。
 */
export function applySchema(db: Database.Database): void {
  const sql = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
  migrateAgentIsolationColumnsIfNeeded(db);
  migrateAttemptsCompositeForeignKeyIfNeeded(db);
  migrateReflectionsCompositeForeignKeyIfNeeded(db);
  migratePoliciesCompositeForeignKeyIfNeeded(db);
  migrateRetryCheckEventsCompositeForeignKeyIfNeeded(db);
  migrateRecoveryEventsCompositeForeignKeyIfNeeded(db);
  db.exec(sql);
  migrateAgentIsolationIndexesIfNeeded(db);
  migrateGoalAgentAssignmentsIfNeeded(db);
}

/**
 * 创建一个生产用文件数据库，并应用 schema。
 */
export function createDb(path: string): Database.Database {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  applySchema(db);
  return db;
}
