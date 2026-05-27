/**
 * Wrapper for icloud-tools CLI (https://github.com/icanhasjonas/icloud-tools)
 * Manages cloud-only vs local iCloud Drive files without Finder.
 *
 * Install: brew tap icanhasjonas/tap && brew install icloud-tools
 * Requires macOS 14+
 */

const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const localClient = require('./local-client');

const execFileAsync = promisify(execFile);

function getBinary() {
  return process.env.ICLOUD_CLI_PATH || 'icloud';
}

function resolveTarget(relativePath = '') {
  return localClient.resolveSafePath(relativePath);
}

/**
 * Check if icloud CLI is available
 */
async function isAvailable() {
  try {
    await execFileAsync(getBinary(), ['--help'], { timeout: 5000 });
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    // --help may exit non-zero; binary exists
    return true;
  }
}

function parseNdjson(stdout) {
  const lines = stdout.trim().split('\n').filter(Boolean);
  const events = [];
  for (const line of lines) {
    try {
      events.push(JSON.parse(line));
    } catch {
      // skip non-JSON lines
    }
  }
  return events;
}

async function runIcloudCommand(args, maxBuffer = 64 * 1024 * 1024) {
  const { stdout, stderr } = await execFileAsync(getBinary(), args, {
    maxBuffer,
    env: { ...process.env, NO_COLOR: '1' }
  });

  return {
    stdout,
    stderr: stderr?.trim() || '',
    events: parseNdjson(stdout)
  };
}

/**
 * icloud status --json
 */
async function getSyncStatus(relativePath = '', {
  recursive = true,
  filter = 'all', // all | cloud | local
  sort
} = {}) {
  const target = resolveTarget(relativePath);
  const args = ['status', '--json'];

  if (recursive) args.push('-r');
  if (filter === 'cloud') args.push('--cloud');
  else if (filter === 'local') args.push('--local');
  if (sort) args.push('--sort', sort);
  args.push(target);

  const { events } = await runIcloudCommand(args);
  const files = events.filter((e) => e.path || e.file || e.src);

  return {
    path: relativePath || '.',
    absolutePath: target,
    filter,
    eventCount: events.length,
    events,
    files
  };
}

/**
 * Download cloud files and wait until local
 */
async function download(relativePath = '', {
  recursive = true,
  dryRun = false,
  maxConcurrent = 3,
  timeout = 120,
  verbose = false
} = {}) {
  const target = resolveTarget(relativePath);
  const args = ['download', '--json'];

  if (recursive) args.push('-r');
  if (dryRun) args.push('--dry-run');
  if (verbose) args.push('-v');
  if (maxConcurrent) args.push('-j', String(maxConcurrent));
  if (timeout) args.push('-t', String(timeout));
  args.push(target);

  const { events, stderr } = await runIcloudCommand(args);

  return {
    path: relativePath || '.',
    absolutePath: target,
    dryRun,
    success: !events.some((e) => e.event === 'download.fail' || e.event === 'op.fail'),
    events,
    stderr: stderr?.trim() || ''
  };
}

/**
 * Evict local copies (cloud-only again)
 */
async function evict(relativePath = '', {
  recursive = true,
  dryRun = false,
  verbose = false
} = {}) {
  const target = resolveTarget(relativePath);
  const args = ['evict', '--json'];

  if (recursive) args.push('-r');
  if (dryRun) args.push('--dry-run');
  if (verbose) args.push('-v');
  args.push(target);

  const { events, stderr } = await runIcloudCommand(args);

  return {
    path: relativePath || '.',
    absolutePath: target,
    dryRun,
    events,
    stderr: stderr?.trim() || ''
  };
}

/**
 * Ensure file is local before read (download if needed)
 */
async function ensureDownloaded(relativePath) {
  const target = resolveTarget(relativePath);
  const args = ['download', '--json', target];
  const { events } = await runIcloudCommand(args, 16 * 1024 * 1024);
  return { downloaded: true, events };
}

async function move(sources, destination, {
  dryRun = false,
  force = false,
  noClobber = false,
  verbose = false,
  maxConcurrent = 3,
  timeout = 120
} = {}) {
  const srcList = Array.isArray(sources) ? sources : [sources];
  const resolvedSources = srcList.map((s) => resolveTarget(s));
  const resolvedDestination = resolveTarget(destination);
  const args = ['mv', '--json'];

  if (dryRun) args.push('-d');
  if (force) args.push('-f');
  if (noClobber) args.push('-n');
  if (verbose) args.push('-v');
  if (maxConcurrent) args.push('-j', String(maxConcurrent));
  if (timeout) args.push('-t', String(timeout));
  args.push(...resolvedSources, resolvedDestination);

  const { events, stderr } = await runIcloudCommand(args);
  return {
    sources: srcList,
    destination,
    dryRun,
    events,
    stderr
  };
}

async function copy(sources, destination, {
  recursive = false,
  dryRun = false,
  force = false,
  noClobber = false,
  verbose = false,
  maxConcurrent = 3,
  timeout = 120
} = {}) {
  const srcList = Array.isArray(sources) ? sources : [sources];
  const resolvedSources = srcList.map((s) => resolveTarget(s));
  const resolvedDestination = resolveTarget(destination);
  const args = ['cp', '--json'];

  if (recursive) args.push('-r');
  if (dryRun) args.push('-d');
  if (force) args.push('-f');
  if (noClobber) args.push('-n');
  if (verbose) args.push('-v');
  if (maxConcurrent) args.push('-j', String(maxConcurrent));
  if (timeout) args.push('-t', String(timeout));
  args.push(...resolvedSources, resolvedDestination);

  const { events, stderr } = await runIcloudCommand(args);
  return {
    sources: srcList,
    destination,
    recursive,
    dryRun,
    events,
    stderr
  };
}

async function getInstallHint() {
  const available = await isAvailable();
  return {
    available,
    binary: getBinary(),
    install: available
      ? null
      : 'brew tap icanhasjonas/tap && brew install icloud-tools\nRequires macOS 14+. Set ICLOUD_CLI_PATH if not in PATH.'
  };
}

module.exports = {
  isAvailable,
  getSyncStatus,
  download,
  evict,
  move,
  copy,
  ensureDownloaded,
  getInstallHint,
  getBinary
};
