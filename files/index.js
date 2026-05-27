/**
 * iCloud Drive files module (local sync folder only)
 */

const localClient = require('./local-client');
const icloudTools = require('./icloud-tools-client');
const { handleError } = require('../utils/error-handler');

async function requireIcloudTools() {
  const hint = await icloudTools.getInstallHint();
  if (!hint.available) {
    throw new Error(`ICLOUD_TOOLS_NOT_INSTALLED: ${hint.install}`);
  }
  return hint;
}

const filesTools = [
  {
    name: 'icloud-drive-info',
    description: 'Show the local iCloud Drive sync folder path and whether it is accessible',
    inputSchema: { type: 'object', properties: {}, required: [] },
    handler: async () => {
      try {
        const info = await localClient.getDriveInfo();
        const tools = await icloudTools.getInstallHint();
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ ...info, icloudTools: tools }, null, 2)
          }]
        };
      } catch (error) {
        return handleError(error, 'icloud-drive-info');
      }
    }
  },
  {
    name: 'icloud-sync-status',
    description: 'List iCloud Drive files by sync state (local vs cloud-only) via icloud-tools CLI. Requires: brew install icloud-tools',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path relative to iCloud Drive root' },
        recursive: { type: 'boolean', description: 'Scan subfolders (default: true)' },
        filter: {
          type: 'string',
          enum: ['all', 'cloud', 'local'],
          description: 'Show all, cloud-only, or local files (default: all)'
        },
        sort: { type: 'string', enum: ['size', 'name'], description: 'Sort order (optional)' }
      },
      required: []
    },
    handler: async ({ path: relPath = '', recursive = true, filter = 'all', sort }) => {
      try {
        await requireIcloudTools();
        const result = await icloudTools.getSyncStatus(relPath, { recursive, filter, sort });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return handleError(error, 'icloud-sync-status');
      }
    }
  },
  {
    name: 'icloud-download',
    description: 'Download cloud-only iCloud files to this Mac (background, no Finder). Requires icloud-tools.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File or folder relative to iCloud Drive root' },
        recursive: { type: 'boolean', description: 'Download folder recursively (default: true)' },
        dryRun: { type: 'boolean', description: 'Preview only, do not download (default: false)' },
        maxConcurrent: { type: 'number', description: 'Parallel downloads (default: 3)' }
      },
      required: ['path']
    },
    handler: async ({
      path: relPath,
      recursive = true,
      dryRun = false,
      maxConcurrent = 3
    }) => {
      try {
        await requireIcloudTools();
        const result = await icloudTools.download(relPath, { recursive, dryRun, maxConcurrent });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return handleError(error, 'icloud-download');
      }
    }
  },
  {
    name: 'icloud-evict',
    description: 'Remove local copies of iCloud files (free disk space, keep in cloud). Requires icloud-tools.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File or folder relative to iCloud Drive root' },
        recursive: { type: 'boolean', description: 'Recursive (default: true)' },
        dryRun: { type: 'boolean', description: 'Preview only (default: false)' }
      },
      required: ['path']
    },
    handler: async ({ path: relPath, recursive = true, dryRun = false }) => {
      try {
        await requireIcloudTools();
        const result = await icloudTools.evict(relPath, { recursive, dryRun });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return handleError(error, 'icloud-evict');
      }
    }
  },
  {
    name: 'icloud-move',
    description: 'Move/organize files in iCloud Drive using icloud-tools (handles cloud-only files safely)',
    inputSchema: {
      type: 'object',
      properties: {
        sources: {
          type: 'array',
          items: { type: 'string' },
          description: 'One or more source paths relative to iCloud Drive root'
        },
        destination: {
          type: 'string',
          description: 'Destination path relative to iCloud Drive root'
        },
        dryRun: { type: 'boolean', description: 'Preview operations only' },
        force: { type: 'boolean', description: 'Overwrite existing destination files' },
        noClobber: { type: 'boolean', description: 'Skip files that already exist at destination' }
      },
      required: ['sources', 'destination']
    },
    handler: async ({ sources, destination, dryRun = false, force = false, noClobber = false }) => {
      try {
        await requireIcloudTools();
        const result = await icloudTools.move(sources, destination, { dryRun, force, noClobber });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return handleError(error, 'icloud-move');
      }
    }
  },
  {
    name: 'icloud-copy',
    description: 'Copy files/folders in iCloud Drive using icloud-tools',
    inputSchema: {
      type: 'object',
      properties: {
        sources: {
          type: 'array',
          items: { type: 'string' },
          description: 'One or more source paths relative to iCloud Drive root'
        },
        destination: {
          type: 'string',
          description: 'Destination path relative to iCloud Drive root'
        },
        recursive: { type: 'boolean', description: 'Required for folder copy (default: false)' },
        dryRun: { type: 'boolean', description: 'Preview only' },
        force: { type: 'boolean', description: 'Overwrite destination files' },
        noClobber: { type: 'boolean', description: 'Skip existing files' }
      },
      required: ['sources', 'destination']
    },
    handler: async ({ sources, destination, recursive = false, dryRun = false, force = false, noClobber = false }) => {
      try {
        await requireIcloudTools();
        const result = await icloudTools.copy(sources, destination, {
          recursive,
          dryRun,
          force,
          noClobber
        });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return handleError(error, 'icloud-copy');
      }
    }
  },
  {
    name: 'icloud-mkdir',
    description: 'Create a folder in iCloud Drive',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Folder path relative to iCloud Drive root' }
      },
      required: ['path']
    },
    handler: async ({ path: relPath }) => {
      try {
        const result = await localClient.createDirectory(relPath);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return handleError(error, 'icloud-mkdir');
      }
    }
  },
  {
    name: 'icloud-rename',
    description: 'Rename/move a file or folder in iCloud Drive',
    inputSchema: {
      type: 'object',
      properties: {
        fromPath: { type: 'string', description: 'Existing path relative to iCloud Drive root' },
        toPath: { type: 'string', description: 'New path relative to iCloud Drive root' },
        useIcloudTools: {
          type: 'boolean',
          description: 'Use icloud-tools move semantics for cloud-only files (default: true)'
        }
      },
      required: ['fromPath', 'toPath']
    },
    handler: async ({ fromPath, toPath, useIcloudTools = true }) => {
      try {
        let result;
        if (useIcloudTools && await icloudTools.isAvailable()) {
          await requireIcloudTools();
          result = await icloudTools.move([fromPath], toPath, {});
        } else {
          result = await localClient.renamePath(fromPath, toPath);
        }
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return handleError(error, 'icloud-rename');
      }
    }
  },
  {
    name: 'icloud-delete',
    description: 'Delete a file or folder from iCloud Drive',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path relative to iCloud Drive root' },
        recursive: { type: 'boolean', description: 'Delete folder recursively (default: true)' }
      },
      required: ['path']
    },
    handler: async ({ path: relPath, recursive = true }) => {
      try {
        const result = await localClient.deletePath(relPath, recursive);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return handleError(error, 'icloud-delete');
      }
    }
  },
  {
    name: 'list-icloud-files',
    description: 'List files and folders in your local iCloud Drive sync folder (not cloud-only placeholders)',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path relative to iCloud Drive root (default: root)'
        },
        recursive: {
          type: 'boolean',
          description: 'Include subfolders (default: false)'
        },
        maxDepth: {
          type: 'number',
          description: 'Max recursion depth when recursive (default: 2)'
        }
      },
      required: []
    },
    handler: async ({ path: relPath = '', recursive = false, maxDepth = 2 }) => {
      try {
        const files = await localClient.listFiles(relPath, { recursive, maxDepth });
        return { content: [{ type: 'text', text: JSON.stringify(files, null, 2) }] };
      } catch (error) {
        return handleError(error, 'list-icloud-files');
      }
    }
  },
  {
    name: 'icloud-drive-summary',
    description: 'Overview of iCloud Drive: size and file count per top-level folder (helps find clutter)',
    inputSchema: { type: 'object', properties: {}, required: [] },
    handler: async () => {
      try {
        const summary = await localClient.getDriveSummary();
        const lines = [
          `Root: ${summary.root}`,
          `Files at root level: ${summary.rootLevelFiles} (${localClient.formatBytes(summary.rootLevelSizeBytes)})`,
          '',
          'Folders (by size):'
        ];
        for (const folder of summary.folders) {
          let line = `- ${folder.name}: ${folder.fileCount} files, ${localClient.formatBytes(folder.totalSizeBytes)}`;
          if (folder.truncated) line += ' (scan truncated)';
          if (folder.cloudOnlyCount) line += `, ${folder.cloudOnlyCount} cloud-only`;
          lines.push(line);
        }
        return {
          content: [{
            type: 'text',
            text: lines.join('\n') + '\n\n' + JSON.stringify(summary, null, 2)
          }]
        };
      } catch (error) {
        return handleError(error, 'icloud-drive-summary');
      }
    }
  },
  {
    name: 'scan-icloud-drive',
    description: 'Scan iCloud Drive and list files with path, size, and modified date (inventory)',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Subfolder to scan (default: entire drive)' },
        maxDepth: { type: 'number', description: 'Max folder depth (default: 8)' },
        maxFiles: { type: 'number', description: 'Stop after N files (default: 5000)' }
      },
      required: []
    },
    handler: async ({ path: relPath = '', maxDepth = 8, maxFiles = 5000 }) => {
      try {
        const result = await localClient.walkDrive({ relativePath: relPath, maxDepth, maxFiles });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return handleError(error, 'scan-icloud-drive');
      }
    }
  },
  {
    name: 'search-icloud-files',
    description: 'Search iCloud Drive files by name or path',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Text to find in file or folder name' },
        maxResults: { type: 'number', description: 'Max matches (default: 100)' }
      },
      required: ['query']
    },
    handler: async ({ query, maxResults = 100 }) => {
      try {
        const result = await localClient.searchFiles(query, { maxResults });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return handleError(error, 'search-icloud-files');
      }
    }
  },
  {
    name: 'read-icloud-file',
    description: 'Read a small text file from the local iCloud Drive sync folder (max 512KB)',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File path relative to iCloud Drive root'
        },
        downloadIfCloud: {
          type: 'boolean',
          description: 'Download from iCloud first if cloud-only (default: true, uses icloud-tools)'
        }
      },
      required: ['path']
    },
    handler: async ({ path: relPath, downloadIfCloud = true }) => {
      try {
        if (downloadIfCloud && await icloudTools.isAvailable()) {
          await icloudTools.ensureDownloaded(relPath);
        }
        const file = await localClient.readFileText(relPath);
        return { content: [{ type: 'text', text: JSON.stringify(file, null, 2) }] };
      } catch (error) {
        return handleError(error, 'read-icloud-file');
      }
    }
  }
];

module.exports = { filesTools };
