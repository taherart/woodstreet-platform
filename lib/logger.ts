import { getDb } from './db';
import { OUTPUT_OPTIONS } from './woodstreet-nodes';
import { v4 as uuid } from 'uuid';

export function createGeneration(productImagePath: string, selectedIds: string[], totalCost: number) {
  const db = getDb();
  const id = uuid();

  const outputs = selectedIds.map(selId => {
    const opt = OUTPUT_OPTIONS.find(o => o.id === selId)!;
    return {
      id: uuid(),
      generation_id: id,
      node_id: opt.nodeId,
      output_type: opt.type,
      label: opt.label,
      cost: opt.cost,
    };
  });

  const insertGen = db.prepare(`
    INSERT INTO generations (id, product_image, selected_outputs, total_cost)
    VALUES (?, ?, ?, ?)
  `);
  insertGen.run(id, productImagePath, JSON.stringify(selectedIds), totalCost);

  const insertOut = db.prepare(`
    INSERT INTO outputs (id, generation_id, node_id, output_type, label, cost)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  for (const out of outputs) {
    insertOut.run(out.id, out.generation_id, out.node_id, out.output_type, out.label, out.cost);
  }

  return { id, outputs };
}

export function getGeneration(id: string) {
  const db = getDb();
  const gen = db.prepare('SELECT * FROM generations WHERE id = ?').get(id) as any;
  if (!gen) return null;
  const outputs = db.prepare('SELECT * FROM outputs WHERE generation_id = ?').all(id);
  return { ...gen, outputs, selected_outputs: JSON.parse(gen.selected_outputs) };
}

export function updateGenerationStatus(id: string, status: string, workflowRunId?: string) {
  const db = getDb();
  if (status === 'completed') {
    db.prepare(`
      UPDATE generations SET status = ?, workflow_run_id = ?, completed_at = datetime('now')
      WHERE id = ?
    `).run(status, workflowRunId || null, id);
  } else {
    db.prepare('UPDATE generations SET status = ?, workflow_run_id = ? WHERE id = ?')
      .run(status, workflowRunId || null, id);
  }
}

export function updateOutputStatus(
  id: string,
  status: string,
  creationId?: string,
  localPath?: string
) {
  const db = getDb();
  db.prepare(`
    UPDATE outputs 
    SET status = ?, magnific_creation_id = ?, local_path = ?
    WHERE id = ?
  `).run(status, creationId || null, localPath || null, id);
}

export function getAllGenerations(limit = 50) {
  const db = getDb();
  const gens = db.prepare('SELECT * FROM generations ORDER BY created_at DESC LIMIT ?').all(limit) as any[];
  return gens.map(g => ({
    ...g,
    selected_outputs: JSON.parse(g.selected_outputs),
  }));
}

export function getGenerationLogs(limit = 50) {
  const db = getDb();
  return db.prepare(`
    SELECT g.*, 
      (SELECT COUNT(*) FROM outputs o WHERE o.generation_id = g.id) as output_count,
      (SELECT COUNT(*) FROM outputs o WHERE o.generation_id = g.id AND o.status = 'completed') as completed_count
    FROM generations g 
    ORDER BY g.created_at DESC 
    LIMIT ?
  `).all(limit);
}

export function getOutput(outputId: string) {
  const db = getDb();
  return db.prepare('SELECT * FROM outputs WHERE id = ?').get(outputId) as any;
}

export function incrementRegen(outputId: string, newCreationId: string, newPath: string) {
  const db = getDb();
  db.prepare(`
    UPDATE outputs 
    SET regen_count = regen_count + 1, magnific_creation_id = ?, local_path = ?
    WHERE id = ?
  `).run(newCreationId, newPath, outputId);
  return db.prepare('SELECT regen_count FROM outputs WHERE id = ?').get(outputId) as any;
}
