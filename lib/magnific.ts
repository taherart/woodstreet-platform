/**
 * Magnific MCP Client — Real API integration
 * Connects to Magnific MCP server via SSE transport with OAuth
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { SPACE_ID } from './woodstreet-nodes';

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
    const raw = readFileSync(TOKENS_PATH, 'utf-8');
    const tokens: TokenData = JSON.parse(raw);

    if (tokens.expires_at && tokens.expires_at < Date.now() / 1000 + 30) {
      console.log('[Magnific] Token expired, refreshing...');
      return refreshToken(tokens);
    }

    return tokens.access_token;
  } catch (err) {
    console.error('[Magnific] Failed to load token:', err);
    return null;
  }
}

async function refreshToken(tokens: TokenData): Promise<string | null> {
  if (!tokens.refresh_token) return null;

  try {
    const meta = JSON.parse(readFileSync(META_PATH, 'utf-8'));
    const response = await fetch(meta.token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh_token,
        client_id: 'mcp-client',
      }),
    });

    if (!response.ok) {
      console.error('[Magnific] Token refresh failed:', response.status);
      return null;
    }

    const newTokens = await response.json();
    const updated: TokenData = {
      access_token: newTokens.access_token,
      refresh_token: newTokens.refresh_token || tokens.refresh_token,
      expires_at: (Date.now() / 1000) + (newTokens.expires_in || 3600),
    };
    writeFileSync(TOKENS_PATH, JSON.stringify(updated, null, 2));
    console.log('[Magnific] Token refreshed');
    return updated.access_token;
  } catch (err) {
    console.error('[Magnific] Token refresh error:', err);
    return null;
  }
}

let client: Client | null = null;
let transport: SSEClientTransport | null = null;

async function getClient(): Promise<Client> {
  if (client) return client;

  const token = await loadAccessToken();
  if (!token) throw new Error('No Magnific access token. Run: hermes mcp login magnific');

  const url = new URL(MAGNIFIC_MCP_URL + '/sse');

  transport = new SSEClientTransport(url, {
    requestInit: {
      headers: { Authorization: `Bearer ${token}` },
    },
  });

  client = new Client(
    { name: 'woodstreet-platform', version: '1.0.0' },
    { capabilities: {} }
  );

  await client.connect(transport);
  console.log('[Magnific] MCP client connected');
  return client;
}

export async function runSpace(productImageUrl: string, selectedNodeIds: string[]): Promise<string> {
  const c = await getClient();

  // Upload the product image to Magnific
  const uploadResult = await c.callTool({
    name: 'creations_upload_image',
    arguments: { url: productImageUrl },
  });
  console.log('[Magnific] Upload result keys:', Object.keys(uploadResult));

  // Extract creation identifier
  const uploadText = extractTextContent(uploadResult);
  const creationId = extractId(uploadText);
  if (!creationId) throw new Error('Failed to get creation ID from upload');

  console.log('[Magnific] Image uploaded, creation ID:', creationId);

  // Set the input node image  
  await c.callTool({
    name: 'spaces_add_creations',
    arguments: {
      spaceId: SPACE_ID,
      creationIdentifiers: [creationId],
    },
  });

  // Now run the space
  const runResult = await c.callTool({
    name: 'spaces_run',
    arguments: {
      spaceId: SPACE_ID,
      startNodeId: 'cc6739fc-4f96-46a8-8db8-c730befb1c66',
      mode: 'downstream',
    },
  });

  const runText = extractTextContent(runResult);
  const runId = extractId(runText, 'workflowRunIdentifier');
  if (!runId) throw new Error('Failed to get workflow run ID');

  console.log('[Magnific] Workflow started:', runId);
  return runId;
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

export async function getCreation(creationId: string) {
  const c = await getClient();
  const result = await c.callTool({
    name: 'creations_get',
    arguments: { creationIdentifier: creationId },
  });
  const text = extractTextContent(result);
  try { return JSON.parse(text); } catch { return { rawText: text }; }
}

export async function downloadCreationToBuffer(creationId: string): Promise<Buffer | null> {
  const creation = await getCreation(creationId);
  const url = creation?.url || creation?.previewUrl || creation?.results?.url;
  if (!url) return null;
  const response = await fetch(url);
  if (!response.ok) return null;
  return Buffer.from(await response.arrayBuffer());
}

export async function disconnect() {
  if (transport) { await transport.close(); transport = null; }
  client = null;
}

// Helpers
function extractTextContent(result: any): string {
  if (typeof result === 'string') return result;
  if (result?.content && Array.isArray(result.content)) {
    return result.content
      .filter((c: any) => c.type === 'text')
      .map((c: any) => c.text)
      .join('\n');
  }
  return JSON.stringify(result);
}

function extractId(text: string, key?: string): string {
  try {
    const parsed = JSON.parse(text);
    if (key) return parsed[key] || parsed.structuredContent?.[key] || '';
    return parsed.identifier || parsed.creationIdentifier || parsed.id || '';
  } catch {
    const searchKey = key || 'identifier';
    const match = text.match(new RegExp(`"${searchKey}"\\s*:\\s*"([^"]+)"`));
    return match?.[1] || '';
  }
}
