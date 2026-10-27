import type { ScriptingManifest, ScriptingResources } from './scriptingManifest';

type BindingMethod = ScriptingManifest['modules'][number]['methods'][number];
export interface LuaBindingScope {
  mode: 'condition' | 'script' | 'actions';
  context?: string;
  phase?: 'setup' | 'sequence' | 'completion';
}
export const SCRIPT_SCOPE: LuaBindingScope = { mode: 'script' };
export const CONDITION_SCOPE: LuaBindingScope = { mode: 'condition' };

export function bindingParameterDescription(parameter: BindingMethod['parameters'][number]) {
  if (typeof parameter.description === 'string') return parameter.description;
  if (parameter.semanticType === 'characterRef')
    return 'Actor ID: player, a map NPC, or an available spawned role.';
  if (parameter.semanticType === 'anchorRef') return 'Anchor ID from the current map.';
  if (parameter.semanticType === 'dialogueRef') return 'Dialogue ID from this project.';
  if (parameter.resourceType) return `${parameter.resourceType} resource ID.`;
  return parameter.type;
}

/** Mirrors LuaBindingRegistry.Bind and BindActions, including RunLua's regular API. */
export function bindingUnavailableReason(
  method: BindingMethod,
  scope: LuaBindingScope,
): string | undefined {
  if (method.action) {
    if (scope.mode !== 'actions')
      return scope.mode === 'condition'
        ? 'Actions are unavailable in conditions.'
        : 'This action must be a separate action step; it is unavailable inside a Lua block.';
    if (!scope.context || !method.action.contexts.includes(scope.context))
      return `This action is unavailable in the ${scope.context ?? 'current'} context.`;
    if (!scope.phase || !method.action.phases?.includes(scope.phase))
      return `This action is unavailable in the ${scope.phase ?? 'current'} phase.`;
  } else {
    if (scope.mode === 'actions')
      return 'The action session does not expose the regular scripting API.';
    if (scope.mode === 'condition' && method.writesState)
      return 'State-changing calls are unavailable in conditions.';
  }
}

export interface LuaBindingSymbol {
  label: string;
  type: 'namespace' | 'function' | 'constant';
  detail: string;
  description?: string;
  insertText?: string;
  parameters?: ScriptingManifest['modules'][number]['methods'][number]['parameters'];
}

/** Keep the exported Lua path/casing: action IDs are not Lua function names. */
export function bindingSymbols(
  manifest: ScriptingManifest | null,
  scope?: LuaBindingScope,
): LuaBindingSymbol[] {
  const symbols = new Map<string, LuaBindingSymbol>();
  for (const module of manifest?.modules ?? []) {
    const methods = module.methods.filter(
      (method) => !scope || !bindingUnavailableReason(method, scope),
    );
    if (!methods.length) continue;
    const parts = module.path.split('.');
    for (let i = 1; i <= parts.length; i++) {
      const path = parts.slice(0, i).join('.');
      symbols.set(path, { label: path, type: 'namespace', detail: `module ${path}` });
    }
    for (const method of methods) {
      const label = `${module.path}.${method.name}`;
      symbols.set(label, {
        label,
        type: 'function',
        detail: `${label}(${method.parameters.map((p) => `${p.name}: ${p.type}`).join(', ')}): ${method.returnType ?? 'nil'}${method.returnNullable ? ' | nil' : ''}`,
        description:
          typeof method.description === 'string' ? method.description : method.action?.description,
        parameters: method.parameters,
      });
    }
  }
  return [...symbols.values()];
}

/** Mask strings and comments without moving offsets; track the unfinished string. */
export function luaCode(text: string) {
  let code = '';
  let string: { from: number; quote: string } | undefined;
  for (let i = 0; i < text.length; ) {
    const rest = text.slice(i);
    const long = /^(--)?\[(=*)\[/.exec(rest);
    if (long) {
      const close = text.indexOf(`]${long[2]}]`, i + long[0].length);
      const end = close < 0 ? text.length : close + long[2].length + 2;
      code += ' '.repeat(end - i);
      if (close < 0) return { code, blocked: true };
      i = end;
    } else if (rest.startsWith('--')) {
      const end = text.indexOf('\n', i);
      if (end < 0) return { code: code + ' '.repeat(text.length - i), blocked: true };
      code += ' '.repeat(end - i);
      i = end;
    } else if (text[i] === '"' || text[i] === "'") {
      const from = i;
      const quote = text[i++];
      let closed = false;
      while (i < text.length) {
        if (text[i] === '\\') {
          i += Math.min(2, text.length - i);
          continue;
        }
        if (text[i++] === quote) {
          closed = true;
          break;
        }
      }
      code += ' '.repeat(i - from);
      if (!closed) string = { from: from + 1, quote };
    } else {
      code += text[i++];
    }
  }
  return { code, string, blocked: false };
}

export function luaCallContext(text: string) {
  const scanned = luaCode(text);
  if (scanned.blocked) return null;
  const stack: { char: string; name?: string; argument: number; from: number }[] = [];
  for (let i = 0; i < scanned.code.length; i++) {
    const char = scanned.code[i];
    if ('([{'.includes(char)) {
      const name =
        char === '(' ? /([\w]+(?:[.:][\w]+)*)\s*$/.exec(scanned.code.slice(0, i))?.[1] : undefined;
      stack.push({ char, name, argument: 0, from: i + 1 });
    } else if (')]}'.includes(char)) stack.pop();
    else if (char === ',' && stack.length) {
      stack[stack.length - 1].argument++;
      stack[stack.length - 1].from = i + 1;
    }
  }
  const call = [...stack].reverse().find((entry) => entry.name);
  return call
    ? {
        name: call.name!,
        argument: call.argument,
        from: call.from,
        direct: stack[stack.length - 1] === call,
        string: scanned.string,
      }
    : null;
}

export interface LuaArgumentReferences {
  anchors?: readonly { id: string; name: string }[];
  dialogues?: readonly { id: string; name: string }[];
}

function escapeLuaString(value: string, quote: string) {
  return value.replace(/[\\"'\x00-\x1f\x7f]/g, (char) => {
    if (char === '\\' || char === quote) return `\\${char}`;
    if (char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
      return `\\${char.charCodeAt(0).toString().padStart(3, '0')}`;
    return char;
  });
}

export function bindingCompletions(
  text: string,
  symbols: LuaBindingSymbol[],
  resources: ScriptingResources = {},
  characters: readonly { id: string; name: string }[] = [],
  references: LuaArgumentReferences = {},
): { from: number; options: LuaBindingSymbol[]; string?: boolean; argument?: boolean } {
  const scanned = luaCode(text);
  if (scanned.blocked) return { from: text.length, options: [] };
  const call = luaCallContext(text);
  const argumentText = call ? text.slice(call.from).trimStart() : '';
  if (call?.direct && (scanned.string || /^[\w-]*$/.test(argumentText))) {
    const parameter = symbols.find((s) => s.label === call?.name)?.parameters?.[
      call?.argument ?? 0
    ];
    const contextual =
      parameter?.semanticType === 'anchorRef'
        ? references.anchors
        : parameter?.semanticType === 'dialogueRef'
          ? references.dialogues
          : undefined;
    const entries =
      parameter?.semanticType === 'characterRef'
        ? characters.map((c) => ({ id: c.id, description: c.name }))
        : (contextual?.map((entry) => ({ id: entry.id, description: entry.name })) ??
          resources[parameter?.resourceType ?? ''] ??
          []);
    const from = scanned.string?.from ?? text.length - argumentText.length;
    const prefix = text.slice(from).toLowerCase();
    if (entries.length || scanned.string)
      return {
        from,
        string: Boolean(scanned.string),
        argument: true,
        options: entries
          .filter(
            (e) =>
              e.id.toLowerCase().startsWith(prefix) ||
              e.description.toLowerCase().startsWith(prefix),
          )
          .map((e) => ({
            label: e.id,
            insertText: scanned.string
              ? escapeLuaString(e.id, scanned.string.quote)
              : `"${escapeLuaString(e.id, '"')}"`,
            type: 'constant',
            detail: `${e.description}${e.id === 'player' && parameter?.semanticType === 'characterRef' ? ' - current player actor' : ''}`,
          })),
      };
  }
  if (scanned.string) return { from: scanned.string.from, options: [], string: true };
  const path = /[\w.:]*$/.exec(scanned.code)?.[0] ?? '';
  const separator = Math.max(path.lastIndexOf('.'), path.lastIndexOf(':'));
  const parent = separator < 0 ? '' : path.slice(0, separator + 1);
  return {
    from: text.length - path.length,
    options: symbols.filter(
      (s) => s.label.startsWith(path) && (!parent || !/[.:]/.test(s.label.slice(parent.length))),
    ),
  };
}

export function bindingSnippet(symbol: LuaBindingSymbol): string {
  if (symbol.insertText !== undefined) return symbol.insertText;
  if (!symbol.parameters) return symbol.label;
  return `${symbol.label}(${symbol.parameters.map((p, i) => `\${${i + 1}:${p.name.replace(/[\\$}]/g, '\\$&')}}`).join(', ')})`;
}

export function bindingDiagnostics(
  text: string,
  manifest: ScriptingManifest | null,
  scope: LuaBindingScope,
) {
  const code = luaCode(text).code;
  // Be conservative around local aliases/parameters: diagnose only known global API calls.
  const shadowed = new Set<string>();
  for (const match of code.matchAll(
    /\blocal\s+(?:function\s+)?([A-Za-z_]\w*(?:[ \t]*,[ \t]*[A-Za-z_]\w*)*)/g,
  ))
    for (const name of match[1].match(/\b[A-Za-z_]\w*\b/g) ?? []) shadowed.add(name);
  for (const match of code.matchAll(/\bfunction\s*[\w.:]*\s*\(([^)]*)\)/g))
    for (const name of match[1].match(/\b[A-Za-z_]\w*\b/g) ?? []) shadowed.add(name);
  const unavailable = unavailableBindings(manifest, scope);
  const diagnostics: { from: number; to: number; message: string }[] = [];
  for (const match of code.matchAll(/\b[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)+\s*(?=\()/g)) {
    const name = match[0].trimEnd();
    const from = match.index!;
    if (
      /[\w.:]/.test(code[from - 1] ?? '') ||
      shadowed.has(name.split('.')[0]) ||
      /\bfunction\s*$/.test(code.slice(0, from))
    )
      continue;
    const reason = unavailable.get(name);
    if (reason) diagnostics.push({ from, to: from + name.length, message: `${name}: ${reason}` });
  }
  return diagnostics;
}

export function unavailableBindings(manifest: ScriptingManifest | null, scope: LuaBindingScope) {
  const unavailable = new Map<string, string>();
  for (const module of manifest?.modules ?? [])
    for (const method of module.methods) {
      const reason = bindingUnavailableReason(method, scope);
      if (reason) unavailable.set(`${module.path}.${method.name}`, reason);
    }
  return unavailable;
}
