import { NextRequest, NextResponse } from 'next/server';
import { getOutput, incrementRegen } from '@/lib/logger';
import { regenerateNode } from '@/lib/magnific';

export async function POST(request: NextRequest) {
  try {
    const { outputId, promptAdjustment } = await request.json();

    if (!outputId) {
      return NextResponse.json({ error: 'outputId required' }, { status: 400 });
    }

    const output = getOutput(outputId);
    if (!output) {
      return NextResponse.json({ error: 'Output not found' }, { status: 404 });
    }

    const regenCount = output.regen_count || 0;
    if (regenCount >= 5) {
      return NextResponse.json({ error: 'وصلت للحد الأقصى لإعادة التوليد (5 مرات)' }, { status: 400 });
    }

    console.log(`[Regen] Regenerating output ${outputId} (#${regenCount + 1}/5), node: ${output.node_id}`);

    // Run regenerate — no credit deduction
    const newCreationId = await regenerateNode(
      output.node_id,
      promptAdjustment || '',
      output.magnific_creation_id
    );

    console.log(`[Regen] New creation: ${newCreationId}`);

    // Get the download URL
    const { getCreation } = require('@/lib/magnific');
    const creation = await getCreation(newCreationId);
    const dlUrl = creation?.url || creation?.previewUrl || creation?.uri || '';

    // Update output
    incrementRegen(outputId, newCreationId, dlUrl);
    const updated = getOutput(outputId);

    return NextResponse.json({
      success: true,
      outputId,
      newCreationId,
      download_url: dlUrl,
      preview_url: dlUrl,
      regen_count: updated.regen_count,
    });
  } catch (error) {
    console.error('[Regen] Error:', error);
    return NextResponse.json({ error: 'فشل إعادة التوليد' }, { status: 500 });
  }
}
