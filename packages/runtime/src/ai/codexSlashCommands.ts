export type CodexSlashCommandExecution = 'local' | 'prompt' | 'provider';

export interface CodexSlashCommandDefinition {
  name: string;
  description: string;
  execution: CodexSlashCommandExecution;
  argumentHint?: string;
  buildPrompt?: (args: string) => string;
}

function withOptionalInstructions(base: string, args: string): string {
  const trimmedArgs = args.trim();
  if (!trimmedArgs) {
    return base;
  }

  return `${base}\n\nAdditional user instructions: ${trimmedArgs}`;
}

export const NIMBALYST_CODEX_SLASH_COMMANDS: ReadonlyArray<CodexSlashCommandDefinition> = [
  {
    name: 'diff',
    description: 'Show the current Git branch and changed file summary',
    execution: 'local',
  },
  {
    name: 'init',
    description: 'Ask Codex to create or update AGENTS.md for this repository',
    execution: 'prompt',
    buildPrompt: (args: string) => withOptionalInstructions(
      'Inspect this repository and create or update AGENTS.md with concise instructions for future AI coding agents. Preserve existing guidance when AGENTS.md already exists, follow repository conventions, and include package-level notes only where they are useful.',
      args
    ),
  },
  {
    name: 'review',
    description: 'Ask Codex to review the current working tree',
    execution: 'prompt',
    buildPrompt: (args: string) => withOptionalInstructions(
      'Review the current working tree. Prioritize bugs, behavioral regressions, security risks, and missing tests. Lead with findings ordered by severity and include concrete file and line references where possible.',
      args
    ),
  },
  {
    name: 'status',
    description: 'Display the Codex session status reported by Codex',
    execution: 'provider',
  },
  {
    name: 'usage',
    description: 'Display Codex usage limits and current context window',
    execution: 'provider',
  },
];

export const CODEX_CLI_SLASH_COMMANDS: ReadonlyArray<string> = [
  'agent',
  'apps',
  'approve',
  'archive',
  'btw',
  'clear',
  'compact',
  'copy',
  'debug-config',
  'delete',
  'diff',
  'exit',
  'experimental',
  'fast',
  'feedback',
  'fork',
  'goal',
  'hooks',
  'ide',
  'import',
  'init',
  'keymap',
  'logout',
  'mcp',
  'memories',
  'mention',
  'model',
  'new',
  'permissions',
  'personality',
  'plan',
  'plugins',
  'ps',
  'quit',
  'raw',
  'resume',
  'review',
  'sandbox-add-read-dir',
  'side',
  'skills',
  'status',
  'statusline',
  'stop',
  'theme',
  'title',
  'usage',
  'vim',
];

const NIMBALYST_CODEX_SLASH_COMMAND_BY_NAME = new Map(
  NIMBALYST_CODEX_SLASH_COMMANDS.map(command => [command.name, command])
);

const CODEX_CLI_SLASH_COMMAND_SET = new Set(CODEX_CLI_SLASH_COMMANDS);

export function normalizeCodexSlashCommandName(name: string): string {
  return name.trim().replace(/^\//, '').toLowerCase();
}

export function getNimbalystCodexSlashCommandDefinitions(): CodexSlashCommandDefinition[] {
  return NIMBALYST_CODEX_SLASH_COMMANDS.map(command => ({ ...command }));
}

export function getNimbalystCodexSlashCommandNames(): string[] {
  return NIMBALYST_CODEX_SLASH_COMMANDS.map(command => command.name);
}

export function getNimbalystCodexSlashCommandNamesForProvider(
  provider?: string | null
): string[] {
  const includeProviderCommands = provider === 'openai-codex';
  return NIMBALYST_CODEX_SLASH_COMMANDS
    .filter(command => includeProviderCommands || command.execution !== 'provider')
    .map(command => command.name);
}

export function getNimbalystCodexSlashCommandDefinition(
  name: string
): CodexSlashCommandDefinition | undefined {
  return NIMBALYST_CODEX_SLASH_COMMAND_BY_NAME.get(normalizeCodexSlashCommandName(name));
}

export function isNimbalystSupportedCodexSlashCommand(name: string): boolean {
  return NIMBALYST_CODEX_SLASH_COMMAND_BY_NAME.has(normalizeCodexSlashCommandName(name));
}

export function isKnownCodexCliSlashCommand(name: string): boolean {
  return CODEX_CLI_SLASH_COMMAND_SET.has(normalizeCodexSlashCommandName(name));
}

export function buildCodexSlashCommandPrompt(name: string, args = ''): string | null {
  const definition = getNimbalystCodexSlashCommandDefinition(name);
  if (!definition || definition.execution !== 'prompt' || !definition.buildPrompt) {
    return null;
  }

  return definition.buildPrompt(args);
}
