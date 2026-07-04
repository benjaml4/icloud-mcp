/**
 * Email module for iCloud MCP
 * Provides email tools via IMAP/SMTP
 */

const { listEmails, readEmail, searchEmails, markAsRead, moveEmail, listFolders } = require('./imap-client');
const { sendEmail } = require('./smtp-client');
const { formatSuccess, formatError, withErrorHandler } = require('../utils/error-handler');
const { formatDate, formatRelative } = require('../utils/date-utils');
const config = require('../config');

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
    from: args.from,
    to: args.to,
    cc: args.cc,
    bcc: args.bcc,
    subject: args.subject,
    body: args.body,
    isHtml: args.isHtml || false
  });

  if (result.success) {
    return formatSuccess(
      `Email sent successfully!\n\nFrom: ${args.from || 'default'}\nTo: ${args.to}${args.cc ? `\nCC: ${args.cc}` : ''}\nSubject: ${args.subject}\nMessage ID: ${result.messageId}`
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
 * Handler: Archive email
 */
async function handleArchiveEmail(args) {
  if (!args.uid) {
    return formatError(new Error('Email UID is required'));
  }

  const sourceFolder = args.folder || 'inbox';
  await moveEmail(args.uid, sourceFolder, 'archive');

  return formatSuccess(`Email ${args.uid} archived successfully.`);
}

/**
 * Handler: Delete email
 */
async function handleDeleteEmail(args) {
  if (!args.uid) {
    return formatError(new Error('Email UID is required'));
  }

  const sourceFolder = args.folder || 'inbox';
  await moveEmail(args.uid, sourceFolder, 'trash');

  return formatSuccess(`Email ${args.uid} moved to trash.`);
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
        from: {
          type: 'string',
          description: 'Optional "From" header alias (e.g. your custom domain email)'
        },
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
    name: 'archive-email',
    description: 'Moves an email to the archive folder',
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
        }
      },
      required: ['uid']
    },
    handler: withErrorHandler(handleArchiveEmail, 'archive-email')
  },
  {
    name: 'delete-email',
    description: 'Moves an email to the trash/deleted folder',
    inputSchema: {
      type: 'object',
      properties: {
        uid: {
          type: 'string',
          description: 'The UID of the email to delete'
        },
        folder: {
          type: 'string',
          description: 'Source email folder (default: inbox)'
        }
      },
      required: ['uid']
    },
    handler: withErrorHandler(handleDeleteEmail, 'delete-email')
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
  handleArchiveEmail,
  handleDeleteEmail,
  handleListFolders
};
