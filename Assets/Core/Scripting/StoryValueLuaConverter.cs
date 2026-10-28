using System;
using System.Collections.Generic;
using Core.Game;
using MoonSharp.Interpreter;

namespace Core.Scripting
{
    internal static class StoryValueLuaConverter
    {
        public static StoryValue Read(DynValue value) => new(ReadValue(value, new HashSet<Table>()));

        private static object ReadValue(DynValue value, HashSet<Table> parents)
        {
            switch (value.Type)
            {
                case DataType.Boolean: return value.Boolean;
                case DataType.String: return value.String;
                case DataType.Number when double.IsFinite(value.Number): return value.Number;
                case DataType.Table:
                    var table = value.Table;
                    if (table.MetaTable != null || !parents.Add(table))
                        throw new ArgumentException("Story values require plain, acyclic tables.");
                    var dictionary = new Dictionary<string, object>(StringComparer.Ordinal);
                    foreach (var pair in table.Pairs)
                    {
                        if (pair.Key.Type != DataType.String)
                            throw new ArgumentException("Story tables require string keys.");
                        dictionary.Add(pair.Key.String, ReadValue(pair.Value, parents));
                    }
                    parents.Remove(table);
                    return dictionary;
                default: throw new ArgumentException("Story values require booleans, strings, finite numbers or string-keyed tables; use Remove to delete a value.");
            }
        }

        public static DynValue Write(Script script, StoryValue value) => WriteValue(script, value.GetSnapshot());

        private static DynValue WriteValue(Script script, object value)
        {
            switch (value)
            {
                case bool boolean: return DynValue.NewBoolean(boolean);
                case string text: return DynValue.NewString(text);
                case double number: return DynValue.NewNumber(number);
                case long integer:
                    if (integer < -9007199254740991L || integer > 9007199254740991L)
                        throw new InvalidOperationException("This story integer exceeds Lua's exact integer range (±9,007,199,254,740,991).");
                    return DynValue.NewNumber(integer);
                case Dictionary<string, object> dictionary:
                    var table = new Table(script);
                    foreach (var pair in dictionary) table.Set(pair.Key, WriteValue(script, pair.Value));
                    return DynValue.NewTable(table);
                default: throw new InvalidOperationException("Invalid saved story value.");
            }
        }
    }
}
