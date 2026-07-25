import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { createGeneration, updateGenerationStatus, updateOutputStatus, getGeneration } from '@/lib/logger';
import { deductCredits } from '@/lib/credits';
import { getTotalCost, OUTPUT_OPTIONS, getNodeIds, VideoParams } from '@/lib/woodstreet-nodes';
import { runSpace, pollRunStatus, getCreation, disconnect } from '@/lib/magnific';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const imageFile = formData.get('image') as File;
    const outputRaw = formData.get('outputs') as string;
    const videoParamsRaw = formData.get('videoParams') as string;
    const dimensionsRaw = formData.get('dimensions') as string;

    if (!imageFile || !outputRaw) {
      return NextResponse.json({ error: 'الصورة والمخرجات مطلوبة' }, { status: 400 });
    }

    const selectedIds: string[] = JSON.parse(outputRaw);
    const videoParams: Record<string, VideoParams> | undefined = videoParamsRaw ? JSON.parse(videoParamsRaw) : undefined;
    const dimensions: { w: string; h: string; d: string } | undefined = dimensionsRaw ? JSON.parse(dimensionsRaw) : undefined;

    if (selectedIds.length === 0) {
      return NextResponse.json({ error: 'اختر مخرجًا واحدًا على الأقل' }, { status: 400 });
    }

    const validIds = OUTPUT_OPTIONS.map(o => o.id);
    if (selectedIds.some(id => !validIds.includes(id))) {
      return NextResponse.json({ error: 'مخرجات غير صالحة' }, { status: 400 });
    }

    const totalCost = getTotalCost(selectedIds, videoParams);
    const deducted = deductCredits(totalCost, 'pending');
    if (!deducted) {
      return NextResponse.json({ error: 'الرصيد غير كافٍ' }, { status: 402 });
    }

    // Save uploaded image to public/uploads
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
    await mkdir(uploadsDir, { recursive: true });

    // Auto-clean: delete old upload files (keep only last 5)
    const { readdir, unlink } = await import('fs/promises');
    const existingFiles = await readdir(uploadsDir);
    const imageFiles = existingFiles.filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f));
    if (imageFiles.length > 5) {
      // Sort by name (UUID-based, chronological) and delete oldest
      const toDelete = imageFiles.sort().slice(0, imageFiles.length - 5);
      for (const f of toDelete) {
        await unlink(path.join(uploadsDir, f));
        console.log(`[Cleanup] Deleted old upload: ${f}`);
      }
    }

    const ext = imageFile.name.split('.').pop() || 'png';
    const imageName = `${uuid()}.${ext}`;
    const imagePath = path.join(uploadsDir, imageName);
    const buffer = Buffer.from(await imageFile.arrayBuffer());
    await writeFile(imagePath, buffer);

    const imageUrl = `/uploads/${imageName}`;
    const { id: genId, outputs } = createGeneration(imageUrl, selectedIds, totalCost);
    updateGenerationStatus(genId, 'processing');

    // Use direct file upload (presigned PUT) instead of public URL
    console.log(`[Generate] Starting Magnific workflow for ${genId}`);
    console.log(`[Generate] Image path: ${imagePath}`);
    console.log(`[Generate] Selected: ${selectedIds.join(', ')}`);

    // Fire and forget: upload to Magnific via presigned PUT, run Space, poll, download
    runSpace(imagePath, selectedIds, videoParams, dimensions)
      .then(async (runIds) => {
        updateGenerationStatus(genId, 'running', runIds.join(','));
        console.log(`[Generate] ${runIds.length} workflows started for ${genId}:`, runIds);

        // Poll each run ID until all are done (max ~10 minutes)
        const pendingRuns = new Set(runIds);
        const completedOutputs = new Set<string>();
        let attempts = 0;
        const maxAttempts = 120; // 10 min at 5s intervals

        while (pendingRuns.size > 0 && attempts < maxAttempts) {
          await new Promise(r => setTimeout(r, 5000));
          attempts++;
          for (const runId of [...pendingRuns]) {
            try {
              const status = await pollRunStatus(runId);
              console.log(`[Generate] Poll ${attempts} (${runId.slice(0,10)}):`, JSON.stringify(status).slice(0, 200));
              
              if (status.allTerminal) {
                pendingRuns.delete(runId);
              }

              const nodeRuns = status.nodeRuns || [];
              for (const nr of nodeRuns) {
                if (nr.status === 'completed' && nr.creationIdentifiers) {
                  for (const cid of nr.creationIdentifiers) {
                    // Match node to our output record
                    const output = outputs.find(o => o.node_id === nr.nodeId);
                    if (output && cid && !completedOutputs.has(output.id)) {
                      try {
                        const creation = await getCreation(cid);
                        const dlUrl = creation?.url || creation?.previewUrl 
                          || creation?.thumbnailUrl || creation?.originalUrl
                          || creation?.uri || creation?.blob;
                        updateOutputStatus(output.id, 'completed', cid, dlUrl);
                        completedOutputs.add(output.id);
                        console.log(`[Generate] Output ${output.label}: ${cid} dl=${(dlUrl||'none').slice(0,60)}`);
                      } catch (e) {
                        console.error(`[Generate] Failed to get creation ${cid}:`, e);
                        updateOutputStatus(output.id, 'failed');
                      }
                    }
                  }
                }
              }
            } catch (e) {
              console.error(`[Generate] Poll error for ${runId}:`, e);
            }
          }
        }

        const allDone = pendingRuns.size === 0;
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
