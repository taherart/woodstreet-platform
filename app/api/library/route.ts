import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  const db = getDb();
  const outputs = db.prepare(`
    SELECT o.*, g.created_at as gen_created_at
    FROM outputs o
    JOIN generations g ON o.generation_id = g.id
    WHERE o.status = 'completed' AND o.local_path IS NOT NULL
    ORDER BY g.created_at DESC
    LIMIT 30
  `).all() as any[];

  return NextResponse.json({
    library: outputs.map(o => ({
      id: o.id,
      label: o.label,
      type: o.output_type,
      url: o.local_path,
      magnific_creation_id: o.magnific_creation_id,
      created_at: o.gen_created_at,
    })),
  });
}
