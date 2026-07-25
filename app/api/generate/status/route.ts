import { NextRequest, NextResponse } from 'next/server';
import { getGeneration } from '@/lib/logger';

export async function GET(request: NextRequest) {
  const genId = request.nextUrl.searchParams.get('genId');
  if (!genId) {
    return NextResponse.json({ error: 'genId required' }, { status: 400 });
  }

  const gen = getGeneration(genId) as any;
  if (!gen) {
    return NextResponse.json({ error: 'Generation not found' }, { status: 404 });
  }

  const completed = gen.outputs.filter((o: any) => o.status === 'completed').length;
  const total = gen.outputs.length;
  const allDone = completed === total || gen.status === 'completed' || gen.status === 'failed';

  return NextResponse.json({
    genId: gen.id,
    status: gen.status,
    completed,
    total,
    allDone,
    outputs: gen.outputs.map((o: any) => ({
      id: o.id,
      label: o.label,
      type: o.output_type,
      status: o.status,
      download_url: o.local_path,
      preview_url: o.local_path,
      magnific_creation_id: o.magnific_creation_id,
    })),
  });
}
