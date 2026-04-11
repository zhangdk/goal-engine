import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

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

/**
 * 将 schema.sql 应用到给定数据库实例。
 * 用于生产初始化和测试内存数据库共享同一 schema。
 */
export function applySchema(db: Database.Database): void {
  const sql = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
  db.exec(sql);
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
