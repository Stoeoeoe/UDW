using System;
using Character;
using UnityEngine;

namespace Core.Scripting
{
    /// <summary>Lets Lua wait for the same navigation move that C# gameplay code can request.</summary>
    public sealed class MoveToAction : ILuaAction
    {
        private readonly NavigationMove _move;

        public MoveToAction(GameCharacter actor, Vector2 destination, float timeoutSeconds) =>
            _move = CharacterNavigation.MoveTo(actor, destination, timeoutSeconds);

        public LuaExecutionStatus Status => _move.Status switch
        {
            NavigationMoveStatus.Moving => LuaExecutionStatus.Running,
            NavigationMoveStatus.Arrived => LuaExecutionStatus.Succeeded,
            NavigationMoveStatus.Unreachable => LuaExecutionStatus.Failed,
            NavigationMoveStatus.Cancelled => LuaExecutionStatus.Cancelled,
            NavigationMoveStatus.TimedOut => LuaExecutionStatus.TimedOut,
            _ => throw new InvalidOperationException($"Unknown navigation result '{_move.Status}'.")
        };
        public string Error => _move.Error;
        public void Tick(float deltaTime) => _move.Tick(deltaTime);
        public void Dispose() => _move.Dispose();
    }
}
