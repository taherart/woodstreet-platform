import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'woodstreet.db');

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    const fs = require('fs');
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema(db);
  }
  return db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS credit_pool (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      total_credits INTEGER NOT NULL DEFAULT 1000,
      used_credits INTEGER NOT NULL DEFAULT 0,
      reset_day INTEGER NOT NULL DEFAULT 1,
      last_reset TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS generations (
      id TEXT PRIMARY KEY,
      product_image TEXT NOT NULL,
      selected_outputs TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      total_cost INTEGER DEFAULT 0,
      workflow_run_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS outputs (
      id TEXT PRIMARY KEY,
      generation_id TEXT NOT NULL,
      node_id TEXT NOT NULL,
      output_type TEXT NOT NULL,
      label TEXT NOT NULL,
      magnific_creation_id TEXT,
      local_path TEXT,
      cost INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      regen_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (generation_id) REFERENCES generations(id)
    );

    CREATE TABLE IF NOT EXISTS credit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      generation_id TEXT,
      amount INTEGER NOT NULL,
      action TEXT NOT NULL,
      description TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    INSERT OR IGNORE INTO credit_pool (id, total_credits) VALUES (1, 1000);
  `);
  
  // Migration: add regen_count if missing
  try { db.exec(`ALTER TABLE outputs ADD COLUMN regen_count INTEGER DEFAULT 0`); } catch {}
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}
