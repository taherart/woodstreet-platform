/**
 * Magnific MCP Client — Real API via StreamableHTTP
 * Uses direct file upload (creations_request_upload + creations_finalize_upload)
 * instead of public URL to avoid firewall issues.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { readFileSync, existsSync, writeFileSync, readFile } from 'fs';
import { join } from 'path';
import { SPACE_ID, INPUT_NODE_ID, getNodeIds } from './woodstreet-nodes';

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

  // Step 1: Request upload URL
  const reqResult = await c.callTool({
    name: 'creations_request_upload',
    arguments: { mimeType: 'image/png' },
  });

  const reqText = extractTextContent(reqResult);
  console.log('[Magnific] Upload request:', reqText.slice(0, 300));
  
  // Parse the presigned URL details
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

  // Step 2: PUT the file bytes to the presigned URL
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

  // Step 3: Finalize the upload (path only, no uploads array)
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

export async function runSpace(filePath: string, selectedOptionIds: string[]): Promise<string[]> {
  const c = await getClient();
  const selectedNodeIds = getNodeIds(selectedOptionIds);

  console.log('[Magnific] Selected option IDs:', selectedOptionIds);
  console.log('[Magnific] Resolved node IDs:', selectedNodeIds);

  // Direct upload the file
  console.log('[Magnific] Uploading file:', filePath);
  const creationId = await uploadImageFile(filePath);

  console.log('[Magnific] Creation ID:', creationId);

  // Add creation to Space
  const addResult = await c.callTool({
    name: 'spaces_add_creations',
    arguments: { spaceId: SPACE_ID, creationIdentifiers: [creationId] },
  });
  
  const addText = extractTextContent(addResult);
  console.log('[Magnific] Added to Space:', addText.slice(0, 300));

  // Connect the new image node to the input node via spaces_edit
  const inputNodeId = INPUT_NODE_ID;
  console.log('[Magnific] Connecting new image to input node:', inputNodeId);

  const editResult = await c.callTool({
    name: 'spaces_edit',
    arguments: {
      spaceId: SPACE_ID,
      query: 'set this newly added image as the image for the input node — replace any old image on the input node with this new creation',
      anchorElementId: inputNodeId,
      anchorDirection: 'right',
    },
  });

  const editText = extractTextContent(editResult);
  console.log('[Magnific] Edit result:', editText.slice(0, 300));

  // Poll the edit to complete
  const editOpId = extractId(editText, 'operationId') || extractId(editText);
  if (editOpId) {
    await pollEditComplete(c, editOpId);
  }

  // Run EACH selected generator in SINGULAR mode (only requested nodes fire)
  const runIds: string[] = [];
  for (const nodeId of selectedNodeIds) {
    console.log('[Magnific] Running singular generator:', nodeId);
    const runResult = await c.callTool({
      name: 'spaces_run',
      arguments: {
        spaceId: SPACE_ID,
        startNodeId: nodeId,
        mode: 'singular',
      },
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
  
  // Try to extract structured data from MCP response
  if (result?.content && Array.isArray(result.content)) {
    for (const item of result.content) {
      if (item.type === 'resource' && item.resource) {
        const res = item.resource;
        const data: any = { identifier: creationId };
        if (res.uri) data.uri = res.uri;
        if (res.text) {
          try { Object.assign(data, JSON.parse(res.text)); } catch {}
        }
        if (res.blob) data.blob = res.blob;
        console.log(`[Magnific] getCreation(${creationId}) structured:`, Object.keys(data).join(','));
        return data;
      }
    }
  }
  
  const text = extractTextContent(result);
  console.log(`[Magnific] getCreation(${creationId}) text:`, text.slice(0, 300));
  
  // Fallback: try JSON parse
  try { return JSON.parse(text); } catch {}
  return { identifier: creationId, rawText: text };
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
