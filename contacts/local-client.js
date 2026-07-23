/**
 * Local Contacts Client
 * Accesses Contacts.app via AppleScript
 *
 * Note: Contacts.app includes ALL accounts (iCloud, Exchange, Google, On My Mac, etc.).
 * The AppleScript API does not expose which account a contact belongs to.
 * For iCloud-only filtering, use the CardDAV fallback functions (listICloudContacts, etc.)
 * which query contacts.icloud.com directly via the tsdav library.
 */

const { runAppleScript, runJXA, escapeAppleScript, escapeJXA } = require('../utils/applescript');
const config = require('../config');
const { getCredentials } = require('../auth');

// ── CardDAV fallback for iCloud-only contacts ──

let _carddavClient = null;

async function getCardDAVClient() {
  if (_carddavClient) return _carddavClient;
  const { DAVClient } = require('tsdav');
  const creds = getCredentials();
  const client = new DAVClient({
    serverUrl: 'https://contacts.icloud.com',
    credentials: { username: creds.email, password: creds.password },
    authMethod: 'Basic',
    defaultAccountType: 'carddav'
  });
  await client.login();
  _carddavClient = client;
  return client;
}

function parseVCard(vcardData, url) {
  try {
    const contact = {
      url, uid: '', displayName: '', firstName: '', lastName: '',
      emails: [], phones: [], organization: '', title: '', notes: ''
    };
    for (const line of vcardData.split(/\r?\n/)) {
      const ci = line.indexOf(':');
      if (ci === -1) continue;
      const key = line.substring(0, ci).toUpperCase();
      const value = line.substring(ci + 1);
      const kp = key.split(';');
      const mk = kp[0];
      switch (mk) {
        case 'UID': contact.uid = value; break;
        case 'FN': contact.displayName = value.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\'); break;
        case 'N': { const np = value.split(';'); contact.lastName = (np[0]||'').replace(/\\;/g,';'); contact.firstName = (np[1]||'').replace(/\\;/g,';'); break; }
        case 'EMAIL': contact.emails.push({ type: 'email', value }); break;
        case 'TEL': contact.phones.push({ type: 'phone', value }); break;
        case 'ORG': contact.organization = value.split(';')[0]; break;
        case 'TITLE': contact.title = value; break;
        case 'NOTE': contact.notes = value; break;
      }
    }
    if (!contact.displayName && (contact.firstName || contact.lastName))
      contact.displayName = `${contact.firstName} ${contact.lastName}`.trim();
    return contact;
  } catch { return null; }
}

/**
 * List iCloud-only contacts via CardDAV (bypasses Contacts.app)
 */
async function listICloudContacts(count = 25) {
  const client = await getCardDAVClient();
  const addressBooks = await client.fetchAddressBooks();
  const all = [];
  for (const ab of addressBooks) {
    try {
      const vcards = await client.fetchVCards({ addressBook: ab });
      for (const v of vcards) {
        const c = parseVCard(v.data, v.url);
        if (c && c.displayName) all.push(c);
      }
    } catch (e) { console.error('CardDAV address book error:', e.message); }
  }
  all.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return all.slice(0, count);
}

/**
 * Search iCloud-only contacts via CardDAV
 */
async function searchICloudContacts(query, count = 25) {
  const all = await listICloudContacts(100000);
  const q = query.toLowerCase();
  return all.filter(c => {
    const text = [c.displayName, c.firstName, c.lastName, c.organization,
      ...c.emails.map(e => e.value), ...c.phones.map(p => p.value)
    ].join(' ').toLowerCase();
    return text.includes(q);
  }).slice(0, count);
}

// ── Contacts.app (AppleScript) — all accounts ──

/**
 * List contacts (all accounts via Contacts.app)
 */
async function listContacts(count = 25) {
  const script = `
    const contacts = Application('Contacts');
    const people = contacts.people();
    let result = [];

    const limit = Math.min(${count}, people.length);
    for (let i = 0; i < limit; i++) {
      const person = people[i];
      try {
        const emails = person.emails();
        const phones = person.phones();

        result.push({
          id: person.id(),
          name: person.name() || '',
          firstName: person.firstName() || '',
          lastName: person.lastName() || '',
          organization: person.organization() || '',
          jobTitle: person.jobTitle() || '',
          email: emails.length > 0 ? emails[0].value() : '',
          phone: phones.length > 0 ? phones[0].value() : ''
        });
      } catch (e) {}
    }

    JSON.stringify(result);
  `;

  const result = await runJXA(script);
  return result ? JSON.parse(result) : [];
}

/**
 * Search contacts
 * @param {string} query - Search query
 * @param {number} count - Max results
 * @returns {Promise<Array>} - Matching contacts
 */
async function searchContacts(query, count = 25) {
  const searchTerm = escapeJXA(query.toLowerCase());

  const script = `
    const contacts = Application('Contacts');
    const people = contacts.people();
    let result = [];

    for (let person of people) {
      if (result.length >= ${count}) break;

      try {
        const name = (person.name() || '').toLowerCase();
        const org = (person.organization() || '').toLowerCase();
        const emails = person.emails();
        const phones = person.phones();

        let emailMatch = false;
        for (let e of emails) {
          if (e.value().toLowerCase().includes("${searchTerm}")) {
            emailMatch = true;
            break;
          }
        }

        let phoneMatch = false;
        for (let p of phones) {
          if (p.value().includes("${searchTerm}")) {
            phoneMatch = true;
            break;
          }
        }

        if (name.includes("${searchTerm}") || org.includes("${searchTerm}") || emailMatch || phoneMatch) {
          result.push({
            id: person.id(),
            name: person.name() || '',
            firstName: person.firstName() || '',
            lastName: person.lastName() || '',
            organization: person.organization() || '',
            jobTitle: person.jobTitle() || '',
            email: emails.length > 0 ? emails[0].value() : '',
            phone: phones.length > 0 ? phones[0].value() : ''
          });
        }
      } catch (e) {}
    }

    JSON.stringify(result);
  `;

  const result = await runJXA(script);
  return result ? JSON.parse(result) : [];
}

/**
 * Read a specific contact
 * @param {string} contactId - Contact ID
 * @returns {Promise<Object>} - Contact details
 */
async function readContact(contactId) {
  const script = `
    const contacts = Application('Contacts');
    const person = contacts.people.byId("${escapeJXA(contactId)}");

    const emails = person.emails();
    const phones = person.phones();
    const addresses = person.addresses();

    let emailList = [];
    for (let e of emails) {
      emailList.push({ label: e.label() || 'email', value: e.value() });
    }

    let phoneList = [];
    for (let p of phones) {
      phoneList.push({ label: p.label() || 'phone', value: p.value() });
    }

    let addressList = [];
    for (let a of addresses) {
      addressList.push({
        label: a.label() || 'address',
        street: a.street() || '',
        city: a.city() || '',
        state: a.state() || '',
        zip: a.zip() || '',
        country: a.country() || ''
      });
    }

    JSON.stringify({
      id: person.id(),
      name: person.name() || '',
      firstName: person.firstName() || '',
      lastName: person.lastName() || '',
      organization: person.organization() || '',
      jobTitle: person.jobTitle() || '',
      department: person.department() || '',
      note: person.note() || '',
      birthday: person.birthDate() ? person.birthDate().toISOString() : null,
      emails: emailList,
      phones: phoneList,
      addresses: addressList
    });
  `;

  const result = await runJXA(script);
  return result ? JSON.parse(result) : null;
}

/**
 * Create a new contact
 * @param {Object} options - Contact options
 * @returns {Promise<Object>} - Created contact info
 */
async function createContact({ displayName, firstName, lastName, organization, jobTitle, title, email, phone, note, notes }) {
  jobTitle = jobTitle || title;
  note = note || notes;
  let properties = [];

  if (firstName) properties.push(`first name:"${escapeAppleScript(firstName)}"`);
  if (lastName) properties.push(`last name:"${escapeAppleScript(lastName)}"`);
  if (organization) properties.push(`organization:"${escapeAppleScript(organization)}"`);
  if (jobTitle) properties.push(`job title:"${escapeAppleScript(jobTitle)}"`);
  if (note) properties.push(`note:"${escapeAppleScript(note)}"`);

  let script = `
    tell application "Contacts"
      set newPerson to make new person with properties {${properties.join(', ')}}
  `;

  if (email) {
    script += `
      tell newPerson
        make new email at end of emails with properties {label:"work", value:"${escapeAppleScript(email)}"}
      end tell
    `;
  }

  if (phone) {
    script += `
      tell newPerson
        make new phone at end of phones with properties {label:"mobile", value:"${escapeAppleScript(phone)}"}
      end tell
    `;
  }

  script += `
      save
      return id of newPerson
    end tell
  `;

  const id = await runAppleScript(script);
  return { success: true, id, message: 'Contact created successfully' };
}

/**
 * Update a contact
 * @param {string} contactId - Contact ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} - Result
 */
async function updateContact(contactId, { firstName, lastName, organization, jobTitle, email, phone, note }) {
  let updateCommands = [];

  if (firstName !== undefined) updateCommands.push(`set first name of thePerson to "${escapeAppleScript(firstName || '')}"`);
  if (lastName !== undefined) updateCommands.push(`set last name of thePerson to "${escapeAppleScript(lastName || '')}"`);
  if (organization !== undefined) updateCommands.push(`set organization of thePerson to "${escapeAppleScript(organization || '')}"`);
  if (jobTitle !== undefined) updateCommands.push(`set job title of thePerson to "${escapeAppleScript(jobTitle || '')}"`);
  if (note !== undefined) updateCommands.push(`set note of thePerson to "${escapeAppleScript(note || '')}"`);

  const script = `
    tell application "Contacts"
      set thePerson to person id "${escapeAppleScript(contactId)}"
      ${updateCommands.join('\n      ')}
      save
    end tell
    return "updated"
  `;

  await runAppleScript(script);
  return { success: true, message: 'Contact updated successfully' };
}

/**
 * Delete a contact
 * @param {string} contactId - Contact ID
 * @returns {Promise<Object>} - Result
 */
async function deleteContact(contactId) {
  const script = `
    tell application "Contacts"
      set thePerson to person id "${escapeAppleScript(contactId)}"
      delete thePerson
      save
    end tell
    return "deleted"
  `;

  await runAppleScript(script);
  return { success: true, message: 'Contact deleted successfully' };
}

// Alias for carddav-client compatibility
const getContact = readContact;

module.exports = {
  listContacts,
  searchContacts,
  readContact,
  getContact,
  createContact,
  updateContact,
  deleteContact,
  // iCloud-only variants (via CardDAV, bypasses Contacts.app)
  listICloudContacts,
  searchICloudContacts
};
