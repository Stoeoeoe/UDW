/**
 * Conditions must yield a boolean. Unity evaluates them with Lua truthiness, so a number, string or table is always
 * true and nil is always false: `DivineFavour.GetFavour('x')` passes whatever the favour is. This finds operands of
 * a condition whose type is known not to be boolean. Anything it cannot type is left alone.
 */
import type { ScriptingManifest } from './scriptingManifest';
import type { StoryValueDefinition } from '../types/schema';
import { luaCode } from './luaBindings';

export interface ConditionTypeIssue {
  from: number;
  to: number;
  message: string;
}

type Range = [number, number];

const STORY_TYPES: Record<StoryValueDefinition['type'], string> = {
  boolean: 'boolean',
  long: 'number',
  double: 'number',
  string: 'string',
  object: 'table',
};

export function conditionTypeIssues(
  text: string,
  manifest: ScriptingManifest | null,
  storyValues: readonly StoryValueDefinition[] = [],
  variables: readonly { name: string; type: string }[] = [],
): ConditionTypeIssue[] {
  const scanned = luaCode(text);
  if (scanned.blocked || scanned.string) return [];
  const code = scanned.code;

  const returnTypes = new Map<string, string>();
  /** Field types of the tables functions return, such as Time.GetCurrent() -> hour: integer. */
  const returnFields = new Map<string, Map<string, string>>();
  for (const module of manifest?.modules ?? [])
    for (const method of module.methods) {
      const table = manifest?.tables?.find((entry) => entry.name === method.returnType);
      if (table)
        returnFields.set(
          `${module.path}.${method.name}`,
          new Map(table.fields.map((field) => [field.name, field.type])),
        );
      returnTypes.set(
        `${module.path}.${method.name}`,
        method.outputs?.length === 1 ? method.outputs[0].type : (method.returnType ?? 'nil'),
      );
    }

  const issues: ConditionTypeIssue[] = [];

  const trim = ([from, to]: Range): Range => {
    while (from < to && /\s/.test(code[from])) from++;
    while (to > from && /\s/.test(code[to - 1])) to--;
    return [from, to];
  };

  /** Index of the bracket closing the one at `open`, or -1. */
  const closing = (open: number, to: number) => {
    let depth = 0;
    for (let i = open; i < to; i++) {
      if ('([{'.includes(code[i])) depth++;
      else if (')]}'.includes(code[i]) && --depth === 0) return i;
    }
    return -1;
  };

  /** Splits at top-level `and` / `or`: Lua returns one of the operands, so each must be boolean. */
  const operands = ([from, to]: Range): Range[] => {
    const result: Range[] = [];
    let depth = 0;
    let start = from;
    for (let i = from; i < to; i++) {
      if ('([{'.includes(code[i])) depth++;
      else if (')]}'.includes(code[i])) depth--;
      else if (depth === 0) {
        const keyword = /^(and|or)\b/.exec(code.slice(i, to));
        if (keyword && !/[\w.]/.test(code[i - 1] ?? '')) {
          result.push([start, i]);
          i += keyword[0].length - 1;
          start = i + 1;
        }
      }
    }
    result.push([start, to]);
    return result;
  };

  const hasTopLevelComparison = ([from, to]: Range) => {
    let depth = 0;
    for (let i = from; i < to; i++) {
      if ('([{'.includes(code[i])) depth++;
      else if (')]}'.includes(code[i])) depth--;
      else if (depth === 0 && /^(==|~=|<=|>=|<|>)/.test(code.slice(i, i + 2))) return true;
    }
    return false;
  };

  /** The Lua type an operand is known to have, or undefined. */
  const typeOf = ([from, to]: Range): string | undefined => {
    const source = text.slice(from, to);
    if (/^(true|false)$/.test(source)) return 'boolean';
    if (source === 'nil') return 'nil';
    if (/^-?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(source)) return 'number';
    if (/^(['"])(?:\\.|(?!\1)[^\\])*\1$/.test(source) || /^\[(=*)\[[\s\S]*\]\1\]$/.test(source))
      return 'string';
    if (code[from] === '{' && closing(from, to) === to - 1) return 'table';
    const variable = /^Cutscene\.Variables\.([A-Za-z_]\w*)$/.exec(source);
    if (variable) return variables.find((entry) => entry.name === variable[1])?.type;
    const call = /^([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)+)\s*\(/.exec(code.slice(from, to));
    if (!call) return undefined;
    // The call must be the whole operand, or a field of the table it returns: not Foo.Bar(x) + 1.
    const close = closing(from + call[0].length - 1, to);
    if (close < 0) return undefined;
    if (close !== to - 1) {
      const field = /^\s*\.\s*([A-Za-z_]\w*)$/.exec(code.slice(close + 1, to));
      return field ? returnFields.get(call[1])?.get(field[1]) : undefined;
    }
    if (call[1] === 'GameState.Story.Get') {
      const key = /^\s*(['"])([^'"\\\r\n]*)\1\s*$/.exec(
        text.slice(from + call[0].length, to - 1),
      )?.[2];
      const declared = storyValues.find((value) => value.key === key);
      return declared ? STORY_TYPES[declared.type] : undefined;
    }
    return returnTypes.get(call[1]);
  };

  const check = (range: Range) => {
    for (const operand of operands(range)) {
      const [from, to] = trim(operand);
      if (from >= to) continue;
      if (/^not\b/.test(code.slice(from, to))) continue;
      if (code[from] === '(' && closing(from, to) === to - 1) {
        check([from + 1, to - 1]);
        continue;
      }
      if (hasTopLevelComparison([from, to])) continue;
      const type = typeOf([from, to]);
      // Unknown types and unions that include boolean (such as a story value) may be fine.
      if (!type || type.split('|').includes('boolean')) continue;
      const shown = text.slice(from, to);
      const name = type === 'integer' ? 'number' : type;
      const example =
        name === 'number' ? `${shown} >= 1` : name === 'string' ? `${shown} == 'value'` : null;
      issues.push({
        from,
        to,
        message:
          type === 'nil'
            ? `${shown} is nil, so this is never true.`
            : `${shown} is a ${name}, which always counts as true. ` +
              (example
                ? `Compare it, for example ${example}.`
                : 'Use a check that gives true or false.'),
      });
    }
  };

  check(trim([0, code.length]));
  return issues;
}
