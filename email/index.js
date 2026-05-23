/**
 * Email module for iCloud MCP
 * Provides email tools via IMAP/SMTP
 */

const { listEmails, readEmail, searchEmails, markAsRead, moveEmail, bulkMarkAsRead, listFolders } = require('./imap-client');
const { sendEmail } = require('./smtp-client');
const { formatSuccess, formatError, withErrorHandler } = require('../utils/error-handler');
const { formatDate, formatRelative } = require('../utils/date-utils');
const config = require('../config');

function getDefaultFolderName(alias, fallback) {
  return config.EMAIL_FOLDERS[alias] || fallback;
}

/**
 * Handler: List emails
 */
async function handleListEmails(args) {
  const folder = args.folder || 'inbox';
  const count = Math.min(args.count || 25, config.DEFAULTS.MAX_RESULTS);

  const emails = await listEmails(folder, count);

  if (emails.length === 0) {
    return formatSuccess(`No emails found in ${folder}.`);
  }

  const lines = emails.map((email, i) => {
    const unread = !email.flags.includes('\\Seen') ? '[UNREAD] ' : '';
    const date = formatRelative(new Date(email.date));
    return `${i + 1}. ${unread}${email.subject}\n   From: ${email.from}\n   Date: ${date}\n   UID: ${email.uid}`;
  });

  return formatSuccess(`Emails in ${folder} (${emails.length}):\n\n${lines.join('\n\n')}`);
}

/**
 * Handler: Read email
 */
async function handleReadEmail(args) {
  if (!args.uid) {
    return formatError(new Error('Email UID is required'));
  }

  const folder = args.folder || 'inbox';
  const email = await readEmail(args.uid, folder);

  let body = email.text || '';
  if (body.length > config.DEFAULTS.EMAIL_BODY_MAX_LENGTH) {
    body = body.substring(0, config.DEFAULTS.EMAIL_BODY_MAX_LENGTH) + '\n... (truncated)';
  }

  const attachmentInfo = email.attachments.length > 0
    ? `\n\nAttachments (${email.attachments.length}):\n${email.attachments.map(a => `- ${a.filename} (${a.contentType}, ${Math.round(a.size / 1024)}KB)`).join('\n')}`
    : '';

  return formatSuccess(
    `Subject: ${email.subject}
From: ${email.from}
To: ${email.to}${email.cc ? `\nCC: ${email.cc}` : ''}
Date: ${formatDate(email.date)}
UID: ${email.uid}

---

${body}${attachmentInfo}`
  );
}

/**
 * Handler: Send email
 */
async function handleSendEmail(args) {
  if (!args.to) {
    return formatError(new Error('Recipient (to) is required'));
  }
  if (!args.subject) {
    return formatError(new Error('Subject is required'));
  }
  if (!args.body) {
    return formatError(new Error('Body is required'));
  }

  const result = await sendEmail({
    to: args.to,
    cc: args.cc,
    bcc: args.bcc,
    subject: args.subject,
    body: args.body,
    isHtml: args.isHtml || false
  });

  if (result.success) {
    return formatSuccess(
      `Email sent successfully!\n\nTo: ${args.to}${args.cc ? `\nCC: ${args.cc}` : ''}\nSubject: ${args.subject}\nMessage ID: ${result.messageId}`
    );
  } else {
    return formatError(new Error('Failed to send email'));
  }
}

/**
 * Handler: Search emails
 */
async function handleSearchEmails(args) {
  const folder = args.folder || 'inbox';
  const count = Math.min(args.count || 25, config.DEFAULTS.MAX_RESULTS);

  const criteria = {};
  if (args.from) criteria.from = args.from;
  if (args.subject) criteria.subject = args.subject;
  if (args.query) criteria.text = args.query;
  if (args.unreadOnly) criteria.unseen = true;

  const emails = await searchEmails(criteria, folder, count);

  if (emails.length === 0) {
    return formatSuccess(`No emails found matching your search criteria in ${folder}.`);
  }

  const lines = emails.map((email, i) => {
    const unread = !email.flags.includes('\\Seen') ? '[UNREAD] ' : '';
    const date = formatRelative(new Date(email.date));
    return `${i + 1}. ${unread}${email.subject}\n   From: ${email.from}\n   Date: ${date}\n   UID: ${email.uid}`;
  });

  return formatSuccess(`Search results in ${folder} (${emails.length}):\n\n${lines.join('\n\n')}`);
}

/**
 * Handler: Mark as read
 */
async function handleMarkAsRead(args) {
  if (!args.uid) {
    return formatError(new Error('Email UID is required'));
  }

  const folder = args.folder || 'inbox';
  const isRead = args.isRead !== false;

  await markAsRead(args.uid, folder, isRead);

  return formatSuccess(`Email ${args.uid} marked as ${isRead ? 'read' : 'unread'}.`);
}

/**
 * Handler: Move email
 */
async function handleMoveEmail(args) {
  if (!args.uid) {
    return formatError(new Error('Email UID is required'));
  }
  if (!args.targetFolder) {
    return formatError(new Error('Target folder is required'));
  }

  const sourceFolder = args.sourceFolder || args.folder || 'inbox';
  const result = await moveEmail(args.uid, sourceFolder, args.targetFolder);

  return formatSuccess(
    `Email ${args.uid} moved from ${result.sourceFolder} to ${result.targetFolder}.`
  );
}

/**
 * Handler: Archive email
 */
async function handleArchiveEmail(args) {
  if (!args.uid) {
    return formatError(new Error('Email UID is required'));
  }

  const folder = args.folder || 'inbox';
  const archiveFolder = args.archiveFolder || getDefaultFolderName('archive', 'Archive');
  const result = await moveEmail(args.uid, folder, archiveFolder);

  return formatSuccess(
    `Email ${args.uid} archived from ${result.sourceFolder} to ${result.targetFolder}.`
  );
}

/**
 * Handler: Move email to trash
 */
async function handleMoveToTrash(args) {
  if (!args.uid) {
    return formatError(new Error('Email UID is required'));
  }

  const folder = args.folder || 'inbox';
  const trashFolder = args.trashFolder || getDefaultFolderName('trash', 'Trash');
  const result = await moveEmail(args.uid, folder, trashFolder);

  return formatSuccess(
    `Email ${args.uid} moved from ${result.sourceFolder} to ${result.targetFolder}.`
  );
}

/**
 * Handler: Bulk mark as read/unread
 */
async function handleBulkMarkAsRead(args) {
  if (!Array.isArray(args.uids) || args.uids.length === 0) {
    return formatError(new Error('At least one email UID is required'));
  }

  const folder = args.folder || 'inbox';
  const isRead = args.isRead !== false;
  const result = await bulkMarkAsRead(args.uids, folder, isRead);
  const action = isRead ? 'read' : 'unread';

  if (result.failures.length === 0) {
    return formatSuccess(`Marked ${result.count} email(s) as ${action} in ${result.folder}.`);
  }

  const failures = result.failures
    .map(failure => `- ${failure.uid}: ${failure.error}`)
    .join('\n');

  return formatSuccess(
    `Marked ${result.count} email(s) as ${action} in ${result.folder}.\n\nFailures (${result.failures.length}):\n${failures}`
  );
}

/**
 * Handler: List folders
 */
async function handleListFolders() {
  const folders = await listFolders();

  const lines = folders.map(f => `- ${f.name}`);

  return formatSuccess(`Email folders:\n\n${lines.join('\n')}`);
}

// Tool definitions
const emailTools = [
  {
    name: 'list-emails',
    description: 'Lists emails from a folder (default: inbox)',
    inputSchema: {
      type: 'object',
      properties: {
        folder: {
          type: 'string',
          description: 'Email folder (inbox, sent, drafts, trash, archive, junk)'
        },
        count: {
          type: 'number',
          description: 'Number of emails to retrieve (default: 25, max: 50)'
        }
      },
      required: []
    },
    handler: withErrorHandler(handleListEmails, 'list-emails')
  },
  {
    name: 'read-email',
    description: 'Reads the full content of an email by UID',
    inputSchema: {
      type: 'object',
      properties: {
        uid: {
          type: 'string',
          description: 'The UID of the email to read'
        },
        folder: {
          type: 'string',
          description: 'Email folder (default: inbox)'
        }
      },
      required: ['uid']
    },
    handler: withErrorHandler(handleReadEmail, 'read-email')
  },
  {
    name: 'send-email',
    description: 'Composes and sends an email',
    inputSchema: {
      type: 'object',
      properties: {
        to: {
          type: 'string',
          description: 'Recipient email address(es), comma-separated'
        },
        cc: {
          type: 'string',
          description: 'CC recipient(s), comma-separated'
        },
        bcc: {
          type: 'string',
          description: 'BCC recipient(s), comma-separated'
        },
        subject: {
          type: 'string',
          description: 'Email subject'
        },
        body: {
          type: 'string',
          description: 'Email body content'
        },
        isHtml: {
          type: 'boolean',
          description: 'Whether the body is HTML (default: false)'
        }
      },
      required: ['to', 'subject', 'body']
    },
    handler: withErrorHandler(handleSendEmail, 'send-email')
  },
  {
    name: 'search-emails',
    description: 'Search for emails by criteria',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Text to search in email content'
        },
        from: {
          type: 'string',
          description: 'Filter by sender'
        },
        subject: {
          type: 'string',
          description: 'Filter by subject'
        },
        folder: {
          type: 'string',
          description: 'Email folder to search (default: inbox)'
        },
        unreadOnly: {
          type: 'boolean',
          description: 'Only show unread emails'
        },
        count: {
          type: 'number',
          description: 'Max results (default: 25, max: 50)'
        }
      },
      required: []
    },
    handler: withErrorHandler(handleSearchEmails, 'search-emails')
  },
  {
    name: 'mark-as-read',
    description: 'Marks an email as read or unread',
    inputSchema: {
      type: 'object',
      properties: {
        uid: {
          type: 'string',
          description: 'The UID of the email'
        },
        folder: {
          type: 'string',
          description: 'Email folder (default: inbox)'
        },
        isRead: {
          type: 'boolean',
          description: 'Mark as read (true) or unread (false). Default: true'
        }
      },
      required: ['uid']
    },
    handler: withErrorHandler(handleMarkAsRead, 'mark-as-read')
  },
  {
    name: 'move-email',
    description: 'Moves a single email UID from one folder to another',
    inputSchema: {
      type: 'object',
      properties: {
        uid: {
          type: 'string',
          description: 'The UID of the email to move'
        },
        sourceFolder: {
          type: 'string',
          description: 'Source email folder (default: inbox)'
        },
        folder: {
          type: 'string',
          description: 'Alias for sourceFolder (default: inbox)'
        },
        targetFolder: {
          type: 'string',
          description: 'Target email folder'
        }
      },
      required: ['uid', 'targetFolder']
    },
    handler: withErrorHandler(handleMoveEmail, 'move-email')
  },
  {
    name: 'archive-email',
    description: 'Moves a single email UID to the archive folder without deleting it',
    inputSchema: {
      type: 'object',
      properties: {
        uid: {
          type: 'string',
          description: 'The UID of the email to archive'
        },
        folder: {
          type: 'string',
          description: 'Source email folder (default: inbox)'
        },
        archiveFolder: {
          type: 'string',
          description: 'Archive folder (default: configured archive mapping or Archive)'
        }
      },
      required: ['uid']
    },
    handler: withErrorHandler(handleArchiveEmail, 'archive-email')
  },
  {
    name: 'move-to-trash',
    description: 'Moves a single email UID to Trash/Deleted Messages without permanently deleting it',
    inputSchema: {
      type: 'object',
      properties: {
        uid: {
          type: 'string',
          description: 'The UID of the email to move to trash'
        },
        folder: {
          type: 'string',
          description: 'Source email folder (default: inbox)'
        },
        trashFolder: {
          type: 'string',
          description: 'Trash folder (default: configured trash mapping or Trash)'
        }
      },
      required: ['uid']
    },
    handler: withErrorHandler(handleMoveToTrash, 'move-to-trash')
  },
  {
    name: 'bulk-mark-as-read',
    description: 'Sequentially marks multiple email UIDs as read or unread',
    inputSchema: {
      type: 'object',
      properties: {
        uids: {
          type: 'array',
          items: {
            type: 'string'
          },
          description: 'Email UIDs to update'
        },
        folder: {
          type: 'string',
          description: 'Email folder (default: inbox)'
        },
        isRead: {
          type: 'boolean',
          description: 'Mark as read (true) or unread (false). Default: true'
        }
      },
      required: ['uids']
    },
    handler: withErrorHandler(handleBulkMarkAsRead, 'bulk-mark-as-read')
  },
  {
    name: 'list-folders',
    description: 'Lists all email folders',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    },
    handler: withErrorHandler(handleListFolders, 'list-folders')
  }
];

module.exports = {
  emailTools,
  handleListEmails,
  handleReadEmail,
  handleSendEmail,
  handleSearchEmails,
  handleMarkAsRead,
  handleMoveEmail,
  handleArchiveEmail,
  handleMoveToTrash,
  handleBulkMarkAsRead,
  handleListFolders
};
