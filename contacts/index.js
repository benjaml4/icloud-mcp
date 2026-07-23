/**
 * Contacts module for iCloud MCP
 * Provides contacts tools via CardDAV
 */

const config = require('../config');
const useLocal = config.USE_LOCAL_MODE && config.IS_MACOS;
const localClient = useLocal ? require('./local-client') : null;
const carddavClient = useLocal ? null : require('./carddav-client');
const { formatSuccess, formatError, withErrorHandler } = require('../utils/error-handler');

/**
 * Route to the right list/search function based on icloudOnly flag.
 * - icloudOnly=true in local mode → CardDAV fallback (iCloud-only)
 * - icloudOnly=false (default) in local mode → Contacts.app (all accounts)
 * - Cloud mode always uses CardDAV (inherently iCloud-only)
 */
function getListContacts(icloudOnly) {
  if (!useLocal) return carddavClient.listContacts;
  if (icloudOnly) return localClient.listICloudContacts;
  return localClient.listContacts;
}

function getSearchContacts(icloudOnly) {
  if (!useLocal) return carddavClient.searchContacts;
  if (icloudOnly) return localClient.searchICloudContacts;
  return localClient.searchContacts;
}

// Re-export the remaining functions from the appropriate client
const { searchContacts, getContact, createContact, deleteContact } = useLocal ? localClient : carddavClient;
const { listContacts } = useLocal ? localClient : carddavClient;

/** Normalize local (Contacts.app) and cloud (CardDAV) contact shapes */
function contactDisplayName(contact) {
  return contact.displayName || contact.name || `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || '(unnamed)';
}

function contactEmails(contact) {
  if (Array.isArray(contact.emails)) return contact.emails;
  if (contact.email) return [{ value: contact.email, type: 'email' }];
  return [];
}

function contactPhones(contact) {
  if (Array.isArray(contact.phones)) return contact.phones;
  if (contact.phone) return [{ value: contact.phone, type: 'phone' }];
  return [];
}

function contactRef(contact) {
  return contact.url || contact.id || '';
}

/**
 * Handler: List contacts
 */
async function handleListContacts(args) {
  const count = Math.min(args.count || 25, config.DEFAULTS.MAX_RESULTS);
  const icloudOnly = args.icloudOnly === true;

  const fn = getListContacts(icloudOnly);
  const contacts = await fn(count);

  if (contacts.length === 0) {
    return formatSuccess('No contacts found.');
  }

  const lines = contacts.map((contact, i) => {
    const emails = contactEmails(contact);
    const phones = contactPhones(contact);
    let line = `${i + 1}. ${contactDisplayName(contact)}`;

    if (emails.length > 0) {
      line += `\n   Email: ${emails[0].value}`;
    }
    if (phones.length > 0) {
      line += `\n   Phone: ${phones[0].value}`;
    }
    if (contact.organization) {
      line += `\n   Company: ${contact.organization}`;
    }
    const ref = contactRef(contact);
    if (ref) line += `\n   ID: ${ref}`;

    return line;
  });

  return formatSuccess(`Contacts (${contacts.length}):\n\n${lines.join('\n\n')}`);
}

/**
 * Handler: Search contacts
 */
async function handleSearchContacts(args) {
  if (!args.query) {
    return formatError(new Error('Search query is required'));
  }

  const count = Math.min(args.count || 25, config.DEFAULTS.MAX_RESULTS);
  const icloudOnly = args.icloudOnly === true;

  const fn = getSearchContacts(icloudOnly);
  const contacts = await fn(args.query, count);

  if (contacts.length === 0) {
    return formatSuccess(`No contacts found matching "${args.query}".`);
  }

  const lines = contacts.map((contact, i) => {
    const emails = contactEmails(contact);
    const phones = contactPhones(contact);
    let line = `${i + 1}. ${contactDisplayName(contact)}`;

    if (emails.length > 0) {
      line += `\n   Email: ${emails[0].value}`;
    }
    if (phones.length > 0) {
      line += `\n   Phone: ${phones[0].value}`;
    }
    if (contact.organization) {
      line += `\n   Company: ${contact.organization}`;
    }
    const ref = contactRef(contact);
    if (ref) line += `\n   ID: ${ref}`;

    return line;
  });

  return formatSuccess(`Search results for "${args.query}" (${contacts.length}):\n\n${lines.join('\n\n')}`);
}

/**
 * Handler: Read contact
 */
async function handleReadContact(args) {
  const contactRefArg = args.contactUrl || args.contactId;
  if (!contactRefArg) {
    return formatError(new Error('Contact URL or ID is required'));
  }

  const contact = await getContact(contactRefArg);
  if (!contact) {
    return formatError(new Error('Contact not found'));
  }

  const emails = contactEmails(contact);
  const phones = contactPhones(contact);

  const emailList = emails.length > 0
    ? emails.map(e => `  - ${e.value} (${e.type || e.label || 'email'})`).join('\n')
    : '  (none)';

  const phoneList = phones.length > 0
    ? phones.map(p => `  - ${p.value} (${p.type || p.label || 'phone'})`).join('\n')
    : '  (none)';

  return formatSuccess(
    `Contact Details:

Name: ${contactDisplayName(contact)}
First Name: ${contact.firstName || '(not set)'}
Last Name: ${contact.lastName || '(not set)'}

Emails:
${emailList}

Phones:
${phoneList}

Organization: ${contact.organization || '(not set)'}
Title: ${contact.title || contact.jobTitle || '(not set)'}

Notes: ${contact.notes || contact.note || '(none)'}

ID: ${contactRef(contact)}
UID: ${contact.uid || contact.id || '(n/a)'}`
  );
}

/**
 * Handler: Create contact
 */
async function handleCreateContact(args) {
  if (!args.displayName && !args.firstName && !args.lastName) {
    return formatError(new Error('At least displayName or firstName/lastName is required'));
  }

  const result = await createContact({
    displayName: args.displayName,
    firstName: args.firstName,
    lastName: args.lastName,
    email: args.email,
    phone: args.phone,
    organization: args.organization,
    title: args.title,
    notes: args.notes
  });

  const name = args.displayName || `${args.firstName || ''} ${args.lastName || ''}`.trim();

  const uid = result.uid || result.id;

  return formatSuccess(
    `Contact created successfully!\n\nName: ${name}${args.email ? `\nEmail: ${args.email}` : ''}${args.phone ? `\nPhone: ${args.phone}` : ''}${args.organization ? `\nOrganization: ${args.organization}` : ''}\nID: ${uid}`
  );
}

/**
 * Handler: Delete contact
 */
async function handleDeleteContact(args) {
  const contactRefArg = args.contactUrl || args.contactId;
  if (!contactRefArg) {
    return formatError(new Error('Contact URL or ID is required'));
  }

  await deleteContact(contactRefArg);

  return formatSuccess('Contact deleted successfully.');
}

// Tool definitions
const contactsTools = [
  {
    name: 'list-contacts',
    description: 'Lists contacts from your iCloud address book. Set icloudOnly=true to filter out non-iCloud accounts (Exchange, Google, On My Mac) — only available in local mode.',
    inputSchema: {
      type: 'object',
      properties: {
        count: {
          type: 'number',
          description: 'Number of contacts to retrieve (default: 25, max: 1000)'
        },
        icloudOnly: {
          type: 'boolean',
          description: 'If true, only return iCloud contacts (filters out Exchange, Google, and other non-iCloud accounts). In cloud mode this has no effect (CardDAV is always iCloud-only).'
        }
      },
      required: []
    },
    handler: withErrorHandler(handleListContacts, 'list-contacts')
  },
  {
    name: 'search-contacts',
    description: 'Search contacts by name, email, or phone. Set icloudOnly=true to search only iCloud contacts.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (name, email, or phone)'
        },
        count: {
          type: 'number',
          description: 'Max results (default: 25, max: 1000)'
        },
        icloudOnly: {
          type: 'boolean',
          description: 'If true, only search iCloud contacts (filters out Exchange, Google, and other non-iCloud accounts). In cloud mode this has no effect.'
        }
      },
      required: ['query']
    },
    handler: withErrorHandler(handleSearchContacts, 'search-contacts')
  },
  {
    name: 'read-contact',
    description: 'Get detailed information about a specific contact',
    inputSchema: {
      type: 'object',
      properties: {
        contactUrl: {
          type: 'string',
          description: 'Contact URL (cloud) or ID (local, from list-contacts output)'
        },
        contactId: {
          type: 'string',
          description: 'Contact ID in local mode (alias for contactUrl)'
        }
      },
      required: []
    },
    handler: withErrorHandler(handleReadContact, 'read-contact')
  },
  {
    name: 'create-contact',
    description: 'Creates a new contact',
    inputSchema: {
      type: 'object',
      properties: {
        displayName: {
          type: 'string',
          description: 'Full display name'
        },
        firstName: {
          type: 'string',
          description: 'First name'
        },
        lastName: {
          type: 'string',
          description: 'Last name'
        },
        email: {
          type: 'string',
          description: 'Email address'
        },
        phone: {
          type: 'string',
          description: 'Phone number'
        },
        organization: {
          type: 'string',
          description: 'Company/Organization'
        },
        title: {
          type: 'string',
          description: 'Job title'
        },
        notes: {
          type: 'string',
          description: 'Notes about the contact'
        }
      },
      required: []
    },
    handler: withErrorHandler(handleCreateContact, 'create-contact')
  },
  {
    name: 'delete-contact',
    description: 'Deletes a contact',
    inputSchema: {
      type: 'object',
      properties: {
        contactUrl: {
          type: 'string',
          description: 'Contact URL (cloud) or ID (local, from list-contacts output)'
        },
        contactId: {
          type: 'string',
          description: 'Contact ID in local mode (alias for contactUrl)'
        }
      },
      required: []
    },
    handler: withErrorHandler(handleDeleteContact, 'delete-contact')
  }
];

module.exports = {
  contactsTools,
  handleListContacts,
  handleSearchContacts,
  handleReadContact,
  handleCreateContact,
  handleDeleteContact
};
