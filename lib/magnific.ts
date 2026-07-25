/**
 * Magnific MCP Client — Real API via StreamableHTTP
 * Uses direct file upload (creations_request_upload + creations_finalize_upload)
 * instead of public URL to avoid firewall issues.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { readFileSync, existsSync, writeFileSync, readFile } from 'fs';
import { join } from 'path';
import { SPACE_ID, getNodeIds, VideoParams, OUTPUT_OPTIONS } from './woodstreet-nodes';

const MAGNIFIC_MCP_URL = 'https://mcp.magnific.com';
const TOKENS_PATH = join(process.env.HOME || '/root', '.hermes', 'mcp-tokens', 'magnific.json');
const META_PATH = TOKENS_PATH.replace('.json', '.meta.json');

interface TokenData {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
}

async function loadAccessToken(): Promise<string | null> {
  try {
    if (!existsSync(TOKENS_PATH)) return null;
    const tokens: TokenData = JSON.parse(readFileSync(TOKENS_PATH, 'utf-8'));
    if (tokens.expires_at && tokens.expires_at < Date.now() / 1000 + 60) {
      return refreshToken(tokens);
    }
    return tokens.access_token;
  } catch { return null; }
}

async function refreshToken(tokens: TokenData): Promise<string | null> {
  if (!tokens.refresh_token) return null;
  try {
    const meta = JSON.parse(readFileSync(META_PATH, 'utf-8'));
    const r = await fetch(meta.token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token', refresh_token: tokens.refresh_token,
        client_id: 'mcp-client',
      }),
    });
    if (!r.ok) return null;
    const nt = await r.json();
    const u: TokenData = { access_token: nt.access_token, refresh_token: nt.refresh_token || tokens.refresh_token, expires_at: (Date.now()/1000) + (nt.expires_in || 3600) };
    writeFileSync(TOKENS_PATH, JSON.stringify(u, null, 2));
    return u.access_token;
  } catch { return null; }
}

let client: Client | null = null;
let transport: StreamableHTTPClientTransport | null = null;

async function getClient(): Promise<Client> {
  if (client) return client;
  const token = await loadAccessToken();
  if (!token) throw new Error('No Magnific access token');
  transport = new StreamableHTTPClientTransport(new URL(MAGNIFIC_MCP_URL), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  client = new Client({ name: 'woodstreet-platform', version: '1.0.0' }, { capabilities: {} });
  await client.connect(transport);
  return client;
}

/**
 * Upload a local image file to Magnific using presigned PUT URL
 */
async function uploadImageFile(filePath: string): Promise<string> {
  const c = await getClient();

  const reqResult = await c.callTool({
    name: 'creations_request_upload',
    arguments: { mimeType: 'image/png' },
  });

  const reqText = extractTextContent(reqResult);
  console.log('[Magnific] Upload request:', reqText.slice(0, 300));
  
  let presignedUrl = '';
  let uploadPath = '';
  try {
    const parsed = JSON.parse(reqText);
    presignedUrl = parsed.proxyUploadUrl || parsed.url || parsed.uploadUrl || '';
    uploadPath = parsed.path || parsed.key || '';
  } catch {
    const urlMatch = reqText.match(/"proxyUploadUrl"\s*:\s*"([^"]+)"/) || reqText.match(/"url"\s*:\s*"([^"]+)"/);
    const pathMatch = reqText.match(/"path"\s*:\s*"([^"]+)"/);
    presignedUrl = urlMatch?.[1] || '';
    uploadPath = pathMatch?.[1] || '';
  }

  if (!presignedUrl) {
    throw new Error(`Failed to get presigned URL: ${reqText.slice(0, 200)}`);
  }

  const fileBuffer = await new Promise<Buffer>((resolve, reject) => {
    readFile(filePath, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });

  const putRes = await fetch(presignedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/png' },
    body: new Uint8Array(fileBuffer),
  });

  if (!putRes.ok) {
    throw new Error(`Upload PUT failed: ${putRes.status} ${putRes.statusText}`);
  }

  console.log('[Magnific] File uploaded to presigned URL');

  const finalizeResult = await c.callTool({
    name: 'creations_finalize_upload',
    arguments: { path: uploadPath },
  });

  const finalizeText = extractTextContent(finalizeResult);
  console.log('[Magnific] Finalize:', finalizeText.slice(0, 300));

  const creationId = extractId(finalizeText);
  if (!creationId) {
    throw new Error(`Failed to get creation ID from finalize: ${finalizeText.slice(0, 200)}`);
  }

  return creationId;
}

/**
 * Clean up the space: reset to perfect star topology (input → 7 generators),
 * remove any stray creation nodes from previous runs.
 */
async function cleanSpace(c: Client): Promise<void> {
  console.log('[Magnific] Cleaning space...');
  const cleanQuery = `Clean up this space:
1. DELETE any creation nodes that are NOT the input node and NOT the output creation nodes (2fe0f50a, 6d059735, 6f5cbc72, afa0c655, e52a1fe7, 2827cf46, 1b6af891, 0e658e46)
2. Remove ALL existing connections
3. Connect the input node (cc6739fc) to all 8 generators: 3aca2fcb, f3514c2b, a03ceff9, 08738244, d53a1432, 12d68131, bbcae213, 1b98ba4e
Result must be exactly: input → 8 generators, no other nodes or connections`;

  const result = await c.callTool({
    name: 'spaces_edit',
    arguments: { spaceId: SPACE_ID, query: cleanQuery },
  });
  
  const text = extractTextContent(result);
  const opId = extractId(text, 'operationId') || extractId(text);
  if (opId) {
    await pollEditComplete(c, opId);
    console.log('[Magnific] Space cleaned');
  }
}

export async function runSpace(filePath: string, selectedOptionIds: string[], videoParams?: Record<string, VideoParams>, dimensions?: { w: string; h: string; d: string }): Promise<string[]> {
  const c = await getClient();
  const selectedNodeIds = getNodeIds(selectedOptionIds);

  console.log('[Magnific] Selected option IDs:', selectedOptionIds);
  console.log('[Magnific] Resolved node IDs:', selectedNodeIds);
  if (videoParams) console.log('[Magnific] Video params:', JSON.stringify(videoParams));

  // 0. Clean space: reset to star topology, remove stray nodes
  await cleanSpace(c);

  // 1. Upload the image
  console.log('[Magnific] Uploading file:', filePath);
  const creationId = await uploadImageFile(filePath);
  console.log('[Magnific] Creation ID:', creationId);

  // 2. Add creation to Space and get its node ID
  const addResult = await c.callTool({
    name: 'spaces_add_creations',
    arguments: { spaceId: SPACE_ID, creationIdentifiers: [creationId] },
  });
  
  const addText = extractTextContent(addResult);
  console.log('[Magnific] Added to Space:', addText.slice(0, 300));

  // Extract the new node ID from the add result
  let newNodeId = '';
  try {
    const parsed = JSON.parse(addText);
    newNodeId = parsed?.result?.results?.[0]?.nodeId || '';
  } catch {}
  if (!newNodeId) {
    // Fallback: try parsing structuredContent
    newNodeId = (addResult as any)?.structuredContent?.result?.results?.[0]?.nodeId || '';
  }

  if (!newNodeId) {
    console.error('[Magnific] Could not extract new node ID from add result');
    // Fallback: run without reconnecting (old behavior)
    const runIds: string[] = [];
    for (const nodeId of selectedNodeIds) {
      const runResult = await c.callTool({
        name: 'spaces_run',
        arguments: { spaceId: SPACE_ID, startNodeId: nodeId, mode: 'singular' },
      });
      const runId = extractId(extractTextContent(runResult), 'workflowRunIdentifier');
      if (runId) runIds.push(runId);
    }
    return runIds;
  }

  console.log('[Magnific] New image node ID:', newNodeId);

  // 3. Reconnect: disconnect input → selected gens, connect new image → selected gens
  const genList = selectedNodeIds.join(', ');
  const editQuery = `Disconnect the input node (cc6739fc-4f96-46a8-8db8-c730befb1c66) from these generators: ${genList}. Then connect the new image node (${newNodeId}) directly to these same generators: ${genList} — using the new image as their image reference. Remove old connections and create new ones.`;

  console.log('[Magnific] Reconnecting image to selected generators...');
  const editResult = await c.callTool({
    name: 'spaces_edit',
    arguments: { spaceId: SPACE_ID, query: editQuery },
  });

  const editText = extractTextContent(editResult);
  console.log('[Magnific] Edit result:', editText.slice(0, 300));

  const editOpId = extractId(editText, 'operationId') || extractId(editText);
  if (editOpId) {
    await pollEditComplete(c, editOpId);
  }

  // 4. Apply video params: update node duration/aspectRatio via spaces_edit
  if (videoParams) {
    for (const [optionId, params] of Object.entries(videoParams)) {
      const opt = OUTPUT_OPTIONS.find(o => o.id === optionId);
      if (opt && selectedOptionIds.includes(optionId)) {
        console.log(`[Magnific] Setting video params for ${optionId}: duration=${params.duration}s, ratio=${params.aspectRatio}`);
        const vEditResult = await c.callTool({
          name: 'spaces_edit',
          arguments: {
            spaceId: SPACE_ID,
            selectedElementIds: [opt.nodeId],
            query: `Set this video generator's duration to ${params.duration} seconds and aspect ratio to ${params.aspectRatio}. Keep model as kling-25 and resolution as 720p.`,
          },
        });
        const vEditText = extractTextContent(vEditResult);
        const vEditOpId = extractId(vEditText, 'operationId') || extractId(vEditText);
        if (vEditOpId) await pollEditComplete(c, vEditOpId);
      }
    }
  }

  // Apply dimension prompt if image_dimensions selected
  if (dimensions && selectedOptionIds.includes('image_dimensions')) {
    const dimNode = OUTPUT_OPTIONS.find(o => o.id === 'image_dimensions');
    if (dimNode && (dimensions.w || dimensions.h || dimensions.d)) {
      const w = dimensions.w || '?';
      const h = dimensions.h || '?';
      const d = dimensions.d || '?';
      console.log(`[Magnific] Setting dimensions on node ${dimNode.nodeId}: W=${w}, H=${h}, D=${d}`);
      const dimEditResult = await c.callTool({
        name: 'spaces_edit',
        arguments: {
          spaceId: SPACE_ID,
          selectedElementIds: [dimNode.nodeId],
          query: `Update the prompt of this image generator to include exact dimensions. Set the prompt to: "Create an isometric technical view of this product on a clean white background. Show the product in perfect 3/4 isometric perspective with professional studio lighting. Include dimension lines and arrows marking the exact dimensions: width=${w}cm, height=${h}cm, depth=${d}cm. Numbers must be clearly visible in a technical drawing style. The product must look exactly identical to the reference — preserve all product details, colors, materials, and proportions precisely. Minimalist technical blueprint aesthetic, crisp lines."`,
        },
      });
      const dimEditText = extractTextContent(dimEditResult);
      const dimEditOpId = extractId(dimEditText, 'operationId') || extractId(dimEditText);
      if (dimEditOpId) await pollEditComplete(c, dimEditOpId);
    }
  }

  // 5. Run EACH selected generator in SINGULAR mode
  const runIds: string[] = [];
  for (const nodeId of selectedNodeIds) {
    console.log('[Magnific] Running singular generator:', nodeId);
    const runResult = await c.callTool({
      name: 'spaces_run',
      arguments: { spaceId: SPACE_ID, startNodeId: nodeId, mode: 'singular' },
    });

    const runText = extractTextContent(runResult);
    const runId = extractId(runText, 'workflowRunIdentifier');
    if (runId) {
      console.log('[Magnific] Singular run started:', runId);
      runIds.push(runId);
    } else {
      console.error('[Magnific] No run ID for node:', nodeId, runText.slice(0, 200));
    }
  }

  console.log('[Magnific] All singular runs started:', runIds);
  return runIds;
}

async function pollEditComplete(c: Client, operationId: string): Promise<void> {
  for (let i = 0; i < 30; i++) {
    const result = await c.callTool({
      name: 'spaces_edit_status',
      arguments: { operationId, timeoutSeconds: 5 },
    });
    const text = extractTextContent(result);
    try {
      const parsed = JSON.parse(text);
      if (parsed.allTerminal) {
        console.log('[Magnific] Edit completed');
        return;
      }
    } catch {}
    await new Promise(r => setTimeout(r, 2000));
  }
  console.log('[Magnific] Edit poll timeout — proceeding anyway');
}

export async function pollRunStatus(runId: string) {
  const c = await getClient();
  const result = await c.callTool({
    name: 'spaces_run_status',
    arguments: { workflowRunIdentifier: runId, timeoutSeconds: 5 },
  });
  const text = extractTextContent(result);
  try { return JSON.parse(text); } catch { return { rawText: text }; }
}

export async function getCreation(creationId: string): Promise<any> {
  const c = await getClient();
  const result = await c.callTool({
    name: 'creations_get',
    arguments: { creationIdentifier: creationId },
  });
  
  const text = extractTextContent(result);
  
  // Parse the MCP key-value text format (key: "value" or key: value)
  const parsed: any = {};
  const lines = text.split('\n');
  for (const line of lines) {
    const keyVal = line.match(/^(\w+):\s*(.*)/);
    if (keyVal) {
      let val = keyVal[2].trim();
      // Remove surrounding quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      parsed[keyVal[1]] = val;
    }
  }
  
  console.log(`[Magnific] getCreation(${creationId}) keys:`, Object.keys(parsed).join(','));
  console.log(`[Magnific] getCreation(${creationId}) url:`, (parsed.url || 'none').slice(0, 80));

  return parsed;
}

export async function disconnect() {
  if (transport) { await transport.close(); transport = null; }
  client = null;
}

function extractTextContent(result: any): string {
  if (typeof result === 'string') return result;
  if (result?.content && Array.isArray(result.content)) {
    return result.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n');
  }
  return JSON.stringify(result);
}

function extractId(text: string, key?: string): string {
  try {
    const p = JSON.parse(text);
    if (key) return p[key] || p.structuredContent?.[key] || '';
    return p.identifier || p.creationIdentifier || p.id || '';
  } catch {
    const sk = key || 'identifier';
    const m = text.match(new RegExp(`"${sk}"\\s*:\\s*"([^"]+)"`));
    return m?.[1] || '';
  }
}
