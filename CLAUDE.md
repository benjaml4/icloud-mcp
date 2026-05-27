# iCloud MCP Server

This MCP server provides Claude with access to Apple services via two modes:

## Modes

| Mode | Description | Services | Requirements |
|------|-------------|----------|--------------|
| **LOCAL** (default) | AppleScript access to macOS apps | 7 services, 31 tools | macOS |
| **CLOUD** | iCloud protocols (IMAP, CalDAV, CardDAV) | 3 services, 17 tools | App-specific password |

## Services Available

### Local Mode (macOS only)

| Service | Protocol | Tools |
|---------|----------|-------|
| **Email** | Mail.app (AppleScript) | 6 |
| **Calendar** | Calendar.app (AppleScript) | 5 |
| **Contacts** | Contacts.app (AppleScript) | 5 |
| **Reminders** | Reminders.app (AppleScript) | 7 |
| **Notes** | Notes.app (AppleScript) | 5 |
| **Messages** | Messages.app (AppleScript) | 1 |
| **Safari** | Safari.app (AppleScript) | 4 |
| **Music** | Music.app (AppleScript) | 7 |
| **iCloud Drive** | Local sync + icloud-tools + Spotlight | 16 |

### Cloud Mode

| Service | Protocol | Endpoint |
|---------|----------|----------|
| **Email** | IMAP/SMTP | imap.mail.me.com / smtp.mail.me.com |
| **Calendar** | CalDAV | caldav.icloud.com |
| **Contacts** | CardDAV | contacts.icloud.com |

## Development Commands

```bash
npm install          # Install dependencies
npm start            # Start server (local mode by default)
npm run inspect      # Test with @modelcontextprotocol/inspector

# Cloud mode
USE_LOCAL_MODE=false npm start
```

## Configuration

```env
# .env file
USE_LOCAL_MODE=true    # true=AppleScript (fast), false=iCloud protocols

# Only needed for cloud mode:
ICLOUD_EMAIL=your-email@icloud.com
ICLOUD_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
```

## Architecture

```
icloud-mcp/
├── index.js              # Main MCP server (mode switching)
├── config.js             # Configuration
├── auth/                 # Credential management
├── email/                # Email module
│   ├── imap-client.js    # Cloud: IMAP (ImapFlow)
│   ├── smtp-client.js    # Cloud: SMTP
│   ├── local-client.js   # Local: Mail.app
│   └── index.js          # Tool definitions
├── calendar/             # Calendar module
│   ├── caldav-client.js  # Cloud: CalDAV
│   ├── local-client.js   # Local: Calendar.app
│   └── index.js
├── contacts/             # Contacts module
│   ├── carddav-client.js # Cloud: CardDAV
│   ├── local-client.js   # Local: Contacts.app
│   └── index.js
├── reminders/            # Reminders (local only)
│   ├── local-client.js
│   └── index.js
├── notes/                # Notes (local only)
│   ├── local-client.js
│   └── index.js
├── messages/             # Messages (local only)
│   ├── local-client.js
│   └── index.js
├── safari/               # Safari (local only)
├── music/                # Music.app (local only)
├── files/                # iCloud Drive sync folder (local only)
└── utils/
    ├── applescript.js    # AppleScript executor
    ├── date-utils.js
    └── error-handler.js
```

## Tools (57 total in local mode)

### Auth (2)
- `about` - Server information
- `check-auth-status` - Verify credentials

### Email (6)
- `list-emails` - List emails from folder
- `read-email` - Read email content
- `send-email` - Send email
- `search-emails` - Search by criteria
- `mark-as-read` - Mark read/unread
- `list-folders` - List mail folders

### Calendar (5)
- `list-events` - List upcoming events
- `list-calendars` - List calendars
- `create-event` - Create event
- `update-event` - Update event
- `delete-event` - Delete event

### Contacts (5)
- `list-contacts` - List contacts
- `search-contacts` - Search contacts
- `read-contact` - Get contact details
- `create-contact` - Create contact
- `delete-contact` - Delete contact

### Reminders (7) - Local only
- `list-reminder-lists` - List reminder lists
- `list-reminders` - List reminders
- `create-reminder` - Create reminder
- `update-reminder` - Update reminder
- `complete-reminder` - Mark complete
- `delete-reminder` - Delete reminder
- `search-reminders` - Search reminders

### Notes (5) - Local only
- `list-note-folders` - List folders
- `list-notes` - List notes
- `read-note` - Read note content
- `create-note` - Create note
- `search-notes` - Search notes

### Messages (1) - Local only
- `send-message` - Send iMessage/SMS

### Safari (4) - Local only
- `list-safari-tabs` - List open tabs
- `get-current-safari-url` - Get current URL
- `open-safari-url` - Open URL
- `close-safari-tab` - Close tab

## Permissions (macOS)

When first used, macOS will prompt for access to:
- Mail
- Calendar
- Contacts
- Reminders
- Notes
- Messages
- Safari

Grant access in **System Settings > Privacy & Security > Automation**.

## Limitations

| Feature | Status | Reason |
|---------|--------|--------|
| iCloud Drive (CloudKit API) | ⚠️ | Local sync folder only in `files/` |
| HomeKit | ❌ | No AppleScript API |
| Find My | ❌ | Internal API only |
| Read Messages | ❌ | macOS limitation |
| Edit Notes | ⚠️ Limited | AppleScript limitation |
