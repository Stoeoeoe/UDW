using System;
using System.Collections.Generic;

namespace Core.GameplayTags
{
    /// <summary>Compiled all/any/none query. Leaves match descendants; exact(tag) does not.</summary>
    public sealed class TagQuery
    {
        private enum Operation
        {
            Leaf,
            All,
            Any,
            None
        }

        private readonly Operation _operation;
        private readonly string _tag;
        private readonly bool _exact;
        private readonly TagQuery[] _children;

        private TagQuery(Operation operation, string tag, bool exact, TagQuery[] children)
        {
            _operation = operation;
            _tag = tag;
            _exact = exact;
            _children = children;
        }

        public bool Matches(TagSet tags)
        {
            switch (_operation)
            {
                case Operation.Leaf:
                    return tags.Has(_tag, _exact);
                case Operation.All:
                    foreach (var child in _children)
                        if (!child.Matches(tags)) return false;
                    return true;
                default: // Any, None
                    var found = false;
                    foreach (var child in _children)
                        if (child.Matches(tags)) { found = true; break; }
                    return found == (_operation == Operation.Any);
            }
        }

        public static TagQuery Has(string tag) => Leaf(tag, false);
        public static TagQuery Exact(string tag) => Leaf(tag, true);
        public static TagQuery All(params TagQuery[] children) => Group(Operation.All, children);
        public static TagQuery Any(params TagQuery[] children) => Group(Operation.Any, children);
        public static TagQuery None(params TagQuery[] children) => Group(Operation.None, children);

        private static TagQuery Leaf(string tag, bool exact)
        {
            GameplayTag.Validate(tag);
            return new TagQuery(Operation.Leaf, tag, exact, null);
        }

        private static TagQuery Group(Operation operation, TagQuery[] children)
        {
            if (children == null || children.Length == 0 || Array.IndexOf(children, null) >= 0)
                throw new ArgumentException("A tag query group needs at least one non-null child.", nameof(children));
            return new TagQuery(operation, null, false, children);
        }

        /// <summary>Parses expressions such as all(State.Blessed, none(exact(State.Cursed))).</summary>
        public static TagQuery Parse(string expression)
        {
            if (expression == null) throw new ArgumentNullException(nameof(expression));
            try
            {
                var parser = new Parser(expression);
                var result = parser.ReadQuery();
                parser.ExpectEnd();
                return result;
            }
            catch (ArgumentException e) // bad tag names from Validate
            {
                throw new FormatException(e.Message, e);
            }
        }

        private sealed class Parser
        {
            private readonly string _text;
            private int _position;

            public Parser(string text) => _text = text;

            public TagQuery ReadQuery()
            {
                var token = ReadToken();
                if (!TryConsume('(')) return Has(token);

                if (token == "exact")
                {
                    var tag = ReadToken();
                    Expect(')');
                    return Exact(tag);
                }

                var operation = token switch
                {
                    "all" => Operation.All,
                    "any" => Operation.Any,
                    "none" => Operation.None,
                    _ => throw Error($"Unknown gameplay tag query operation '{token}'.")
                };

                var children = new List<TagQuery>();
                do children.Add(ReadQuery());
                while (TryConsume(','));
                Expect(')');
                return Group(operation, children.ToArray());
            }

            public void ExpectEnd()
            {
                SkipWhitespace();
                if (_position < _text.Length) throw Error("Unexpected text after gameplay tag query.");
            }

            private string ReadToken()
            {
                SkipWhitespace();
                var start = _position;
                while (_position < _text.Length && !char.IsWhiteSpace(_text[_position]) &&
                       "(),".IndexOf(_text[_position]) < 0)
                    _position++;
                return start == _position ? throw Error("Expected a gameplay tag or query operation.") : _text.Substring(start, _position - start);
            }

            private bool TryConsume(char character)
            {
                SkipWhitespace();
                if (_position >= _text.Length || _text[_position] != character) return false;
                _position++;
                return true;
            }

            private void Expect(char character)
            {
                if (!TryConsume(character)) throw Error($"Expected '{character}' in gameplay tag query.");
            }

            private void SkipWhitespace()
            {
                while (_position < _text.Length && char.IsWhiteSpace(_text[_position])) _position++;
            }

            private FormatException Error(string message) => new($"{message} (at position {_position})");
        }
    }
}