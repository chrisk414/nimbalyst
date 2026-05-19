import React, { useCallback, useEffect, useState } from 'react';
import { MaterialSymbol } from '@nimbalyst/runtime';

interface DocsModeProps {
  isActive: boolean;
  workspacePath: string;
  workspaceName: string;
}

interface MkDocsEnsureResult {
  available: boolean;
  running: boolean;
  url?: string;
  error?: string;
}

type LoadState = 'idle' | 'loading' | 'ready' | 'unavailable' | 'error';

export function DocsMode({
  isActive,
  workspacePath,
  workspaceName,
}: DocsModeProps) {
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const ensureServer = useCallback(async () => {
    if (!workspacePath) {
      setLoadState('unavailable');
      setError('Open a workspace before opening MkDocs.');
      return;
    }

    setLoadState('loading');
    setError(null);

    try {
      const result = await window.electronAPI.invoke(
        'mkdocs:ensure-server',
        workspacePath,
      ) as MkDocsEnsureResult;

      if (result.available && result.running && result.url) {
        setServerUrl(result.url);
        setLoadState('ready');
        return;
      }

      setServerUrl(result.url ?? null);
      setError(result.error ?? 'MkDocs is not available for this workspace.');
      setLoadState(result.available ? 'error' : 'unavailable');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoadState('error');
    }
  }, [workspacePath]);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    void ensureServer();
  }, [ensureServer, isActive]);

  const refresh = useCallback(() => {
    if (loadState === 'ready') {
      setReloadKey((current) => current + 1);
      return;
    }

    void ensureServer();
  }, [ensureServer, loadState]);

  const openExternal = useCallback(() => {
    if (serverUrl) {
      void window.electronAPI.openExternal(serverUrl);
    }
  }, [serverUrl]);

  return (
    <div
      data-testid="docs-mode"
      className="flex-1 flex flex-col min-h-0 bg-nim text-nim"
    >
      <div className="h-11 px-3 border-b border-nim flex items-center justify-between gap-3 bg-nim-secondary shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <MaterialSymbol icon="menu_book" size={20} />
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">Docs</div>
            <div className="text-xs text-nim-muted truncate">{workspaceName}</div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {serverUrl && (
            <button
              type="button"
              data-testid="docs-mode-open-external"
              className="w-8 h-8 inline-flex items-center justify-center rounded-md border border-transparent bg-transparent text-nim-muted hover:bg-nim-tertiary hover:text-nim cursor-pointer"
              onClick={openExternal}
              aria-label="Open docs in browser"
              title="Open docs in browser"
            >
              <MaterialSymbol icon="open_in_browser" size={18} />
            </button>
          )}
          <button
            type="button"
            data-testid="docs-mode-refresh"
            className="w-8 h-8 inline-flex items-center justify-center rounded-md border border-transparent bg-transparent text-nim-muted hover:bg-nim-tertiary hover:text-nim cursor-pointer"
            onClick={refresh}
            aria-label="Refresh docs"
            title="Refresh docs"
          >
            <MaterialSymbol icon="refresh" size={18} />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden bg-nim">
        {loadState === 'ready' && serverUrl ? (
          <iframe
            key={`${serverUrl}:${reloadKey}`}
            data-testid="docs-mode-frame"
            src={serverUrl}
            title="MkDocs"
            className="w-full h-full border-0 bg-white"
          />
        ) : (
          <div className="h-full flex items-center justify-center px-8 text-center">
            <div className="max-w-md">
              <MaterialSymbol
                icon={loadState === 'loading' || loadState === 'idle' ? 'hourglass_empty' : 'menu_book'}
                size={32}
                className="text-nim-muted mb-3"
              />
              <div className="text-sm font-medium">
                {loadState === 'loading' || loadState === 'idle'
                  ? 'Starting MkDocs'
                  : loadState === 'unavailable'
                    ? 'MkDocs unavailable'
                    : 'MkDocs failed to start'}
              </div>
              {error && (
                <div className="mt-2 text-xs text-nim-muted leading-relaxed">
                  {error}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
