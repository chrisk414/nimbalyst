import { describe, expect, it } from 'vitest';
import {
  buildCodexSlashCommandPrompt,
  getNimbalystCodexSlashCommandDefinition,
  getNimbalystCodexSlashCommandNames,
  getNimbalystCodexSlashCommandNamesForProvider,
  isKnownCodexCliSlashCommand,
  isNimbalystSupportedCodexSlashCommand,
} from '../codexSlashCommands';

describe('codexSlashCommands', () => {
  it('advertises only Codex commands Nimbalyst can execute', () => {
    expect(getNimbalystCodexSlashCommandNames()).toEqual([
      'diff',
      'init',
      'review',
      'status',
      'usage',
    ]);

    expect(isNimbalystSupportedCodexSlashCommand('status')).toBe(true);
    expect(isNimbalystSupportedCodexSlashCommand('/usage')).toBe(true);
    expect(isNimbalystSupportedCodexSlashCommand('/review')).toBe(true);
    expect(isNimbalystSupportedCodexSlashCommand('compact')).toBe(false);
    expect(isNimbalystSupportedCodexSlashCommand('mcp')).toBe(false);
  });

  it('filters provider-executed commands for Codex transports that cannot run them', () => {
    expect(getNimbalystCodexSlashCommandNamesForProvider('openai-codex')).toEqual([
      'diff',
      'init',
      'review',
      'status',
      'usage',
    ]);

    expect(getNimbalystCodexSlashCommandNamesForProvider('openai-codex-acp')).toEqual([
      'diff',
      'init',
      'review',
    ]);
  });

  it('keeps unsupported Codex CLI commands recognizable for blocking', () => {
    expect(isKnownCodexCliSlashCommand('compact')).toBe(true);
    expect(isKnownCodexCliSlashCommand('/model')).toBe(true);
    expect(isKnownCodexCliSlashCommand('definitely-not-codex')).toBe(false);
  });

  it('builds prompt-backed command expansions', () => {
    const reviewPrompt = buildCodexSlashCommandPrompt('review', 'focus on auth');
    expect(reviewPrompt).toContain('Review the current working tree.');
    expect(reviewPrompt).toContain('Additional user instructions: focus on auth');

    expect(buildCodexSlashCommandPrompt('status')).toBeNull();
    expect(getNimbalystCodexSlashCommandDefinition('init')?.execution).toBe('prompt');
    expect(getNimbalystCodexSlashCommandDefinition('status')?.execution).toBe('provider');
    expect(getNimbalystCodexSlashCommandDefinition('usage')?.execution).toBe('provider');
  });
});
