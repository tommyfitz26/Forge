import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const PROMPTS_DIR = path.join(process.cwd(), 'lib', 'ai', 'prompts');

const TEMPLATE_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

export class MissingPromptVarError extends Error {
  constructor(public readonly name: string) {
    super(`Prompt variable not provided: ${name}`);
  }
}

export function substitute(template: string, vars: Record<string, string>): string {
  return template.replace(TEMPLATE_RE, (_, name: string) => {
    if (!(name in vars)) throw new MissingPromptVarError(name);
    return vars[name] ?? '';
  });
}

export async function loadPrompt(
  promptFile: string,
  vars: Record<string, string>,
): Promise<string> {
  const raw = await readFile(path.join(PROMPTS_DIR, promptFile), 'utf8');
  return substitute(raw, vars);
}
