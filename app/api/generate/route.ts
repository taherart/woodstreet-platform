import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { createGeneration, updateGenerationStatus, updateOutputStatus, getGeneration } from '@/lib/logger';
import { deductCredits } from '@/lib/credits';
import { getTotalCost, OUTPUT_OPTIONS, getNodeIds } from '@/lib/woodstreet-nodes';
import { runSpace, pollRunStatus, getCreation, disconnect } from '@/lib/magnific';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const imageFile = formData.get('image') as File;
    const outputsRaw = formData.get('outputs') as string;

    if (!imageFile || !outputsRaw) {
      return NextResponse.json({ error: 'الصورة والمخرجات مطلوبة' }, { status: 400 });
    }

    const selectedIds: string[] = JSON.parse(outputsRaw);
    if (selectedIds.length === 0) {
      return NextResponse.json({ error: 'اختر مخرجًا واحدًا على الأقل' }, { status: 400 });
    }

    const validIds = OUTPUT_OPTIONS.map(o => o.id);
    if (selectedIds.some(id => !validIds.includes(id))) {
      return NextResponse.json({ error: 'مخرجات غير صالحة' }, { status: 400 });
    }

    const totalCost = getTotalCost(selectedIds);
    const deducted = deductCredits(totalCost, 'pending');
    if (!deducted) {
      return NextResponse.json({ error: 'الرصيد غير كافٍ' }, { status: 402 });
    }

    // Save uploaded image to public/uploads
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
    await mkdir(uploadsDir, { recursive: true });
    const ext = imageFile.name.split('.').pop() || 'png';
    const imageName = `${uuid()}.${ext}`;
    const imagePath = path.join(uploadsDir, imageName);
    const buffer = Buffer.from(await imageFile.arrayBuffer());
    await writeFile(imagePath, buffer);

    const imageUrl = `/uploads/${imageName}`;
    const { id: genId, outputs } = createGeneration(imageUrl, selectedIds, totalCost);
    updateGenerationStatus(genId, 'processing');

    // Build the full public URL for Magnific to download the image
    const host = request.headers.get('host') || 'localhost:3000';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const fullImageUrl = `${protocol}://${host}${imageUrl}`;

    console.log(`[Generate] Starting Magnific workflow for ${genId}`);
    console.log(`[Generate] Image URL: ${fullImageUrl}`);
    console.log(`[Generate] Selected: ${selectedIds.join(', ')}`);

    // Fire and forget: run Space, poll, download results
    runSpace(fullImageUrl, selectedIds)
      .then(async (runId) => {
        updateGenerationStatus(genId, 'running', runId);
        console.log(`[Generate] Workflow ${runId} started for ${genId}`);

        // Poll until complete (max ~10 minutes for video generation)
        let allDone = false;
        let attempts = 0;
        const maxAttempts = 120; // 10 min at 5s intervals

        while (!allDone && attempts < maxAttempts) {
          await new Promise(r => setTimeout(r, 5000));
          attempts++;
          try {
            const status = await pollRunStatus(runId);
            console.log(`[Generate] Poll ${attempts}:`, JSON.stringify(status).slice(0, 200));
            allDone = status.allTerminal === true;

            if (allDone || status.nodeRuns) {
              const nodeRuns = status.nodeRuns || [];
              for (const nr of nodeRuns) {
                if (nr.status === 'completed' && nr.creationIdentifiers) {
                  for (const cid of nr.creationIdentifiers) {
                    // Match node to our output record
                    const output = outputs.find(o => o.node_id === nr.nodeId);
                    if (output && cid) {
                      try {
                        const creation = await getCreation(cid);
                        const dlUrl = creation?.url || creation?.previewUrl;
                        updateOutputStatus(output.id, 'completed', cid, dlUrl);
                        console.log(`[Generate] Output ${output.label}: ${cid}`);
                      } catch (e) {
                        console.error(`[Generate] Failed to get creation ${cid}:`, e);
                        updateOutputStatus(output.id, 'failed');
                      }
                    }
                  }
                }
              }
            }
          } catch (e) {
            console.error(`[Generate] Poll error:`, e);
          }
        }

        if (!allDone) {
          updateGenerationStatus(genId, 'timeout');
        } else {
          updateGenerationStatus(genId, 'completed');
        }
      })
      .catch(async (err) => {
        console.error(`[Generate] Workflow failed:`, err);
        updateGenerationStatus(genId, 'failed');
        // Try to disconnect to clean up
        try { await disconnect(); } catch {}
      });

    return NextResponse.json({
      genId,
      outputs: outputs.map(o => ({
        id: o.id,
        label: o.label,
        type: o.output_type,
        status: 'pending',
      })),
      totalCost,
    });
  } catch (error) {
    console.error('[Generate] Error:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
