<p align="center">
  <img src="https://img.icons8.com/color/96/icloud.png" alt="iCloud Logo" width="80"/>
</p>

<h1 align="center">Apple MCP Server</h1>

<p align="center">
  <strong>Connect Claude to your Apple services via the Model Context Protocol</strong>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#installation">Installation</a> •
  <a href="#configuration">Configuration</a> •
  <a href="#tools">Tools</a> •
  <a href="#architecture">Architecture</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen" alt="Node Version"/>
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="License"/>
  <img src="https://img.shields.io/badge/MCP-compatible-purple" alt="MCP Compatible"/>
  <img src="https://img.shields.io/badge/macOS-AppleScript-orange" alt="macOS"/>
  <img src="https://img.shields.io/badge/iCloud-IMAP%20%7C%20CalDAV%20%7C%20CardDAV-lightgrey" alt="Protocols"/>
</p>

---

## Overview

This MCP server enables Claude to interact with your Apple services in two modes:

### Local Mode (Default) - macOS Only
Uses AppleScript to access native macOS apps. **Faster, works offline, more services.**

| Service | App | Tools |
|---------|-----|-------|
| **Email** | Mail.app | 6 |
| **Calendar** | Calendar.app | 5 |
| **Contacts** | Contacts.app | 5 |
| **Reminders** | Reminders.app | 7 |
| **Notes** | Notes.app | 5 |
| **Messages** | Messages.app | 1 |
| **Safari** | Safari.app | 4 |
| **Music** | Music.app | 7 |
| **iCloud Drive** | Local sync + icloud-tools CLI | 9 |

### Cloud Mode - Works Anywhere
Uses iCloud protocols (IMAP, CalDAV, CardDAV). Requires app-specific password.

| Service | Protocol | Endpoint |
|---------|----------|----------|
| **Email** | IMAP / SMTP | `imap.mail.me.com` / `smtp.mail.me.com` |
| **Calendar** | CalDAV | `caldav.icloud.com` |
| **Contacts** | CardDAV | `contacts.icloud.com` |

---

## Features

- **57 Tools** in local mode (17 in cloud mode)
- **Dual Mode** - switch between local (fast) and cloud (remote access)
- **9 Services** - Email, Calendar, Contacts, Reminders, Notes, Messages, Safari, Music, iCloud Drive (sync)
- **Secure Authentication** - AppleScript permissions or app-specific passwords
- **Full CRUD** - create, read, update, delete across services

---

## Installation

```bash
# Clone the repository
git clone https://github.com/MrGo2/icloud-mcp.git
cd icloud-mcp

# Install dependencies
npm install

# Configure (optional for local mode)
cp .env.example .env
```

---

## Configuration

### Local Mode (Default)

No configuration needed! Just run:

```bash
npm start
```

On first use, macOS will prompt for access to each app. Grant permission in **System Settings > Privacy & Security > Automation**.

### Cloud Mode

1. **Generate an App-Specific Password**
   - Go to [appleid.apple.com](https://appleid.apple.com)
   - Sign in → **Security** → **App-Specific Passwords** → **Generate**
   - Name it `iCloud MCP` and copy the 16-character password

2. **Configure `.env`**
   ```env
   USE_LOCAL_MODE=false
   ICLOUD_EMAIL=your-email@icloud.com
   ICLOUD_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
   ```

### Add to Claude Desktop

Add to your Claude Desktop MCP settings (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "apple": {
      "command": "node",
      "args": ["/path/to/icloud-mcp/index.js"]
    }
  }
}
```

---

## Tools

### Authentication (2)

| Tool | Description |
|------|-------------|
| `about` | Server information |
| `check-auth-status` | Verify credentials |

### Email (6)

| Tool | Description |
|------|-------------|
| `list-emails` | List emails from a folder |
| `read-email` | Read full email content |
| `send-email` | Compose and send email |
| `search-emails` | Search by criteria |
| `mark-as-read` | Mark read/unread |
| `list-folders` | List mail folders |

### Calendar (5)

| Tool | Description |
|------|-------------|
| `list-events` | List upcoming events |
| `list-calendars` | List all calendars |
| `create-event` | Create new event |
| `update-event` | Update existing event |
| `delete-event` | Delete an event |

### Contacts (5)

| Tool | Description |
|------|-------------|
| `list-contacts` | List contacts |
| `search-contacts` | Search by name/email |
| `read-contact` | Get contact details |
| `create-contact` | Create new contact |
| `delete-contact` | Delete a contact |

### Reminders (7) - Local Only

| Tool | Description |
|------|-------------|
| `list-reminder-lists` | List all reminder lists |
| `list-reminders` | List reminders from a list |
| `create-reminder` | Create new reminder |
| `update-reminder` | Update reminder |
| `complete-reminder` | Mark as complete |
| `delete-reminder` | Delete reminder |
| `search-reminders` | Search reminders |

### Notes (5) - Local Only

| Tool | Description |
|------|-------------|
| `list-note-folders` | List note folders |
| `list-notes` | List notes |
| `read-note` | Read note content |
| `create-note` | Create new note |
| `search-notes` | Search notes |

### Messages (1) - Local Only

| Tool | Description |
|------|-------------|
| `send-message` | Send iMessage/SMS |

### Safari (4) - Local Only

| Tool | Description |
|------|-------------|
| `list-safari-tabs` | List open tabs |
| `get-current-safari-url` | Get current tab URL |
| `open-safari-url` | Open URL in new tab |
| `close-safari-tab` | Close a tab |

### Music (7) - Local Only

| Tool | Description |
|------|-------------|
| `music-now-playing` | Current track and player state |
| `music-playback` | Play, pause, skip, etc. |
| `music-set-volume` | Set volume 0-100 |
| `music-list-playlists` | List user playlists |
| `music-play-playlist` | Play a playlist by name |
| `music-search-library` | Search library tracks |
| `music-play-track` | Play first search match |

### iCloud Drive (16) - Local Only

Reads the **local sync folder** (`~/Library/Mobile Documents/com~apple~CloudDocs`). For cloud-only files, install `icloud-tools` and use background download/evict tools.

| Tool | Description |
|------|-------------|
| `icloud-drive-info` | Show sync folder path + icloud-tools availability |
| `icloud-sync-status` | List local vs cloud-only files (icloud-tools) |
| `icloud-download` | Download cloud-only files in background |
| `icloud-evict` | Remove local copies, keep files in cloud |
| `icloud-move` | Move files/folders safely (icloud-tools) |
| `icloud-copy` | Copy files/folders safely (icloud-tools) |
| `icloud-mkdir` | Create folders |
| `icloud-rename` | Rename/move path |
| `icloud-delete` | Delete file/folder |
| `icloud-drive-summary` | Overview by top-level folder (size, file count) |
| `list-icloud-files` | List files/folders |
| `scan-icloud-drive` | Full inventory (paths, sizes, dates) |
| `search-icloud-files` | Search by name/path |
| `icloud-spotlight-search` | Search via macOS Spotlight index (`mdfind`) |
| `icloud-file-metadata` | Read Spotlight metadata (`mdls`) |
| `read-icloud-file` | Read text files (auto-download if cloud-only) |

---

## Architecture

```
icloud-mcp/
├── index.js              # MCP server (mode switching)
├── config.js             # Configuration
├── auth/                 # Credential management
├── email/
│   ├── imap-client.js    # Cloud: IMAP (ImapFlow)
│   ├── smtp-client.js    # Cloud: SMTP
│   ├── local-client.js   # Local: Mail.app
│   └── index.js
├── calendar/
│   ├── caldav-client.js  # Cloud: CalDAV
│   ├── local-client.js   # Local: Calendar.app
│   └── index.js
├── contacts/
│   ├── carddav-client.js # Cloud: CardDAV
│   ├── local-client.js   # Local: Contacts.app
│   └── index.js
├── reminders/            # Local only
├── notes/                # Local only
├── messages/             # Local only
├── safari/               # Local only
├── music/                # Local only (Music.app)
├── files/                # Local only (iCloud Drive sync folder)
└── utils/
    ├── applescript.js    # AppleScript executor
    ├── date-utils.js
    └── error-handler.js
```

---

## Usage Examples

### List Reminders
```
"Show me my reminders for today"
```

### Create a Reminder
```
"Create a reminder to buy milk tomorrow at 5pm"
```

### Send a Message
```
"Send an iMessage to +34612345678 saying I'll be there in 10 minutes"
```

### Check Safari Tabs
```
"What tabs do I have open in Safari?"
```

### Send Email
```
"Send an email to john@example.com with subject 'Meeting Tomorrow'"
```

---

## Mode Comparison

| Feature | Local Mode | Cloud Mode |
|---------|------------|------------|
| Speed | Fast (~100ms) | Slower (~500ms+) |
| Works offline | ✅ | ❌ |
| Remote access | ❌ | ✅ |
| Services | 9 | 3 |
| Tools | 44 | 17 |
| Requirements | macOS | App-specific password |

---

## Limitations

| Feature | Status | Reason |
|---------|--------|--------|
| Read Messages | ❌ | macOS security limitation |
| Edit Notes | ⚠️ Limited | AppleScript limitation |
| iCloud Drive (full cloud API) | ⚠️ Partial | Local sync folder only via `files/` tools; no CloudKit |
| HomeKit | ❌ | No AppleScript API; use a dedicated HomeKit MCP |
| Find My | ❌ | Internal API only |

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| **Permission denied** | Grant access in System Settings > Privacy & Security > Automation |
| **App not responding** | Make sure the app (Mail, Calendar, etc.) is running |
| **Authentication failed** (cloud) | Use app-specific password, not Apple ID password |
| **IMAP timeout** (cloud) | iCloud servers can be slow - retry |

---

## Development

```bash
# Run in local mode (default)
npm start

# Run in cloud mode
USE_LOCAL_MODE=false npm start

# Test with MCP Inspector
npm run inspect
```

---

## License

MIT © [Carlos Lorenzo](https://github.com/MrGo2)

---

<p align="center">
  <sub>Built for use with <a href="https://claude.ai">Claude</a> and the <a href="https://modelcontextprotocol.io">Model Context Protocol</a></sub>
</p>
