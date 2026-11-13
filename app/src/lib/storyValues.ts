import type { StoryValueDefinition } from '../types/schema';
import { luaCode } from './luaBindings';
import { z } from 'zod';

export type StoryData = boolean | string | number | { [key: string]: StoryData };
export const STORY_VALUE_TYPE = 'boolean|string|number|table';
export function matchesStoryType(value: unknown, type: StoryValueDefinition['type']): boolean {
  switch (type) {
    case 'boolean':
      return typeof value === 'boolean';
    case 'string':
      return typeof value === 'string';
    case 'long':
      return typeof value === 'number' && Number.isSafeInteger(value);
    case 'double':
      return typeof value === 'number' && Number.isFinite(value);
    case 'object':
      return value !== null && typeof value === 'object' && !Array.isArray(value);
  }
}

export function defaultStoryValue(type: StoryValueDefinition['type']): StoryData {
  switch (type) {
    case 'boolean':
      return false;
    case 'long':
    case 'double':
      return 0;
    case 'string':
      return '';
    case 'object':
      return {};
  }
}
export const storyDataSchema: z.ZodType<StoryData> = z.lazy(() =>
  z.union([
    z.boolean(),
    z.string(),
    z
      .number()
      .finite()
      .refine(
        (number) => !Number.isInteger(number) || Number.isSafeInteger(number),
        "Story integers must fit Lua's exact integer range",
      ),
    z.record(z.string().regex(/\S/), storyDataSchema),
  ]),
);

export function validateStoryValueDeclarations(values: readonly StoryValueDefinition[]): void {
  if (!Array.isArray(values)) throw new Error('Story values must be an array.');
  const keys = new Set<string>();
  for (const value of values) {
    if (!value || typeof value.key !== 'string' || !value.key.trim() || keys.has(value.key))
      throw new Error('Story declarations require unique, nonempty keys.');
    if (!['boolean', 'long', 'double', 'string', 'object'].includes(value.type))
      throw new Error(`Unsupported story type for '${value.key}'.`);
    if (value.description !== undefined && typeof value.description !== 'string')
      throw new Error(`Story description for '${value.key}' must be a string.`);
    keys.add(value.key);
  }
}

/** The story type of a Lua literal at the start of `expression`, or undefined for anything else. */
function literalStoryType(expression: string): StoryValueDefinition['type'] | undefined {
  if (/^(true|false)\s*[,)=~<>]/.test(expression) || /^(true|false)\s*$/.test(expression))
    return 'boolean';
  if (/^\{/.test(expression)) return 'object';
  if (/^(['"])(?:\\.|(?!\1)[^\\])*?\1/.test(expression)) return 'string';
  const number = /^(-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)(?![\w.])/.exec(expression);
  if (number) return Number.isSafeInteger(Number(number[1])) ? 'long' : 'double';
  return undefined;
}

export interface StoryValueIssue {
  from: number;
  to: number;
  message: string;
  /** Set for an undeclared key: a declaration matching how the key is used here. */
  undeclared?: StoryValueDefinition;
}

/** Diagnose literal keys/values only. Dynamic Lua expressions are checked by the runtime. */
export function storyValueDiagnostics(
  text: string,
  declarations: readonly StoryValueDefinition[],
): StoryValueIssue[] {
  const code = luaCode(text).code;
  const issues: StoryValueIssue[] = [];
  // A local GameState shadows the global API; avoid diagnosing those calls.
  if (/\blocal\s+(?:\w+\s*,\s*)*GameState\b|\bfunction\s*[\w.:]*\s*\([^)]*\bGameState\b/.test(code))
    return issues;
  for (const call of code.matchAll(
    /\bGameState\.Story\.(Get|Set|Has|Remove)\s*\(/g,
  )) {
    const from = call.index!;
    if (/[\w.:]/.test(code[from - 1] ?? '') || /\bfunction\s*$/.test(code.slice(0, from))) continue;
    const argumentStart = from + call[0].length;
    const literal = /^\s*(['"])([^'"\\\r\n]*)\1\s*(?=[,)])/.exec(text.slice(argumentStart));
    if (!literal) continue;
    const key = literal[2];
    const declaration = declarations.find((v) => v.key === key);
    const to = argumentStart + literal[0].length;
    if (!declaration) {
      // Set('key', value) shows the type through its value, Get('key') == value through the comparison.
      const rest = text.slice(to);
      const used =
        call[1] === 'Set'
          ? literalStoryType(rest.replace(/^,\s*/, ''))
          : call[1] === 'Get'
            ? literalStoryType(rest.replace(/^\)\s*(?:==|~=|<=|>=|<|>)\s*/, ''))
            : undefined;
      issues.push({
        from,
        to,
        message: `Story key '${key}' is not declared in Data. Undeclared keys are allowed.`,
        undeclared: { key, type: used ?? 'boolean' },
      });
      continue;
    }
    if (call[1] === 'Set') {
      const expression = text.slice(to).replace(/^,\s*/, '');
      let actual: StoryValueDefinition['type'] | undefined;
      if (/^(true|false)\s*[,)]/.test(expression)) actual = 'boolean';
      else if (/^\{/.test(expression)) actual = 'object';
      else if (/^(['"])(?:\\.|(?!\1)[^\\])*?\1\s*[,)]/.test(expression)) actual = 'string';
      else {
        const number = /^(-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)\s*[,)]/.exec(expression);
        if (number) actual = Number.isSafeInteger(Number(number[1])) ? 'long' : 'double';
      }
      if (
        actual &&
        actual !== declaration.type &&
        !(actual === 'long' && declaration.type === 'double')
      )
        issues.push({
          from,
          to,
          message: `Story key '${key}' is declared as ${declaration.type}, but this literal is ${actual}.`,
        });
    }
  }
  return issues;
}
