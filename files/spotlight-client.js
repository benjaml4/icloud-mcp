/**
 * Spotlight-backed search for iCloud Drive.
 * Uses macOS metadata index (mdfind/mdls) restricted to iCloud Drive root.
 */

const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const localClient = require('./local-client');

const execFileAsync = promisify(execFile);

async function searchSpotlight(query, {
  maxResults = 100,
  onlyInRelativePath = ''
} = {}) {
  const onlyInAbs = localClient.resolveSafePath(onlyInRelativePath);
  const rootAbs = localClient.resolveSafePath('');

  const args = ['-onlyin', onlyInAbs, query];
  const { stdout } = await execFileAsync('mdfind', args, { maxBuffer: 64 * 1024 * 1024 });
  const all = stdout.split('\n').map((s) => s.trim()).filter(Boolean);

  // Defense-in-depth: keep only results inside iCloud Drive root.
  const insideRoot = all.filter((absPath) =>
    absPath === rootAbs || absPath.startsWith(rootAbs + path.sep)
  );

  const limited = insideRoot.slice(0, maxResults).map((absPath) => ({
    absolutePath: absPath,
    path: path.relative(rootAbs, absPath) || '.'
  }));

  return {
    query,
    onlyIn: onlyInRelativePath || '.',
    totalMatches: insideRoot.length,
    returned: limited.length,
    truncated: insideRoot.length > maxResults,
    results: limited
  };
}

async function getMetadata(relativePath) {
  const absPath = localClient.resolveSafePath(relativePath);
  const attrs = [
    'kMDItemDisplayName',
    'kMDItemFSName',
    'kMDItemPath',
    'kMDItemContentType',
    'kMDItemKind',
    'kMDItemFSCreationDate',
    'kMDItemFSContentChangeDate',
    'kMDItemFSSize',
    'kMDItemTextContent'
  ];

  const metadata = {};

  for (const attr of attrs) {
    try {
      const { stdout } = await execFileAsync('mdls', ['-name', attr, '-raw', absPath], {
        maxBuffer: 16 * 1024 * 1024
      });
      const value = stdout.trim();
      if (value && value !== '(null)') {
        metadata[attr] = value;
      }
    } catch {
      // Skip unavailable metadata attributes
    }
  }

  // Avoid returning large text snippets by default.
  if (metadata.kMDItemTextContent && metadata.kMDItemTextContent.length > 8000) {
    metadata.kMDItemTextContent = `${metadata.kMDItemTextContent.slice(0, 8000)}... (truncated)`;
  }

  return {
    path: relativePath,
    absolutePath: absPath,
    metadata
  };
}

module.exports = {
  searchSpotlight,
  getMetadata
};
