/**
 * CodexUsageService - Tracks OpenAI Codex usage limits
 *
 * This service:
 * - Reads Codex CLI session files from ~/.codex/sessions/
 * - Extracts rate_limits data from token_count events in JSONL files
 * - Accepts live Codex app-server status snapshots when available
 * - Implements activity-aware polling (active when using Codex, sleeps when idle)
 * - Broadcasts usage updates to renderer via IPC
 *
 * Subscription users provide rate_limits. If rate_limits are missing
 * (common for API key sessions), we fall back to token usage so the
 * indicator still appears with limits unavailable.
 */

import { readdir, readFile, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { BrowserWindow } from 'electron';
import { logger } from '../utils/logger';

export interface CodexUsageData {
  fiveHour: {
    utilization: number; // 0-100 percentage
    resetsAt: string | null; // ISO timestamp
  };
  sevenDay: {
    utilization: number;
    resetsAt: string | null;
  };
  credits?: {
    hasCredits: boolean;
    unlimited: boolean;
    balance: number | null;
  };
  tokenUsage?: {
    totalTokens: number;
    lastTokens: number | null;
    contextWindow?: number | null;
  };
  limitsAvailable?: boolean;
  lastUpdated: number; // Unix timestamp
  error?: string;
}

interface CodexRateLimits {
  limit_id?: string;
  primary?: {
    used_percent: number;
    window_minutes: number;
    resets_at: number; // Unix seconds
  } | null;
  secondary?: {
    used_percent: number;
    window_minutes: number;
    resets_at: number; // Unix seconds
  } | null;
  credits?: {
    has_credits: boolean;
    unlimited: boolean;
    balance: number | null;
  } | null;
}

interface CodexTokenUsage {
  totalTokens: number;
  lastTokens: number | null;
  contextWindow?: number | null;
}

interface CodexUsageSnapshot {
  rateLimits: CodexRateLimits | null;
  tokenUsage: CodexTokenUsage | null;
}

interface AppServerRateLimitWindow {
  usedPercent: number;
  windowDurationMins?: number;
  resetsAt?: number;
}

const CODEX_SESSIONS_DIR = join(homedir(), '.codex', 'sessions');
const POLL_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const IDLE_TIMEOUT_MS = 60 * 60 * 1000; // 60 minutes before going to sleep
const MAX_FILES_TO_CHECK = 5; // Check up to N recent session files for rate_limits

class CodexUsageServiceImpl {
  private cachedUsage: CodexUsageData | null = null;
  private cachedUsageSource: 'app-server' | 'session-files' | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private lastActivityTime: number = 0;
  private isPolling: boolean = false;
  private isSleeping: boolean = true;

  initialize(): void {
    logger.main.info('[CodexUsageService] Initialized (sleeping until activity detected)');
  }

  async recordActivity(): Promise<void> {
    this.lastActivityTime = Date.now();

    if (this.isSleeping) {
      // logger.main.info('[CodexUsageService] Waking up due to activity');
      this.isSleeping = false;
      this.startPolling();
      if (this.cachedUsageSource !== 'app-server') {
        await this.refresh();
      }
    }
  }

  getCachedUsage(): CodexUsageData | null {
    return this.cachedUsage;
  }

  updateFromAppServerStatusSnapshot(snapshot: unknown): CodexUsageData | null {
    const usageData = convertAppServerStatusSnapshotToCodexUsageData(snapshot);
    if (!usageData) {
      return null;
    }

    this.cachedUsage = usageData;
    this.cachedUsageSource = 'app-server';
    this.broadcastUpdate();
    return usageData;
  }

  async refresh(): Promise<CodexUsageData> {
    try {
      if (this.cachedUsage && this.cachedUsageSource === 'app-server') {
        return this.cachedUsage;
      }

      const snapshot = await this.findLatestUsageSnapshot();
      logger.main.debug(
        '[CodexUsageService] findLatestUsageSnapshot result:',
        snapshot.rateLimits ? 'rate limits' : snapshot.tokenUsage ? 'token usage' : 'null'
      );
      if (!snapshot.rateLimits && !snapshot.tokenUsage) {
        const noData: CodexUsageData = {
          fiveHour: { utilization: 0, resetsAt: null },
          sevenDay: { utilization: 0, resetsAt: null },
          lastUpdated: Date.now(),
          error: 'No Codex usage data found. Use Codex CLI with a ChatGPT subscription to see usage.',
        };
        this.cachedUsage = noData;
        this.cachedUsageSource = 'session-files';
        this.broadcastUpdate();
        return noData;
      }

      if (!snapshot.rateLimits && snapshot.tokenUsage) {
        const usageData: CodexUsageData = {
          fiveHour: { utilization: 0, resetsAt: null },
          sevenDay: { utilization: 0, resetsAt: null },
          tokenUsage: snapshot.tokenUsage,
          limitsAvailable: false,
          lastUpdated: Date.now(),
        };
        this.cachedUsage = usageData;
        this.cachedUsageSource = 'session-files';
        this.broadcastUpdate();
        return usageData;
      }

      const usageData = this.convertRateLimits(snapshot.rateLimits as CodexRateLimits);
      usageData.limitsAvailable = true;
      if (snapshot.tokenUsage) {
        usageData.tokenUsage = snapshot.tokenUsage;
      }
      this.cachedUsage = usageData;
      this.cachedUsageSource = 'session-files';
      this.broadcastUpdate();
      return usageData;
    } catch (error) {
      logger.main.error('[CodexUsageService] Error refreshing usage:', error);
      const errorData: CodexUsageData = {
        fiveHour: { utilization: 0, resetsAt: null },
        sevenDay: { utilization: 0, resetsAt: null },
        lastUpdated: Date.now(),
        error: error instanceof Error ? error.message : 'Unknown error reading Codex session files',
      };
      this.cachedUsage = errorData;
      this.cachedUsageSource = 'session-files';
      this.broadcastUpdate();
      return errorData;
    }
  }

  stop(): void {
    this.stopPolling();
    logger.main.info('[CodexUsageService] Stopped');
  }

  private startPolling(): void {
    if (this.isPolling) return;

    this.isPolling = true;
    this.pollTimer = setInterval(() => {
      this.pollTick();
    }, POLL_INTERVAL_MS);

    // logger.main.info('[CodexUsageService] Started polling (every 5 minutes)');
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.isPolling = false;
  }

  private async pollTick(): Promise<void> {
    const timeSinceActivity = Date.now() - this.lastActivityTime;
    if (timeSinceActivity > IDLE_TIMEOUT_MS) {
      logger.main.info('[CodexUsageService] Going to sleep due to inactivity');
      this.isSleeping = true;
      this.stopPolling();
      return;
    }

    await this.refresh();
  }

  /**
   * Find the latest usage data from recent Codex session files.
   * Walks the session directory tree to find the most recent files,
   * then reads them to extract rate_limits or token usage from token_count events.
   */
  private async findLatestUsageSnapshot(): Promise<CodexUsageSnapshot> {
    if (!existsSync(CODEX_SESSIONS_DIR)) {
      logger.main.debug('[CodexUsageService] Sessions directory does not exist:', CODEX_SESSIONS_DIR);
      return { rateLimits: null, tokenUsage: null };
    }

    const recentFiles = await this.getRecentSessionFiles();
    logger.main.debug('[CodexUsageService] Found session files:', recentFiles.length);
    if (recentFiles.length === 0) {
      return { rateLimits: null, tokenUsage: null };
    }

    let fallbackTokenUsage: CodexTokenUsage | null = null;

    // Check files from most recent to oldest
    for (const filePath of recentFiles.slice(0, MAX_FILES_TO_CHECK)) {
      logger.main.debug('[CodexUsageService] Checking file:', filePath);
      const snapshot = await this.extractUsageSnapshotFromFile(filePath);
      if (snapshot.tokenUsage && !fallbackTokenUsage) {
        fallbackTokenUsage = snapshot.tokenUsage;
      }
      if (snapshot.rateLimits) {
        logger.main.debug('[CodexUsageService] Found rate_limits in file');
        return { rateLimits: snapshot.rateLimits, tokenUsage: snapshot.tokenUsage ?? fallbackTokenUsage };
      }
    }

    return { rateLimits: null, tokenUsage: fallbackTokenUsage };
  }

  /**
   * Get recent session files sorted by modification time (newest first).
   */
  private async getRecentSessionFiles(): Promise<string[]> {
    const files: Array<{ path: string; mtime: number }> = [];

    try {
      // Walk year/month/day directory structure
      const years = await this.getSortedSubdirs(CODEX_SESSIONS_DIR);
      // Check most recent years first (reversed)
      for (const year of years.reverse().slice(0, 2)) {
        const yearPath = join(CODEX_SESSIONS_DIR, year);
        const months = await this.getSortedSubdirs(yearPath);
        for (const month of months.reverse().slice(0, 2)) {
          const monthPath = join(yearPath, month);
          const days = await this.getSortedSubdirs(monthPath);
          for (const day of days.reverse().slice(0, 3)) {
            const dayPath = join(monthPath, day);
            const entries = await readdir(dayPath);
            const jsonlFiles = entries.filter((f: string) => f.endsWith('.jsonl') && f.startsWith('rollout-'));

            for (const file of jsonlFiles) {
              const filePath = join(dayPath, file);
              try {
                const fileStat = await stat(filePath);
                files.push({ path: filePath, mtime: fileStat.mtimeMs });
              } catch {
                // Skip files we can't stat
              }
            }
          }
          // If we have enough files, stop searching
          if (files.length >= MAX_FILES_TO_CHECK) break;
        }
        if (files.length >= MAX_FILES_TO_CHECK) break;
      }
    } catch (error) {
      logger.main.debug('[CodexUsageService] Error walking session directory:', error);
    }

    // Sort by modification time, newest first
    files.sort((a, b) => b.mtime - a.mtime);
    return files.map((f: { path: string; mtime: number }) => f.path);
  }

  private async getSortedSubdirs(dirPath: string): Promise<string[]> {
    try {
      const entries = await readdir(dirPath, { withFileTypes: true });
      return entries
        .filter(e => e.isDirectory())
        .map(e => e.name)
        .sort();
    } catch {
      return [];
    }
  }

  /**
   * Extract the latest token usage and rate_limits with non-null primary from a JSONL file.
   * Reads the entire file and scans for token_count events.
   */
  private async extractUsageSnapshotFromFile(filePath: string): Promise<CodexUsageSnapshot> {
    let tokenUsage: CodexTokenUsage | null = null;
    let rateLimits: CodexRateLimits | null = null;

    try {
      const content = await readFile(filePath, 'utf8');
      const lines = content.split('\n');

      // Scan from the end for the latest token_count event and rate limits
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (!line) continue;

        try {
          const event = JSON.parse(line);
          if (!tokenUsage) {
            tokenUsage = this.extractTokenUsageFromEvent(event);
          }
          if (!rateLimits) {
            const candidate = this.extractRateLimitsFromEvent(event);
            if (candidate) {
              rateLimits = candidate;
              break;
            }
          }
        } catch {
          // Skip unparseable lines
        }
      }
    } catch (error) {
      logger.main.debug(`[CodexUsageService] Error reading file ${filePath}:`, error);
    }

    return { rateLimits, tokenUsage };
  }

  private getTokenCountPayload(event: Record<string, unknown>): Record<string, unknown> | null {
    if (event.type === 'event_msg') {
      const payload = event.payload as Record<string, unknown> | undefined;
      if (payload?.type === 'token_count') {
        return payload;
      }
      return null;
    }

    if (event.type === 'token_count') {
      return event;
    }

    return null;
  }

  /**
   * Extract rate_limits from a single JSONL event if it's a token_count event
   * with non-null primary data. Delegates to the pure `filterRateLimitsByExpiry`
   * helper below so the expiry logic stays unit-testable. See #120.
   */
  private extractRateLimitsFromEvent(event: Record<string, unknown>): CodexRateLimits | null {
    const tokenCountPayload = this.getTokenCountPayload(event);
    if (!tokenCountPayload) return null;

    const rateLimits = tokenCountPayload.rate_limits as CodexRateLimits | undefined;
    if (!rateLimits?.primary) return null;

    return filterRateLimitsByExpiry(rateLimits, Date.now() / 1000);
  }

  private extractTokenUsageFromEvent(event: Record<string, unknown>): CodexTokenUsage | null {
    const tokenCountPayload = this.getTokenCountPayload(event);
    if (!tokenCountPayload) return null;

    const info = tokenCountPayload.info as
      | {
          total_token_usage?: { total_tokens?: number };
          last_token_usage?: { total_tokens?: number };
        }
      | undefined;
    const totalTokens = info?.total_token_usage?.total_tokens;
    if (typeof totalTokens !== 'number') return null;
    const lastTokens = typeof info?.last_token_usage?.total_tokens === 'number'
      ? info?.last_token_usage?.total_tokens
      : null;
    return { totalTokens, lastTokens };
  }

  private convertRateLimits(rateLimits: CodexRateLimits): CodexUsageData {
    const data: CodexUsageData = {
      fiveHour: {
        utilization: rateLimits.primary?.used_percent ?? 0,
        resetsAt: rateLimits.primary?.resets_at
          ? new Date(rateLimits.primary.resets_at * 1000).toISOString()
          : null,
      },
      sevenDay: {
        utilization: rateLimits.secondary?.used_percent ?? 0,
        resetsAt: rateLimits.secondary?.resets_at
          ? new Date(rateLimits.secondary.resets_at * 1000).toISOString()
          : null,
      },
      lastUpdated: Date.now(),
    };

    if (rateLimits.credits) {
      data.credits = {
        hasCredits: rateLimits.credits.has_credits,
        unlimited: rateLimits.credits.unlimited,
        balance: rateLimits.credits.balance,
      };
    }

    return data;
  }

  private broadcastUpdate(): void {
    const windows = BrowserWindow.getAllWindows();
    for (const window of windows) {
      if (!window.isDestroyed()) {
        window.webContents.send('codex-usage:update', this.cachedUsage);
      }
    }
  }
}

// Singleton instance
export const codexUsageService = new CodexUsageServiceImpl();

/**
 * Drop expired buckets from a CodexRateLimits block.
 *
 * Each window (primary 5h, secondary 7d) carries its own `resets_at` Unix-seconds
 * timestamp. After that moment the window resets and the historical `used_percent`
 * no longer matches reality - but the JSONL session file that produced the line is
 * never rewritten, so the same stale value keeps coming back from the
 * scan-backward loop in `extractUsageSnapshotFromFile`. That is the bug behind
 * #120: indicator sat at 91% indefinitely after the 5-hour window reset and the
 * user's real usage was 0%.
 *
 * Returns null when both windows are absent or expired so the caller can keep
 * scanning older lines for a still-active block. If nothing is active anywhere,
 * the higher-level snapshot falls through to `limitsAvailable: false` and the
 * renderer shows `--` rather than a stale percentage.
 *
 * Exported for unit-testing. Production callers pass `Date.now() / 1000`.
 */
export function filterRateLimitsByExpiry(
  rateLimits: CodexRateLimits,
  nowSeconds: number
): CodexRateLimits | null {
  const primary = rateLimits.primary ?? null;
  const secondary = rateLimits.secondary ?? null;

  const primaryActive =
    primary !== null &&
    (typeof primary.resets_at !== 'number' || primary.resets_at > nowSeconds);
  const secondaryActive =
    secondary !== null &&
    (typeof secondary.resets_at !== 'number' || secondary.resets_at > nowSeconds);

  if (!primaryActive && !secondaryActive) return null;

  return {
    ...rateLimits,
    primary: primaryActive ? primary : null,
    secondary: secondaryActive ? secondary : null,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readAppServerRateLimitWindow(value: unknown): AppServerRateLimitWindow | null {
  const record = asRecord(value);
  if (!record) return null;

  const usedPercent = readFiniteNumber(record.usedPercent);
  if (usedPercent === undefined) return null;

  return {
    usedPercent,
    windowDurationMins: readFiniteNumber(record.windowDurationMins),
    resetsAt: readFiniteNumber(record.resetsAt),
  };
}

function pickCodexRateLimitBucket(rateLimitsResponse: unknown): Record<string, unknown> | null {
  const root = asRecord(rateLimitsResponse);
  if (!root) return null;

  const byId = asRecord(root.rateLimitsByLimitId);
  if (byId) {
    const codex = asRecord(byId.codex);
    if (codex) return codex;

    for (const value of Object.values(byId)) {
      const record = asRecord(value);
      if (record) return record;
    }
  }

  return asRecord(root.rateLimits) ?? root;
}

function windowMatches(window: AppServerRateLimitWindow | null, minutes: number): boolean {
  return window?.windowDurationMins === minutes;
}

function normalizeAppServerRateLimitWindow(
  window: AppServerRateLimitWindow | null
): { utilization: number; resetsAt: string | null } {
  return {
    utilization: window?.usedPercent ?? 0,
    resetsAt: window?.resetsAt ? new Date(window.resetsAt * 1000).toISOString() : null,
  };
}

function filterAppServerWindowByExpiry(
  window: AppServerRateLimitWindow | null,
  nowSeconds: number
): AppServerRateLimitWindow | null {
  if (!window) return null;
  return window.resetsAt === undefined || window.resetsAt > nowSeconds ? window : null;
}

function extractAppServerRateLimitWindows(rateLimitsResponse: unknown): {
  fiveHour: AppServerRateLimitWindow | null;
  sevenDay: AppServerRateLimitWindow | null;
} | null {
  const bucket = pickCodexRateLimitBucket(rateLimitsResponse);
  if (!bucket) return null;

  const primary = readAppServerRateLimitWindow(bucket.primary);
  const secondary = readAppServerRateLimitWindow(bucket.secondary);
  if (!primary && !secondary) return null;

  const windows = [primary, secondary];
  return {
    fiveHour: windows.find((window) => windowMatches(window, 300)) ?? primary,
    sevenDay: windows.find((window) => windowMatches(window, 10080)) ?? secondary,
  };
}

function extractTokenCount(value: unknown): number | undefined {
  const record = asRecord(value);
  return readFiniteNumber(record?.totalTokens)
    ?? readFiniteNumber(record?.total_tokens)
    ?? readFiniteNumber(value);
}

function extractAppServerTokenUsage(snapshot: Record<string, unknown>): CodexTokenUsage | null {
  const tokenUsage = asRecord(snapshot.tokenUsage);
  if (!tokenUsage) return null;

  const total = asRecord(tokenUsage.total);
  const last = asRecord(tokenUsage.last);
  const config = asRecord(asRecord(snapshot.configResponse)?.config);
  const totalTokens = extractTokenCount(total)
    ?? readFiniteNumber(tokenUsage.totalTokens)
    ?? readFiniteNumber(tokenUsage.total_tokens);

  if (totalTokens === undefined) return null;

  const lastTokens = extractTokenCount(last)
    ?? readFiniteNumber(tokenUsage.lastTokens)
    ?? readFiniteNumber(tokenUsage.last_tokens)
    ?? null;

  const contextWindow = readFiniteNumber(tokenUsage.modelContextWindow)
    ?? readFiniteNumber(config?.model_context_window)
    ?? null;

  return { totalTokens, lastTokens, contextWindow };
}

/**
 * Convert the live Codex app-server status snapshot used by /status and /usage
 * into the renderer's existing CodexUsageData shape. Exported for unit tests;
 * production callers should use codexUsageService.updateFromAppServerStatusSnapshot.
 */
export function convertAppServerStatusSnapshotToCodexUsageData(
  snapshot: unknown,
  nowMs = Date.now()
): CodexUsageData | null {
  const root = asRecord(snapshot);
  if (!root) return null;

  const rawWindows = extractAppServerRateLimitWindows(root.rateLimitsResponse);
  const nowSeconds = nowMs / 1000;
  const windows = rawWindows
    ? {
        fiveHour: filterAppServerWindowByExpiry(rawWindows.fiveHour, nowSeconds),
        sevenDay: filterAppServerWindowByExpiry(rawWindows.sevenDay, nowSeconds),
      }
    : null;
  const tokenUsage = extractAppServerTokenUsage(root);
  const hasActiveLimits = Boolean(windows?.fiveHour || windows?.sevenDay);
  if (!hasActiveLimits && !tokenUsage) return null;

  const usageData: CodexUsageData = hasActiveLimits && windows
    ? {
        fiveHour: normalizeAppServerRateLimitWindow(windows.fiveHour),
        sevenDay: normalizeAppServerRateLimitWindow(windows.sevenDay),
        limitsAvailable: true,
        lastUpdated: nowMs,
      }
    : {
        fiveHour: { utilization: 0, resetsAt: null },
        sevenDay: { utilization: 0, resetsAt: null },
        limitsAvailable: false,
        lastUpdated: nowMs,
      };

  if (tokenUsage) {
    usageData.tokenUsage = tokenUsage;
  }

  return usageData;
}

// Exported only for tests. Do not consume from production code.
export type { CodexRateLimits };
