import { existsSync } from 'fs';
import * as http from 'http';
import * as path from 'path';
import {
  execFileSync,
  spawn,
  type ChildProcessWithoutNullStreams,
} from 'child_process';
import { safeHandle } from '../utils/ipcRegistry';

interface MkDocsServerEntry {
  process: ChildProcessWithoutNullStreams;
  url: string;
  workspacePath: string;
}

interface MkDocsEnsureResult {
  available: boolean;
  running: boolean;
  url?: string;
  error?: string;
}

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 8000;
const SERVER_START_TIMEOUT_MS = 60000;
const servers = new Map<string, MkDocsServerEntry>();

function getServerKey(workspacePath: string): string {
  return `${path.resolve(workspacePath)}:${DEFAULT_PORT}`;
}

function requestUrl(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const request = http.get(url, (response) => {
      response.resume();
      resolve(Boolean(response.statusCode && response.statusCode < 500));
    });

    request.setTimeout(1000, () => {
      request.destroy();
      resolve(false);
    });
    request.on('error', () => resolve(false));
  });
}

async function waitForServer(url: string): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < SERVER_START_TIMEOUT_MS) {
    if (await requestUrl(url)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

function getMkDocsPaths(workspacePath: string): {
  scriptPath: string;
  configPath: string;
} {
  return {
    configPath: path.join(workspacePath, 'mkdocs.yml'),
    scriptPath: path.join(workspacePath, 'tools', 'gdd-docs.ps1'),
  };
}

function killProcessTree(processId: number): void {
  if (process.platform === 'win32') {
    try {
      execFileSync('taskkill.exe', ['/PID', String(processId), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      });
      return;
    } catch {
      // Fall back to the child handle below.
    }
  }
}

export function registerMkDocsHandlers(): void {
  safeHandle(
    'mkdocs:ensure-server',
    async (_event, workspacePath: string): Promise<MkDocsEnsureResult> => {
      if (!workspacePath) {
        return {
          available: false,
          error: 'Open a workspace before opening MkDocs.',
          running: false,
        };
      }

      const { scriptPath, configPath } = getMkDocsPaths(workspacePath);
      if (!existsSync(configPath) || !existsSync(scriptPath)) {
        return {
          available: false,
          error: 'This workspace does not have mkdocs.yml and tools/gdd-docs.ps1.',
          running: false,
        };
      }

      const url = `http://${DEFAULT_HOST}:${DEFAULT_PORT}/`;
      if (await requestUrl(url)) {
        return {
          available: true,
          running: true,
          url,
        };
      }

      const key = getServerKey(workspacePath);
      const existing = servers.get(key);
      if (existing && existing.process.exitCode === null && !existing.process.killed) {
        const started = await waitForServer(existing.url);
        return {
          available: true,
          error: started ? undefined : 'MkDocs is still starting. Try refreshing in a moment.',
          running: started,
          url: existing.url,
        };
      }

      const child = spawn(
        'powershell.exe',
        [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          scriptPath,
          'serve',
          '-HostName',
          DEFAULT_HOST,
          '-Port',
          String(DEFAULT_PORT),
        ],
        {
          cwd: workspacePath,
          windowsHide: true,
        },
      );

      child.stdout.on('data', (chunk) => {
        console.log(`[MkDocs] ${String(chunk).trim()}`);
      });
      child.stderr.on('data', (chunk) => {
        console.warn(`[MkDocs] ${String(chunk).trim()}`);
      });
      child.on('exit', () => {
        const current = servers.get(key);
        if (current?.process === child) {
          servers.delete(key);
        }
      });

      servers.set(key, {
        process: child,
        url,
        workspacePath,
      });

      const started = await waitForServer(url);
      return {
        available: true,
        error: started ? undefined : 'MkDocs did not become reachable before the startup timeout.',
        running: started,
        url,
      };
    },
  );
}

export function shutdownMkDocsServers(): void {
  for (const server of servers.values()) {
    if (server.process.exitCode === null && !server.process.killed) {
      if (server.process.pid) {
        killProcessTree(server.process.pid);
      }
      server.process.kill();
    }
  }
  servers.clear();
}
