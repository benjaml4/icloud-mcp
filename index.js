#!/usr/bin/env node

/**
 * iCloud MCP Server
 *
 * Provides Claude with access to Apple services:
 * - Email (via IMAP/SMTP or Mail.app)
 * - Calendar (via CalDAV or Calendar.app)
 * - Contacts (via CardDAV or Contacts.app)
 * - Reminders (via Reminders.app - local only)
 * - Notes (via Notes.app - local only)
 * - Messages (via Messages.app - local only)
 * - Safari (via Safari.app - local only)
 * - Music (via Music.app - local only)
 * - iCloud Drive files (local sync folder - local only)
 *
 * Modes:
 * - LOCAL (default): Uses AppleScript to access native macOS apps (fast, requires Mac)
 * - CLOUD: Uses iCloud protocols (IMAP, CalDAV, CardDAV) - works from anywhere
 *
 * Transports:
 * - stdio (default): JSON-RPC over stdin/stdout — for local MCP clients
 * - HTTP: HTTP server with optional ScaleKit OAuth 2.1 — for remote/cloud deployment
 *   Set HTTP_PORT env var to enable HTTP mode.
 *   Set SCALEKIT_ENVIRONMENT_URL, SCALEKIT_CLIENT_ID, SCALEKIT_CLIENT_SECRET for OAuth.
 */

// Load .env silently. Node 22+ has process.loadEnvFile() built-in.
try {
  process.loadEnvFile();
} catch (e) {
  // .env not present — env vars may be set externally
}

const readline = require('readline');
const config = require('./config');

// Import auth module
const { authTools } = require('./auth');

// === ScaleKit OAuth 2.1 Setup (optional — only if env vars are set) ===
let scalekit = null;
let RESOURCE_ID = null;
let METADATA_ENDPOINT = null;

if (process.env.SCALEKIT_ENVIRONMENT_URL && process.env.SCALEKIT_CLIENT_ID) {
  try {
    const { Scalekit } = require('@scalekit-sdk/node');
    scalekit = new Scalekit(
      process.env.SCALEKIT_ENVIRONMENT_URL,
      process.env.SCALEKIT_CLIENT_ID,
      process.env.SCALEKIT_CLIENT_SECRET
    );
    RESOURCE_ID = process.env.RESOURCE_ID;
    METADATA_ENDPOINT = `${RESOURCE_ID}/.well-known/oauth-protected-resource`;
    console.error('[icloud-mcp] ScaleKit OAuth enabled');
  } catch (e) {
    console.error('[icloud-mcp] ScaleKit SDK not installed — OAuth disabled');
  }
}

// Determine which tools to load based on mode
let TOOLS = [...authTools];
let MODE = 'cloud';

if (config.USE_LOCAL_MODE && config.IS_MACOS) {
  MODE = 'local';

  const { remindersTools } = require('./reminders');
  const { notesTools } = require('./notes');
  const { messagesTools } = require('./messages');
  const { safariTools } = require('./safari');
  const { musicTools } = require('./music');
  const { filesTools } = require('./files');
  const { emailTools } = require('./email');
  const { calendarTools } = require('./calendar');
  const { contactsTools } = require('./contacts');

  TOOLS = [
    ...authTools,
    ...emailTools,
    ...calendarTools,
    ...contactsTools,
    ...remindersTools,
    ...notesTools,
    ...messagesTools,
    ...safariTools,
    ...musicTools,
    ...filesTools
  ];

} else if (config.USE_LOCAL_MODE && !config.IS_MACOS) {
  MODE = 'cloud (fallback - not macOS)';

  const { emailTools } = require('./email');
  const { calendarTools } = require('./calendar');
  const { contactsTools } = require('./contacts');

  TOOLS = [
    ...authTools,
    ...emailTools,
    ...calendarTools,
    ...contactsTools
  ];

} else {
  MODE = 'cloud';

  const { emailTools } = require('./email');
  const { calendarTools } = require('./calendar');
  const { contactsTools } = require('./contacts');

  TOOLS = [
    ...authTools,
    ...emailTools,
    ...calendarTools,
    ...contactsTools
  ];
}

// Server info
const SERVER_INFO = {
  name: 'icloud-mcp',
  version: '2.0.0',
  description: `MCP server for Apple services (Mode: ${MODE})`
};

/**
 * ScaleKit Auth Helper — only active if ScaleKit is configured
 */
async function authenticateRequest(req) {
  if (!scalekit) return true;

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.split('Bearer ')[1]?.trim()
    : null;

  if (!token) {
    throw new Error('Missing Bearer token');
  }

  try {
    await scalekit.validateToken(token, { audience: [RESOURCE_ID] });
    return true;
  } catch (err) {
    console.error('Token validation failed:', err.message);
    throw new Error('Invalid token');
  }
}

/**
 * Handle MCP JSON-RPC request
 */
async function handleRequest(request) {
  const { method, params, id } = request;

  try {
    switch (method) {
      case 'initialize':
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            serverInfo: SERVER_INFO,
            capabilities: {
              tools: {}
            }
          }
        };

      case 'notifications/initialized':
        return null;

      case 'tools/list':
        return {
          jsonrpc: '2.0',
          id,
          result: {
            tools: TOOLS.map(tool => ({
              name: tool.name,
              description: tool.description,
              inputSchema: tool.inputSchema
            }))
          }
        };

      case 'tools/call':
        const toolName = params?.name;
        const toolArgs = params?.arguments || {};

        const tool = TOOLS.find(t => t.name === toolName);
        if (!tool) {
          return {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32601,
              message: `Unknown tool: ${toolName}`
            }
          };
        }

        console.error(`[icloud-mcp] Calling tool: ${toolName}`);

        const result = await tool.handler(toolArgs);

        return {
          jsonrpc: '2.0',
          id,
          result
        };

      default:
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: `Unknown method: ${method}`
          }
        };
    }
  } catch (error) {
    console.error(`[icloud-mcp] Error handling ${method}:`, error.message);
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32603,
        message: error.message
      }
    };
  }
}

/**
 * Start MCP server in stdio mode (default)
 */
function startStdioServer() {
  console.error(`[icloud-mcp] Starting in stdio mode (Mode: ${MODE})`);

  if (MODE === 'local') {
    console.error('[icloud-mcp] Services: Email, Calendar, Contacts, Reminders, Notes, Messages, Safari, Music, iCloud Drive');
  } else {
    console.error('[icloud-mcp] Services: Email, Calendar, Contacts');
    console.error(`[icloud-mcp] Credentials configured: ${!!(config.ICLOUD_EMAIL && config.ICLOUD_APP_PASSWORD)}`);
  }

  if (config.USE_TEST_MODE) {
    console.error('[icloud-mcp] TEST MODE ENABLED');
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });

  let buffer = '';

  rl.on('line', async (line) => {
    buffer += line;

    try {
      const request = JSON.parse(buffer);
      buffer = '';

      const response = await handleRequest(request);

      if (response) {
        process.stdout.write(JSON.stringify(response) + '\n');
      }
    } catch (e) {
      if (!(e instanceof SyntaxError)) {
        console.error('[icloud-mcp] Parse error:', e.message);
        buffer = '';
      }
    }
  });

  rl.on('close', () => {
    console.error('[icloud-mcp] Server shutting down');
    process.exit(0);
  });
}

/**
 * Start MCP server in HTTP mode (with optional ScaleKit OAuth)
 */
function startHttpServer() {
  const http = require('http');
  const PORT = process.env.HTTP_PORT || 8080;

  console.error(`[icloud-mcp] Starting in HTTP mode on port ${PORT} (Mode: ${MODE})`);
  console.error(`[icloud-mcp] OAuth: ${scalekit ? 'enabled' : 'disabled'}`);

  const httpServer = http.createServer(async (req, res) => {
    // Health check
    if (req.method === 'GET' && req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        name: SERVER_INFO.name,
        version: SERVER_INFO.version,
        mode: MODE,
        tools: TOOLS.length,
        oauth: scalekit ? 'enabled' : 'disabled'
      }));
      return;
    }

    // Protected Resource Metadata (for OAuth discovery)
    if (req.method === 'GET' && req.url === '/.well-known/oauth-protected-resource') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        resource: RESOURCE_ID,
        authorization_servers: [process.env.SCALEKIT_ENVIRONMENT_URL],
        bearer_methods_supported: ['header'],
        scopes_supported: ['read', 'write', 'tools:execute', 'openid', 'profile']
      }));
      return;
    }

    // Main MCP endpoint
    if (req.method === 'POST' && (req.url === '/' || req.url === '/mcp')) {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const requestJson = JSON.parse(body);
          const method = requestJson.method;

          // Allow discovery methods without token
          const isDiscovery = ['initialize', 'tools/list', 'ping'].includes(method);

          if (!isDiscovery) {
            await authenticateRequest(req);
          }

          const response = await handleRequest(requestJson);

          if (response) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(response));
          } else {
            res.writeHead(204).end();
          }
        } catch (e) {
          console.error('[icloud-mcp] Auth or request error:', e.message);

          const headers = { 'Content-Type': 'application/json' };
          if (METADATA_ENDPOINT) {
            headers['WWW-Authenticate'] = `Bearer realm="MCP Server", resource_metadata="${METADATA_ENDPOINT}"`;
          }

          res.writeHead(401, headers);
          res.end(JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32000, message: 'Unauthorized' }
          }));
        }
      });
      return;
    }

    // GET probe on MCP endpoint
    if (req.method === 'GET' && (req.url === '/' || req.url === '/mcp')) {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Use POST for MCP requests' }));
      return;
    }

    res.writeHead(404).end();
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.error(`[icloud-mcp] HTTP server listening on port ${PORT}`);
    if (RESOURCE_ID) {
      console.error(`[icloud-mcp] Resource: ${RESOURCE_ID}`);
      console.error(`[icloud-mcp] Metadata: ${RESOURCE_ID}/.well-known/oauth-protected-resource`);
    }
  });
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.error('[icloud-mcp] Received SIGINT, shutting down');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.error('[icloud-mcp] Received SIGTERM, shutting down');
  process.exit(0);
});

// Start the server — HTTP mode if HTTP_PORT is set, otherwise stdio
if (process.env.HTTP_PORT) {
  startHttpServer();
} else {
  startStdioServer();
}