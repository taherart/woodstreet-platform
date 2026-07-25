/**
 * Magnific MCP Client — Real API via StreamableHTTP
 * Uses direct file upload (creations_request_upload + creations_finalize_upload)
 * instead of public URL to avoid firewall issues.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { readFileSync, existsSync, writeFileSync, readFile } from 'fs';
import { join } from 'path';
import { SPACE_ID, getNodeIds } from './woodstreet-nodes';

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

export async function runSpace(filePath: string, selectedOptionIds: string[]): Promise<string[]> {
  const c = await getClient();
  const selectedNodeIds = getNodeIds(selectedOptionIds);

  console.log('[Magnific] Selected option IDs:', selectedOptionIds);
  console.log('[Magnific] Resolved node IDs:', selectedNodeIds);

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

  // 4. Run EACH selected generator in SINGULAR mode
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
