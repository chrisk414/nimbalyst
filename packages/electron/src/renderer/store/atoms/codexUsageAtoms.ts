/**
 * Atoms for Codex usage tracking
 *
 * These atoms store usage data parsed from Codex CLI session files,
 * including 5-hour session and weekly utilization percentages.
 * Only populated for subscription users (ChatGPT Plus/Pro).
 */

import { atom } from 'jotai';
import { formatResetTime } from './claudeUsageAtoms';

export { formatResetTime };

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

export const codexUsageAtom = atom<CodexUsageData | null>(null);

// The usage-indicator enabled toggle now lives in the flat-key SettingsService
// under `ai.showCodexUsageIndicator`. Read it with
// `useSetting('ai.showCodexUsageIndicator')` and write it with
// `useSetSetting('ai.showCodexUsageIndicator')` -- it hydrates before React
// mounts and stays in lockstep across windows via the broadcast.

export const codexUsageAvailableAtom = atom((get) => {
  const usage = get(codexUsageAtom);
  if (!usage) return false;
  // Keep the indicator visible for load failures so users can see the reason in tooltip/popover.
  if (usage.error) return true;
  // Show if we have actual usage data (utilization or reset times), or credits info.
  const hasUsageData =
    usage.fiveHour.utilization > 0 ||
    usage.sevenDay.utilization > 0 ||
    Boolean(usage.fiveHour.resetsAt) ||
    Boolean(usage.sevenDay.resetsAt);
  const hasCreditsData = Boolean(usage.credits?.hasCredits) || usage.credits?.balance !== null;
  const hasTokenUsage = (usage.tokenUsage?.totalTokens ?? 0) > 0;
  return hasUsageData || hasCreditsData || hasTokenUsage;
});

export function getCodexContextUsagePercent(usage: CodexUsageData | null | undefined): number | null {
  const totalTokens = usage?.tokenUsage?.totalTokens;
  const contextWindow = usage?.tokenUsage?.contextWindow;
  if (typeof totalTokens !== 'number' || typeof contextWindow !== 'number' || contextWindow <= 0) {
    return null;
  }
  return Math.max(0, Math.min(100, (totalTokens / contextWindow) * 100));
}

export function getUsageColor(utilization: number): 'green' | 'yellow' | 'red' {
  if (utilization >= 80) return 'red';
  if (utilization >= 50) return 'yellow';
  return 'green';
}

export function formatCompactTokenCount(value: number): string {
  if (value >= 1_000_000) return `${Math.round(value / 100_000) / 10}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return `${value}`;
}

export const codexUsageSessionColorAtom = atom((get) => {
  const usage = get(codexUsageAtom);
  if (!usage) return 'muted';
  return getUsageColor(usage.fiveHour.utilization);
});

export const codexUsageWeeklyColorAtom = atom((get) => {
  const usage = get(codexUsageAtom);
  if (!usage) return 'muted';
  return getUsageColor(usage.sevenDay.utilization);
});
