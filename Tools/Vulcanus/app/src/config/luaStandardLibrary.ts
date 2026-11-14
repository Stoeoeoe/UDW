export type LuaCompletionType = 'function' | 'method' | 'property' | 'namespace' | 'keyword';

export interface LuaStdlibCompletionItem {
  label: string;
  type: LuaCompletionType;
  detail?: string;
  advanced?: boolean;
}

/**
 * Curated Lua standard-library symbols used by scripting autocomplete.
 * Source reference: https://www.lua.org/manual/5.5/manual.html#6
 */
export const LUA_STDLIB_COMPLETIONS: LuaStdlibCompletionItem[] = [
  // Globals
  { label: 'assert', type: 'function', detail: 'assert(v[, message])' },
  { label: 'error', type: 'function', detail: 'error(message[, level])' },
  { label: 'ipairs', type: 'function', detail: 'ipairs(t)' },
  { label: 'next', type: 'function', detail: 'next(table[, index])' },
  { label: 'pairs', type: 'function', detail: 'pairs(t)' },
  { label: 'pcall', type: 'function', detail: 'pcall(f, ...)' },
  { label: 'select', type: 'function', detail: 'select(index, ...)' },
  { label: 'tonumber', type: 'function', detail: 'tonumber(e[, base])' },
  { label: 'tostring', type: 'function', detail: 'tostring(v)' },
  { label: 'type', type: 'function', detail: 'type(v)' },
  { label: 'xpcall', type: 'function', detail: 'xpcall(f, msgh, ...)' },
  { label: 'print', type: 'function', detail: 'print(...)', advanced: true },
  { label: 'rawget', type: 'function', detail: 'rawget(table, index)', advanced: true },
  { label: 'rawset', type: 'function', detail: 'rawset(table, index, value)', advanced: true },
  { label: 'rawequal', type: 'function', detail: 'rawequal(v1, v2)', advanced: true },

  // math
  { label: 'math', type: 'namespace', detail: 'math.*' },
  { label: 'math.abs', type: 'function', detail: 'math.abs(x)' },
  { label: 'math.ceil', type: 'function', detail: 'math.ceil(x)' },
  { label: 'math.floor', type: 'function', detail: 'math.floor(x)' },
  { label: 'math.max', type: 'function', detail: 'math.max(x, ...)' },
  { label: 'math.min', type: 'function', detail: 'math.min(x, ...)' },
  { label: 'math.random', type: 'function', detail: 'math.random([m[, n]])' },
  { label: 'math.randomseed', type: 'function', detail: 'math.randomseed(x[, y])' },
  { label: 'math.sqrt', type: 'function', detail: 'math.sqrt(x)' },
  { label: 'math.huge', type: 'property', detail: 'math.huge', advanced: true },
  { label: 'math.pi', type: 'property', detail: 'math.pi', advanced: true },

  // string
  { label: 'string', type: 'namespace', detail: 'string.*' },
  { label: 'string.find', type: 'function', detail: 'string.find(s, pattern[, init[, plain]])' },
  { label: 'string.format', type: 'function', detail: 'string.format(format, ...)' },
  { label: 'string.gmatch', type: 'function', detail: 'string.gmatch(s, pattern)' },
  { label: 'string.gsub', type: 'function', detail: 'string.gsub(s, pattern, repl[, n])' },
  { label: 'string.len', type: 'function', detail: 'string.len(s)' },
  { label: 'string.lower', type: 'function', detail: 'string.lower(s)' },
  { label: 'string.match', type: 'function', detail: 'string.match(s, pattern[, init])' },
  { label: 'string.sub', type: 'function', detail: 'string.sub(s, i[, j])' },
  { label: 'string.upper', type: 'function', detail: 'string.upper(s)' },

  // table
  { label: 'table', type: 'namespace', detail: 'table.*' },
  { label: 'table.concat', type: 'function', detail: 'table.concat(list[, sep[, i[, j]]])' },
  { label: 'table.insert', type: 'function', detail: 'table.insert(list[, pos], value)' },
  { label: 'table.remove', type: 'function', detail: 'table.remove(list[, pos])' },
  { label: 'table.sort', type: 'function', detail: 'table.sort(list[, comp])' },
  {
    label: 'table.move',
    type: 'function',
    detail: 'table.move(a1, f, e, t[, a2])',
    advanced: true,
  },

  // utf8 (optional, advanced by default)
  { label: 'utf8', type: 'namespace', detail: 'utf8.*', advanced: true },
  { label: 'utf8.char', type: 'function', detail: 'utf8.char(...)', advanced: true },
  { label: 'utf8.codes', type: 'function', detail: 'utf8.codes(s)', advanced: true },
  { label: 'utf8.len', type: 'function', detail: 'utf8.len(s[, i[, j]])', advanced: true },
  { label: 'utf8.offset', type: 'function', detail: 'utf8.offset(s, n[, i])', advanced: true },

  // coroutine + os as advanced because many scripts do not need them in editor hints
  { label: 'coroutine', type: 'namespace', detail: 'coroutine.*', advanced: true },
  {
    label: 'coroutine.resume',
    type: 'function',
    detail: 'coroutine.resume(co, ...)',
    advanced: true,
  },
  { label: 'coroutine.yield', type: 'function', detail: 'coroutine.yield(...)', advanced: true },
  { label: 'os', type: 'namespace', detail: 'os.*', advanced: true },
  { label: 'os.clock', type: 'function', detail: 'os.clock()', advanced: true },
  { label: 'os.date', type: 'function', detail: 'os.date([format[, time]])', advanced: true },
  { label: 'os.time', type: 'function', detail: 'os.time([table])', advanced: true },
];
