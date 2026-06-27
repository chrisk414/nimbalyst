/**
 * CodexUsageIndicator - Circular progress indicator for Codex usage
 *
 * Displays the 5-hour session utilization as the outer circular progress ring
 * and weekly utilization as the inner ring. Clicking opens a popover with full
 * details. Error states render muted rings with hover details.
 */

import React, { useState, useRef, useCallback } from 'react';
import { useAtomValue } from 'jotai';
import {
  codexUsageAtom,
  codexUsageAvailableAtom,
  codexUsageSessionColorAtom,
  codexUsageWeeklyColorAtom,
  formatResetTime,
} from '../../store/atoms/codexUsageAtoms';
import { useSetting } from '../../hooks/useSetting';
import { CodexUsagePopover } from './CodexUsagePopover';
import { refreshCodexUsage } from '../../store/listeners/codexUsageListeners';

const OUTER_RING_RADIUS = 12;
const INNER_RING_RADIUS = 7.25;
const RING_STROKE_WIDTH = 3;
const OUTER_RING_CIRCUMFERENCE = 2 * Math.PI * OUTER_RING_RADIUS;
const INNER_RING_CIRCUMFERENCE = 2 * Math.PI * INNER_RING_RADIUS;

function clampUtilization(utilization: number): number {
  return Math.max(0, Math.min(utilization, 100));
}

interface CodexUsageIndicatorProps {
  className?: string;
}

export const CodexUsageIndicator: React.FC<CodexUsageIndicatorProps> = ({ className }) => {
  const usage = useAtomValue(codexUsageAtom);
  const isAvailable = useAtomValue(codexUsageAvailableAtom);
  const isEnabled = useSetting('ai.showCodexUsageIndicator');
  const sessionColor = useAtomValue(codexUsageSessionColorAtom);
  const weeklyColor = useAtomValue(codexUsageWeeklyColorAtom);

  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleClick = useCallback(() => {
    setIsPopoverOpen((prev) => !prev);
  }, []);

  const handleRefresh = useCallback(async () => {
    await refreshCodexUsage();
  }, []);

  if (!isEnabled || !isAvailable) {
    return null;
  }

  const hasLoadError = Boolean(usage?.error);
  const limitsAvailable = !hasLoadError && (usage?.limitsAvailable ?? true);
  const sessionUtilization = hasLoadError ? 0 : usage?.fiveHour?.utilization ?? 0;
  const weeklyUtilization = hasLoadError ? 0 : usage?.sevenDay?.utilization ?? 0;
  const sessionProgress = limitsAvailable ? clampUtilization(sessionUtilization) : 0;
  const weeklyProgress = limitsAvailable ? clampUtilization(weeklyUtilization) : 0;
  const sessionStrokeDashoffset = OUTER_RING_CIRCUMFERENCE * (1 - sessionProgress / 100);
  const weeklyStrokeDashoffset = INNER_RING_CIRCUMFERENCE * (1 - weeklyProgress / 100);

  const colorClasses: Record<string, string> = {
    green: 'stroke-green-500',
    yellow: 'stroke-yellow-500',
    red: 'stroke-red-500',
    muted: 'stroke-nim-muted',
  };

  const effectiveSessionColor = limitsAvailable ? sessionColor : 'muted';
  const effectiveWeeklyColor = limitsAvailable ? weeklyColor : 'muted';
  const sessionStrokeColor = colorClasses[effectiveSessionColor] || colorClasses.muted;
  const weeklyStrokeColor = colorClasses[effectiveWeeklyColor] || colorClasses.muted;

  const tooltipContent = usage?.error
    ? `Codex usage unavailable: ${usage.error}`
    : usage
      ? limitsAvailable
        ? `Codex: Session ${Math.round(sessionUtilization)}% (resets ${formatResetTime(usage.fiveHour.resetsAt)}), weekly ${Math.round(weeklyUtilization)}% (resets ${formatResetTime(usage.sevenDay.resetsAt)})`
        : 'Codex usage (limits unavailable)'
      : 'Codex usage unavailable';

  const ariaLabel = usage && !usage.error && limitsAvailable
    ? `Codex usage: session ${Math.round(sessionUtilization)} percent, weekly ${Math.round(weeklyUtilization)} percent`
    : 'Codex Usage';

  return (
    <div className={`relative ${className || ''}`}>
      <button
        ref={buttonRef}
        onClick={handleClick}
        title={tooltipContent}
        className="relative w-9 h-9 flex items-center justify-center bg-transparent border-none rounded-md cursor-pointer transition-all duration-150 p-0 hover:bg-nim-tertiary active:scale-95 focus-visible:outline-2 focus-visible:outline-[var(--nim-primary)] focus-visible:outline-offset-2"
        aria-label={ariaLabel}
        data-testid="codex-usage-indicator"
      >
        <svg
          width="32"
          height="32"
          viewBox="0 0 32 32"
          className="transform -rotate-90"
        >
          {/* Background ring */}
          <circle
            cx="16"
            cy="16"
            r={OUTER_RING_RADIUS}
            fill="none"
            className="stroke-nim-tertiary"
            strokeWidth={RING_STROKE_WIDTH}
          />
          {/* Progress ring */}
          <circle
            cx="16"
            cy="16"
            r={OUTER_RING_RADIUS}
            fill="none"
            className={sessionStrokeColor}
            strokeWidth={RING_STROKE_WIDTH}
            strokeLinecap="round"
            strokeDasharray={OUTER_RING_CIRCUMFERENCE}
            strokeDashoffset={sessionStrokeDashoffset}
            style={{ transition: 'stroke-dashoffset 0.3s ease' }}
          />
          {/* Weekly background ring */}
          <circle
            cx="16"
            cy="16"
            r={INNER_RING_RADIUS}
            fill="none"
            className="stroke-nim-tertiary"
            strokeWidth={RING_STROKE_WIDTH}
          />
          {/* Weekly progress ring */}
          <circle
            cx="16"
            cy="16"
            r={INNER_RING_RADIUS}
            fill="none"
            className={weeklyStrokeColor}
            strokeWidth={RING_STROKE_WIDTH}
            strokeLinecap="round"
            strokeDasharray={INNER_RING_CIRCUMFERENCE}
            strokeDashoffset={weeklyStrokeDashoffset}
            style={{ transition: 'stroke-dashoffset 0.3s ease' }}
          />
        </svg>
      </button>

      {isPopoverOpen && (
        <CodexUsagePopover
          anchorRef={buttonRef}
          onClose={() => setIsPopoverOpen(false)}
          onRefresh={handleRefresh}
        />
      )}
    </div>
  );
};
