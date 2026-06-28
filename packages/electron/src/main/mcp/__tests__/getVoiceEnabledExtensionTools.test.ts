import { beforeEach, describe, expect, it, vi } from 'vitest';

// mcpWorkspaceResolver imports electron + WindowManager at the top. Mock them so
// the registry helpers can be exercised in a plain node test.
vi.mock('electron', () => ({ BrowserWindow: { fromId: vi.fn(() => null) } }));
vi.mock('../../window/WindowManager', () => ({ findWindowByWorkspace: vi.fn(() => null) }));

// The unknown-workspace path dynamically imports the database init + worktree
// store for worktree resolution. Stub them so the test does not load the whole
// (slow, native-binding) DB module graph -- otherwise it flakes on the 5s
// default timeout under parallel load.
vi.mock('../../database/initialize', () => ({ getDatabase: () => ({}) }));
vi.mock('../../services/WorktreeStore', () => ({
  createWorktreeStore: () => ({ getByPath: async () => null }),
}));

import { BrowserWindow } from 'electron';
import { findWindowByWorkspace } from '../../window/WindowManager';
import {
  findWindowIdForWorkspacePath,
  registerExtensionTools,
  getVoiceEnabledExtensionTools,
  workspaceToWindowMap,
  type ExtensionToolDefinition,
} from '../mcpWorkspaceResolver';

const browserWindowFromId = vi.mocked(BrowserWindow.fromId);
const findWindowByWorkspaceMock = vi.mocked(findWindowByWorkspace);

function mockWindow(id: number, destroyed = false) {
  return {
    id,
    isDestroyed: vi.fn(() => destroyed),
  } as unknown as BrowserWindow;
}

function tool(name: string, voiceAgent: boolean | undefined): ExtensionToolDefinition {
  return {
    name,
    description: `desc ${name}`,
    inputSchema: { type: 'object', properties: {} },
    extensionId: 'com.test.fixture',
    scope: 'global',
    voiceAgent,
  };
}

beforeEach(() => {
  workspaceToWindowMap.clear();
  browserWindowFromId.mockReset();
  browserWindowFromId.mockReturnValue(null);
  findWindowByWorkspaceMock.mockReset();
  findWindowByWorkspaceMock.mockReturnValue(null);
});

describe('findWindowIdForWorkspacePath', () => {
  it('refreshes a stale cached window id from the live workspace window', async () => {
    const workspacePath = '/tmp/stale-window-workspace';
    const liveWindow = mockWindow(2);

    workspaceToWindowMap.set(workspacePath, 1);
    browserWindowFromId.mockReturnValue(null);
    findWindowByWorkspaceMock.mockReturnValue(liveWindow);

    await expect(findWindowIdForWorkspacePath(workspacePath)).resolves.toBe(2);
    expect(workspaceToWindowMap.get(workspacePath)).toBe(2);
  });

  it('removes stale cached window ids when no live window exists', async () => {
    const workspacePath = '/tmp/missing-window-workspace';

    workspaceToWindowMap.set(workspacePath, 1);
    browserWindowFromId.mockReturnValue(mockWindow(1, true));
    findWindowByWorkspaceMock.mockReturnValue(null);

    await expect(findWindowIdForWorkspacePath(workspacePath)).resolves.toBeNull();
    expect(workspaceToWindowMap.has(workspacePath)).toBe(false);
  });
});

describe('getVoiceEnabledExtensionTools', () => {
  it('returns only the voiceAgent-flagged tools for a workspace', async () => {
    const ws = '/tmp/voice-tools-workspace';
    registerExtensionTools(
      ws,
      [tool('memory.search', true), tool('csv.get_schema', false), tool('plans.read', undefined)],
      new Map()
    );

    const voiceTools = await getVoiceEnabledExtensionTools(ws);
    expect(voiceTools.map((t) => t.name)).toEqual(['memory.search']);
  });

  it('returns an empty array for an unknown workspace or undefined path', async () => {
    expect(await getVoiceEnabledExtensionTools('/tmp/never-registered')).toEqual([]);
    expect(await getVoiceEnabledExtensionTools(undefined)).toEqual([]);
  });
});
