using System;
using System.Linq;
using System.Reflection;
using Character;
using Core.Spawning;
using UnityEngine;

namespace Core.Scripting
{
    /// <summary>The handle for one playback. Disposing an old handle cannot cancel a newer run.</summary>
    public sealed class CutsceneRun : IDisposable
    {
        private readonly CutsceneRunner _owner;
        public CutsceneDefinition Definition { get; }
        public bool IsRunning { get; internal set; } = true;
        public bool Skipped { get; internal set; }
        // Imported Lua enters one action per authored step, including actions that yield.
        internal string CurrentStepId => Session.ActionsStarted == 0 ? null : Definition.Steps[Session.ActionsStarted - 1].Id;
        internal LuaExecutionSession Session { get; }
        internal LuaBindingRegistry Bindings { get; }
        internal CutscenePlacement[] Placements { get; }

        internal CutsceneRun(CutsceneRunner owner, CutsceneDefinition definition,
            LuaExecutionSession session, CutscenePlacement[] placements, LuaBindingRegistry bindings)
        { _owner = owner; Definition = definition; Session = session; Placements = placements; Bindings = bindings; }

        public void Cancel() => _owner.Cancel(this);
        public bool Skip() => _owner.Skip(this);
        public void Dispose() => Cancel();
    }

    /// <summary>Prepared placements contain live references only; none of this transient staging is saved.</summary>
    internal sealed class CutscenePlacement
    {
        internal GameCharacter Actor { get; }
        private readonly Rigidbody2D _body;
        private readonly SpawnedObject _spawn;
        private readonly Transform _root;
        private readonly Vector3 _originalPosition, _endpoint;
        private readonly Vector2 _originalFacing, _endpointFacing;

        private CutscenePlacement(GameCharacter actor, Vector3 endpoint, Vector2 facing)
        {
            Actor = actor;
            _body = actor.GetComponent<Rigidbody2D>();
            if (!_body || !_body.simulated || !actor.Controller.isActiveAndEnabled)
                throw new InvalidOperationException($"Cutscene actor '{actor.name}' requires its live physics and controller.");
            _spawn = actor.GetComponentInParent<SpawnedObject>();
            _root = _spawn ? _spawn.transform : actor.transform; // The player has no spawn record.
            _originalPosition = actor.transform.position;
            _originalFacing = actor.Orientation.FacingDirection;
            _endpoint = endpoint;
            // Zero is the anchor's explicit 'no facing override'; retain the pre-run direction on either terminal path.
            _endpointFacing = facing == Vector2.zero ? _originalFacing : facing;
        }

        internal static CutscenePlacement[] Prepare(CutsceneDefinition definition, LuaBindingRegistry bindings, MapActorLuaApi actors)
        {
            var actions = bindings.GetActions().ToDictionary(method => method.Action.Id, StringComparer.Ordinal);
            var ids = definition.OnStart.Concat(definition.Steps).Concat(definition.OnComplete.Steps)
                .SelectMany(step => actions[step.ActionId].Parameters
                    .Where(parameter => parameter.GetCustomAttribute<LuaReferenceAttribute>()?.Type == "actorRef")
                    .Select(parameter => step.Arguments.Single(argument => argument.Name == parameter.Name).Value))
                .Concat(definition.OnComplete.ActorPlacements.Select(placement => placement.Actor)).Distinct(StringComparer.Ordinal);
            return ids.Select(id =>
            {
                var actor = actors.ResolveActor(id);
                var placement = definition.OnComplete.ActorPlacements.SingleOrDefault(value => value.Actor == id);
                var anchor = placement == null ? null : actors.ResolveAnchor(placement.Anchor);
                return new CutscenePlacement(actor, anchor ? anchor.transform.position : actor.transform.position,
                    anchor ? anchor.FacingDirection : actor.Orientation.FacingDirection);
            }).ToArray();
        }

        internal void RequireLive()
        {
            if (!Actor || !Actor.isActiveAndEnabled || !_root || !_body || !_body.simulated)
                throw new InvalidOperationException("A required cutscene actor left the live world.");
        }

        internal void Apply(bool completed)
        {
            // Completion has checked all actors before moving any; cancellation can outlive a destroyed actor.
            if (!completed && (!Actor || !_root || !_body)) return;
            var position = completed ? _endpoint : _originalPosition;
            Actor.Controller.Stop();
            _root.position += position - Actor.transform.position;
            _body.position = position;
            Actor.Orientation.ForceDirection(completed ? _endpointFacing : _originalFacing);
            Actor.SetMovementState(MovementState.Idle);
            Actor.Tiles.OnPlaced();
            if (_spawn) _spawn.SavePosition();
        }
    }
}
