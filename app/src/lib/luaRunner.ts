/**
 * Thin wrapper around fengari-web (pre-bundled Lua 5.3 for the browser).
 *
 * fengari-web's bundle already resolves Node built-ins (os, etc.) so it
 * works in the Electron renderer without dynamic require issues.
 */

// @ts-ignore — no type definitions; aliased to fengari-web/dist/fengari-web.bundle.js
import * as fengariBundle from 'fengari';

// The bundle's CJS exports land as named exports via Vite's interop
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengariBundle as unknown as {
  lua: Record<string, unknown>;
  lauxlib: Record<string, unknown>;
  lualib: Record<string, unknown>;
  to_luastring: (s: string) => Uint8Array;
  to_jsstring: (b: Uint8Array) => string;
};

const {
  LUA_OK,
  LUA_MULTRET,
  LUA_TBOOLEAN,
  LUA_TNUMBER,
  LUA_TSTRING,
  LUA_TNIL,
  lua_gettop,
  lua_pcall,
  lua_toboolean,
  lua_tonumber,
  lua_tostring: lua_tostring_raw,
  lua_type,
} = lua as {
  LUA_OK: number;
  LUA_MULTRET: number;
  LUA_TBOOLEAN: number;
  LUA_TNUMBER: number;
  LUA_TSTRING: number;
  LUA_TNIL: number;
  lua_gettop: (L: unknown) => number;
  lua_pcall: (L: unknown, nargs: number, nresults: number, msgh: number) => number;
  lua_toboolean: (L: unknown, idx: number) => boolean;
  lua_tonumber: (L: unknown, idx: number) => number;
  lua_tostring: (L: unknown, idx: number) => Uint8Array | null;
  lua_type: (L: unknown, idx: number) => number;
};

const { luaL_newstate, luaL_loadstring } = lauxlib as {
  luaL_newstate: () => unknown;
  luaL_loadstring: (L: unknown, s: Uint8Array) => number;
};

const { luaL_openlibs } = lualib as {
  luaL_openlibs: (L: unknown) => void;
};

export interface LuaRunResult {
  ok: boolean;
  value?: unknown;
  error?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function luaLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'nil';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return JSON.stringify(value);
  return 'nil';
}

function buildChunk(expression: string, vars: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [path, value] of Object.entries(vars)) {
    const parts = path.split('.');
    for (let i = 1; i < parts.length; i++) {
      const parent = parts.slice(0, i).join('.');
      lines.push(`if ${parent} == nil then ${parent} = {} end`);
    }
    lines.push(`${path} = ${luaLiteral(value)}`);
  }
  lines.push(`return (${expression})`);
  return lines.join('\n');
}

function readStackTop(L: unknown): unknown {
  const t = lua_type(L, -1);
  if (t === LUA_TBOOLEAN) return lua_toboolean(L, -1);
  if (t === LUA_TNUMBER) return lua_tonumber(L, -1);
  if (t === LUA_TSTRING) {
    const raw = lua_tostring_raw(L, -1);
    return raw ? to_jsstring(raw) : '';
  }
  if (t === LUA_TNIL) return null;
  return undefined;
}

function extractError(L: unknown): string {
  const raw = lua_tostring_raw(L, -1);
  return raw ? to_jsstring(raw) : 'Unknown error';
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function evalLuaCondition(expression: string, vars: Record<string, unknown>): LuaRunResult {
  if (!expression.trim()) return { ok: true, value: undefined };
  const L = luaL_newstate();
  luaL_openlibs(L);
  try {
    const code = to_luastring(buildChunk(expression, vars));
    const loadStatus = luaL_loadstring(L, code);
    if (loadStatus !== LUA_OK) return { ok: false, error: extractError(L) };
    const callStatus = lua_pcall(L, 0, LUA_MULTRET, 0);
    if (callStatus !== LUA_OK) return { ok: false, error: extractError(L) };
    const top = lua_gettop(L);
    if (top === 0) return { ok: true, value: undefined };
    return { ok: true, value: readStackTop(L) };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function validateLuaExpression(expression: string, knownPaths: string[]): LuaRunResult {
  if (!expression.trim()) return { ok: true };
  const zeroVars: Record<string, unknown> = {};
  for (const p of knownPaths) zeroVars[p] = null;
  return evalLuaCondition(expression, zeroVars);
}
