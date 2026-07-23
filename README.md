<p align="center">
  <img src="https://img.icons8.com/color/96/icloud.png" alt="iCloud Logo" width="80"/>
</p>

<h1 align="center">Apple MCP Server</h1>

<p align="center">
  A Model Context Protocol server for Apple/iCloud services — 59 tools across 9 services.
</p>

## Features

- **Email** (10 tools) — list, read, send, search, mark read, archive, delete, list folders
- **Calendar** (4 tools) — list events, create event, delete event, list calendars
- **Contacts** (5 tools) — list, search, read, create, delete
- **Reminders** (7 tools) — list lists, list, create, update, complete, delete, search
- **Notes** (5 tools) — list folders, list, read, create, search
- **Messages** (1 tool) — send iMessage/SMS
- **Safari** (4 tools) — list tabs, get current URL, open URL, close tab
- **Music** (7 tools) — now playing, playback control, volume, playlists, search, play
- **iCloud Drive** (16 tools) — list, scan, search, read, download, evict, move, copy, mkdir, rename, delete, Spotlight, metadata

## Modes

- **LOCAL** (default on macOS): Uses AppleScript for native app access — all 59 tools
- **CLOUD** (non-macOS or `USE_LOCAL_MODE=false`): Uses IMAP/CalDAV/CardDAV — 19 tools (Email, Calendar, Contacts)

## Transports

- **stdio** (default): JSON-RPC over stdin/stdout — for local MCP clients (Claude Desktop, OpenClaw, etc.)
- **HTTP**: Set `HTTP_PORT` env var — serves JSON-RPC over HTTP with optional OAuth

## Setup

### Prerequisites

- Node.js 18+ (22+ recommended for `process.loadEnvFile()`)
- iCloud account with app-specific password ([generate one here](https://appleid.apple.com))
- macOS required for LOCAL mode (Reminders, Notes, Messages, Safari, Music, iCloud Drive)

### Installation

```bash
git clone https://github.com/benjaml4/icloud-mcp.git
cd icloud-mcp
npm install
```

### Configuration

Create a `.env` file (or set env vars):

```env
ICLOUD_MAIL_ADDRESS=your_email@icloud.com
ICLOUD_APP_PASSWORD=your_app_specific_password
USE_LOCAL_MODE=true
```

### Optional: ScaleKit OAuth 2.1 (for HTTP mode)

```env
HTTP_PORT=8080
SCALEKIT_ENVIRONMENT_URL=https://your-environment.scalekit.com
SCALEKIT_CLIENT_ID=your_client_id
SCALEKIT_CLIENT_SECRET=your_client_secret
RESOURCE_ID=https://your-deployment-url.com
```

### Optional: iCloud Drive tools

Some iCloud Drive tools (`icloud-sync-status`, `icloud-download`, `icloud-evict`, `icloud-move`, `icloud-copy`) require the [icloud-tools](https://github.com/icloud-tools) CLI:

```bash
brew install icloud-tools
```

## Usage

### stdio mode (local MCP clients)

Add to your MCP client config (e.g., Claude Desktop, OpenClaw):

```json
{
  "mcpServers": {
    "icloud-mcp": {
      "command": "node",
      "args": ["/path/to/icloud-mcp/index.js"]
    }
  }
}
```

### HTTP mode (remote deployment)

```bash
HTTP_PORT=8080 node index.js
```

Then POST JSON-RPC requests to `http://localhost:8080/` or `http://localhost:8080/mcp`.

## Credits

This is a merge of four forks of [MrGo2/icloud-mcp](https://github.com/MrGo2/icloud-mcp):

| Fork | Contributions |
|------|--------------|
| [asappia](https://github.com/asappia/icloud-mcp) | Music (7 tools), iCloud Drive (16 tools), config.js improvements, imapflow migration, calendar date fix |
| [DanBennettUK](https://github.com/DanBennettUK/icloud-mcp) | archive-email, delete-email, HTTP transport (api/mcp.js, vercel.json), env var fallbacks |
| [andre-karrlein](https://github.com/andre-karrlein/icloud-mcp) | ScaleKit OAuth 2.1 (optional), HTTP server mode |
| [MrGo2](https://github.com/MrGo2/icloud-mcp) (upstream) | Base server: Email, Calendar, Contacts, Reminders, Notes, Messages, Safari |

## License

MIT
