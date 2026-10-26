using System;
using Character;
using UnityEngine;

namespace Core.Scripting
{
    /// <summary>Lets Lua wait for the same navigation move that C# gameplay code can request.</summary>
    public sealed class MoveToAction : ILuaAction
    {
        private readonly NavigationMove _move;

        public MoveToAction(GameCharacter character, Vector2 destination) =>
            _move = CharacterNavigation.MoveTo(character, destination);

        public bool IsCompleted => _move.Status == NavigationMoveStatus.Arrived;
        public void Tick(float deltaTime)
        {
            _move.Tick(deltaTime);
            if (_move.Status is NavigationMoveStatus.Unreachable or NavigationMoveStatus.Cancelled)
                throw new InvalidOperationException(_move.Error ?? "Movement stopped before arrival.");
        }
        public void Dispose() => _move.Dispose();
    }
}
