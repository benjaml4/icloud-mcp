/**
 * IMAP client wrapper for iCloud Mail
 */

const Imap = require('imap');
const { simpleParser } = require('mailparser');
const config = require('../config');
const { getCredentials } = require('../auth');

/**
 * Create IMAP connection
 */
function createConnection() {
  const creds = getCredentials();

  return new Imap({
    user: creds.email,
    password: creds.password,
    host: config.IMAP.HOST,
    port: config.IMAP.PORT,
    tls: config.IMAP.TLS,
    authTimeout: config.IMAP.AUTH_TIMEOUT,
    connTimeout: config.IMAP.CONN_TIMEOUT
  });
}

/**
 * Execute IMAP operation with connection management
 */
function withImap(operation) {
  return new Promise(function(resolve, reject) {
    const imap = createConnection();

    imap.once('ready', function() {
      operation(imap).then(function(result) {
        imap.end();
        resolve(result);
      }).catch(function(err) {
        imap.end();
        reject(err);
      });
    });

    imap.once('error', function(err) {
      if (err.message && err.message.indexOf('AUTHENTICATIONFAILED') !== -1) {
        reject(new Error('UNAUTHORIZED'));
      } else {
        reject(err);
      }
    });

    imap.connect();
  });
}

/**
 * Get folder name from user-friendly name
 */
function getFolderName(folder) {
  const lower = (folder || 'inbox').toLowerCase();
  return config.EMAIL_FOLDERS[lower] || folder;
}

/**
 * List emails from a folder
 */
async function listEmails(folder, count) {
  if (folder === undefined) folder = 'inbox';
  if (count === undefined) count = 25;
  
  return withImap(function(imap) {
    return new Promise(function(resolve, reject) {
      const folderName = getFolderName(folder);

      imap.openBox(folderName, true, function(err, box) {
        if (err) {
          reject(err);
          return;
        }

        const total = box.messages.total;
        if (total === 0) {
          resolve([]);
          return;
        }

        // Fetch most recent emails
        const start = Math.max(1, total - count + 1);
        const range = start + ':' + total;

        const emails = [];
        const fetch = imap.seq.fetch(range, {
          bodies: ['HEADER.FIELDS (FROM TO SUBJECT DATE)'],
          struct: true
        });

        fetch.on('message', function(msg, seqno) {
          const email = { seqno: seqno, uid: null };

          msg.on('body', function(stream, info) {
            let buffer = '';
            stream.on('data', function(chunk) { buffer += chunk.toString('utf8'); });
            stream.on('end', function() {
              const headers = Imap.parseHeader(buffer);
              email.from = headers.from ? headers.from[0] : '';
              email.to = headers.to ? headers.to[0] : '';
              email.subject = headers.subject ? headers.subject[0] : '(No subject)';
              email.date = headers.date ? headers.date[0] : '';
            });
          });

          msg.once('attributes', function(attrs) {
            email.uid = attrs.uid;
            email.flags = attrs.flags || [];
          });

          msg.once('end', function() {
            emails.push(email);
          });
        });

        fetch.once('error', reject);
        fetch.once('end', function() {
          // Sort by date descending (newest first)
          emails.sort(function(a, b) { return new Date(b.date) - new Date(a.date); });
          resolve(emails);
        });
      });
    });
  });
}

/**
 * Read full email content
 */
async function readEmail(uid, folder) {
  if (folder === undefined) folder = 'inbox';
  
  return withImap(function(imap) {
    return new Promise(function(resolve, reject) {
      const folderName = getFolderName(folder);

      imap.openBox(folderName, true, function(err) {
        if (err) {
          reject(err);
          return;
        }

        const fetch = imap.fetch(uid, { bodies: '' });
        let rawEmail = '';

        fetch.on('message', function(msg) {
          msg.on('body', function(stream) {
            stream.on('data', function(chunk) { rawEmail += chunk.toString('utf8'); });
          });
        });

        fetch.once('error', reject);
        fetch.once('end', function() {
          simpleParser(rawEmail).then(function(parsed) {
            resolve({
              uid: uid,
              from: parsed.from ? parsed.from.text : '',
              to: parsed.to ? parsed.to.text : '',
              cc: parsed.cc ? parsed.cc.text : '',
              subject: parsed.subject || '(No subject)',
              date: parsed.date,
              text: parsed.text || '',
              html: parsed.html || '',
              attachments: (parsed.attachments || []).map(function(a) {
                return {
                  filename: a.filename,
                  contentType: a.contentType,
                  size: a.size
                };
              })
            });
          }).catch(function(parseErr) {
            reject(parseErr);
          });
        });
      });
    });
  });
}

/**
 * Search emails
 */
async function searchEmails(criteria, folder, count) {
  if (folder === undefined) folder = 'inbox';
  if (count === undefined) count = 25;
  
  return withImap(function(imap) {
    return new Promise(function(resolve, reject) {
      const folderName = getFolderName(folder);

      imap.openBox(folderName, true, function(err, box) {
        if (err) {
          reject(err);
          return;
        }

        // Build IMAP search criteria
        const searchCriteria = [];

        if (criteria.from) {
          searchCriteria.push(['FROM', criteria.from]);
        }
        if (criteria.subject) {
          searchCriteria.push(['SUBJECT', criteria.subject]);
        }
        if (criteria.since) {
          searchCriteria.push(['SINCE', criteria.since]);
        }
        if (criteria.before) {
          searchCriteria.push(['BEFORE', criteria.before]);
        }
        if (criteria.unseen) {
          searchCriteria.push('UNSEEN');
        }
        if (criteria.text) {
          searchCriteria.push(['TEXT', criteria.text]);
        }

        // Default to ALL if no criteria
        if (searchCriteria.length === 0) {
          searchCriteria.push('ALL');
        }

        imap.search(searchCriteria, function(err, uids) {
          if (err) {
            reject(err);
            return;
          }

          if (!uids || uids.length === 0) {
            resolve([]);
            return;
          }

          // Get most recent results
          const recentUids = uids.slice(-count);

          const emails = [];
          const fetch = imap.fetch(recentUids, {
            bodies: ['HEADER.FIELDS (FROM TO SUBJECT DATE)'],
            struct: true
          });

          fetch.on('message', function(msg, seqno) {
            const email = { seqno: seqno };

            msg.on('body', function(stream) {
              let buffer = '';
              stream.on('data', function(chunk) { buffer += chunk.toString('utf8'); });
              stream.on('end', function() {
                const headers = Imap.parseHeader(buffer);
                email.from = headers.from ? headers.from[0] : '';
                email.to = headers.to ? headers.to[0] : '';
                email.subject = headers.subject ? headers.subject[0] : '(No subject)';
                email.date = headers.date ? headers.date[0] : '';
              });
            });

            msg.once('attributes', function(attrs) {
              email.uid = attrs.uid;
              email.flags = attrs.flags || [];
            });

            msg.once('end', function() {
              emails.push(email);
            });
          });

          fetch.once('error', reject);
          fetch.once('end', function() {
            emails.sort(function(a, b) { return new Date(b.date) - new Date(a.date); });
            resolve(emails);
          });
        });
      });
    });
  });
}

/**
 * Mark email as read/unread
 */
async function markAsRead(uid, folder, isRead) {
  if (folder === undefined) folder = 'inbox';
  if (isRead === undefined) isRead = true;
  
  return withImap(function(imap) {
    return new Promise(function(resolve, reject) {
      const folderName = getFolderName(folder);

      imap.openBox(folderName, false, function(err) {
        if (err) {
          reject(err);
          return;
        }

        const flags = ['\\Seen'];
        const method = isRead ? 'addFlags' : 'delFlags';

        imap[method](uid, flags, function(err) {
          if (err) {
            reject(err);
          } else {
            resolve(true);
          }
        });
      });
    });
  });
}

/**
 * Move email to another folder
 */
async function moveEmail(uid, sourceFolder, targetFolder) {
  if (sourceFolder === undefined) sourceFolder = 'inbox';
  
  return withImap(function(imap) {
    return new Promise(function(resolve, reject) {
      const sourceName = getFolderName(sourceFolder);
      const targetName = getFolderName(targetFolder);

      imap.openBox(sourceName, false, function(err) {
        if (err) {
          reject(err);
          return;
        }

        imap.move(uid, targetName, function(err) {
          if (err) {
            reject(err);
          } else {
            resolve(true);
          }
        });
      });
    });
  });
}

/**
 * List folders
 */
async function listFolders() {
  return withImap(function(imap) {
    return new Promise(function(resolve, reject) {
      imap.getBoxes(function(err, boxes) {
        if (err) {
          reject(err);
          return;
        }

        const folders = [];

        function processBoxes(boxObj, prefix) {
          if (prefix === undefined) prefix = '';
          
          for (let name in boxObj) {
            const box = boxObj[name];
            const fullPath = prefix ? (prefix + box.delimiter + name) : name;
            folders.push({
              name: fullPath,
              delimiter: box.delimiter,
              flags: box.attribs || []
            });

            if (box.children) {
              processBoxes(box.children, fullPath);
            }
          }
        }

        processBoxes(boxes);
        resolve(folders);
      });
    });
  });
}

module.exports = {
  listEmails: listEmails,
  readEmail: readEmail,
  searchEmails: searchEmails,
  markAsRead: markAsRead,
  moveEmail: moveEmail,
  listFolders: listFolders,
  getFolderName: getFolderName
};
