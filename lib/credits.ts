import { getDb } from './db';

const MONTHLY_RESET_DAY = 1;

export function checkAndResetCredits() {
  const db = getDb();
  const pool = db.prepare('SELECT * FROM credit_pool WHERE id = 1').get() as any;
  if (!pool) return;

  const now = new Date();
  const lastReset = pool.last_reset ? new Date(pool.last_reset) : null;

  // Reset if new month and past reset day
  if (
    !lastReset ||
    (now.getMonth() !== lastReset.getMonth() && now.getDate() >= MONTHLY_RESET_DAY) ||
    (now.getFullYear() !== lastReset.getFullYear())
  ) {
    db.prepare(`
      UPDATE credit_pool 
      SET used_credits = 0, last_reset = datetime('now')
      WHERE id = 1
    `).run();
    db.prepare(`
      INSERT INTO credit_log (amount, action, description)
      VALUES (?, 'monthly_reset', 'Monthly credit reset')
    `).run(pool.total_credits);
  }
}

export function getAvailableCredits(): number {
  checkAndResetCredits();
  const db = getDb();
  const pool = db.prepare('SELECT * FROM credit_pool WHERE id = 1').get() as any;
  return pool.total_credits - pool.used_credits;
}

export function getCreditInfo() {
  checkAndResetCredits();
  const db = getDb();
  return db.prepare('SELECT * FROM credit_pool WHERE id = 1').get() as any;
}

export function deductCredits(amount: number, generationId: string): boolean {
  const db = getDb();
  const available = getAvailableCredits();
  if (available < amount) return false;

  db.prepare('UPDATE credit_pool SET used_credits = used_credits + ? WHERE id = 1').run(amount);
  db.prepare(`
    INSERT INTO credit_log (generation_id, amount, action, description)
    VALUES (?, ?, 'debit', 'Generation cost')
  `).run(generationId, amount);

  return true;
}

export function addCredits(amount: number, description?: string) {
  const db = getDb();
  // Increase total pool
  const pool = db.prepare('SELECT * FROM credit_pool WHERE id = 1').get() as any;
  db.prepare('UPDATE credit_pool SET total_credits = ? WHERE id = 1').run(pool.total_credits + amount);
  db.prepare(`
    INSERT INTO credit_log (amount, action, description)
    VALUES (?, 'admin_add', ?)
  `).run(amount, description || 'Admin credit addition');
}

export function setMonthlyCredits(amount: number) {
  const db = getDb();
  db.prepare('UPDATE credit_pool SET total_credits = ?, used_credits = 0, last_reset = datetime(\'now\') WHERE id = 1').run(amount);
  db.prepare(`
    INSERT INTO credit_log (amount, action, description)
    VALUES (?, 'admin_set', 'Monthly credit limit set')
  `).run(amount);
}

export function getCreditLogs(limit = 50) {
  const db = getDb();
  return db.prepare('SELECT * FROM credit_log ORDER BY created_at DESC LIMIT ?').all(limit);
}
