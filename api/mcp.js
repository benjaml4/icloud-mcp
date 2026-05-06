const config = require('../config');
const { authTools } = require('../auth');

let TOOLS = [...authTools];
let MODE = 'cloud';

if (config.USE_LOCAL_MODE && config.IS_MACOS) {
  MODE = 'local';

  const { remindersTools } = require('../reminders');
  const { notesTools } = require('../notes');
  const { messagesTools } = require('../messages');
  const { safariTools } = require('../safari');
  const { emailTools } = require('../email');
  const { calendarTools } = require('../calendar');
  const { contactsTools } = require('../contacts');

  TOOLS = [
    ...authTools,
    ...emailTools,
    ...calendarTools,
    ...contactsTools,
    ...remindersTools,
    ...notesTools,
    ...messagesTools,
    ...safariTools,
  ];
} else if (config.USE_LOCAL_MODE && !config.IS_MACOS) {
  MODE = 'cloud (fallback - not macOS)';

  const { emailTools } = require('../email');
  const { calendarTools } = require('../calendar');
  const { contactsTools } = require('../contacts');

  TOOLS = [
    ...authTools,
    ...emailTools,
    ...calendarTools,
    ...contactsTools,
  ];
} else {
  MODE = 'cloud';

  const { emailTools } = require('../email');
  const { calendarTools } = require('../calendar');
  const { contactsTools } = require('../contacts');

  TOOLS = [
    ...authTools,
    ...emailTools,
    ...calendarTools,
    ...contactsTools,
  ];
}

const SERVER_INFO = {
  name: 'icloud-mcp',
  version: '2.0.0',
  description: `MCP server for Apple services (Mode: ${MODE})`,
};

async function handleRequest(request) {
  const { method, params, id } = request || {};

  try {
    switch (method) {
      case 'initialize': {
        const requestedVersion = params?.protocolVersion;
        const protocolVersion = requestedVersion === '2025-03-26' ? '2025-03-26' : '2024-11-05';
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion,
            serverInfo: SERVER_INFO,
            capabilities: {
              tools: {},
            },
          },
        };
      }

      case 'notifications/initialized':
        return null;

      case 'tools/list':
        return {
          jsonrpc: '2.0',
          id,
          result: {
            tools: TOOLS.map((tool) => ({
              name: tool.name,
              description: tool.description,
              inputSchema: tool.inputSchema,
            })),
          },
        };

      case 'tools/call': {
        const toolName = params?.name;
        const toolArgs = params?.arguments || {};
        const tool = TOOLS.find((t) => t.name === toolName);

        if (!tool) {
          return {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32601,
              message: `Unknown tool: ${toolName}`,
            },
          };
        }

        console.error(`[icloud-mcp] Calling tool: ${toolName}`);
        const result = await tool.handler(toolArgs);
        return {
          jsonrpc: '2.0',
          id,
          result,
        };
      }

      default:
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: `Unknown method: ${method}`,
          },
        };
    }
  } catch (error) {
    console.error(`[icloud-mcp] Error handling ${method}:`, error && error.message ? error.message : error);
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32603,
        message: error && error.message ? error.message : 'Unknown error',
      },
    };
  }
}

function sendJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function readBody(req) {
  if (typeof req.body !== 'undefined') {
    return Promise.resolve(req.body);
  }

  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, MCP-Protocol-Version, MCP-Session-Id');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method === 'GET') {
    const accept = String(req.headers.accept || '');

    if (accept.includes('text/event-stream')) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.write('event: endpoint\n');
      res.write('data: /api/mcp\n\n');

      const keepAlive = setInterval(() => {
        res.write(': keep-alive\n\n');
      }, 15000);

      req.on('close', () => {
        clearInterval(keepAlive);
        res.end();
      });
      return;
    }

    sendJson(res, 200, {
      ok: true,
      serverInfo: SERVER_INFO,
      mode: MODE,
      tools: TOOLS.map((tool) => tool.name),
      endpoints: {
        mcp: '/api/mcp',
        sse: '/api/mcp',
      },
    });
    return;
  }

  if (req.method === 'POST') {
    try {
      let body = await readBody(req);
      if (Buffer.isBuffer(body)) {
        body = body.toString('utf8');
      }

      const request = typeof body === 'object' ? body : JSON.parse(body || '{}');
      const response = await handleRequest(request);

      if (response === null) {
        res.statusCode = 204;
        res.end();
        return;
      }

      sendJson(res, 200, response);
    } catch (error) {
      console.error('[icloud-mcp] HTTP handler error:', error && error.message ? error.message : error);
      sendJson(res, 400, {
        jsonrpc: '2.0',
        error: {
          code: -32700,
          message: 'Invalid JSON request',
        },
        id: null,
      });
    }
    return;
  }

  res.statusCode = 405;
  res.setHeader('Allow', 'GET,POST,OPTIONS');
  res.end('Method Not Allowed');
};

module.exports.SERVER_INFO = SERVER_INFO;
module.exports.handleRequest = handleRequest;
