import Database from 'better-sqlite3';
import { applySchema } from '../src/db/client.js';

/**
 * 为每个测试创建一个干净的内存数据库实例。
 */
export function makeTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  applySchema(db);
  return db;
}

/** 生成简单的唯一 ID（仅供测试用）。 */
let counter = 0;
export function testId(prefix = 'id'): string {
  return `${prefix}_${Date.now()}_${++counter}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
