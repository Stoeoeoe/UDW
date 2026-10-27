using System;
using System.Collections.Generic;
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
        internal string CurrentStepId => Session.CurrentStepId ?? (Session.ActionsStarted == 0 ? null : Definition.Steps[Session.ActionsStarted - 1].Id);
        internal LuaExecutionSession Session { get; }
        internal LuaBindingRegistry Bindings { get; }
        internal List<CutscenePlacement> Placements { get; }
        internal MapActorLuaApi Characters { get; }

        internal CutsceneRun(CutsceneRunner owner, CutsceneDefinition definition,
            LuaExecutionSession session, CutscenePlacement[] placements, LuaBindingRegistry bindings, MapActorLuaApi characters)
        { _owner = owner; Definition = definition; Session = session; Placements = placements.ToList(); Bindings = bindings; Characters = characters; }

        internal void AddSpawnedActor(MapActorLuaApi characters, string id)
        {
            var placement = CutscenePlacement.PrepareActor(Definition, characters, id);
            placement.Character.SetControlBlocked(this, true);
            Placements.Add(placement);
        }

        public void Cancel() => _owner.Cancel(this);
        public bool Skip() => _owner.Skip(this);
        public void Dispose() => Cancel();
    }

    /// <summary>Prepared placements contain live references only; none of this transient staging is saved.</summary>
    internal sealed class CutscenePlacement
    {
        internal GameCharacter Character { get; }
        private readonly Rigidbody2D _body;
        private readonly SpawnedObject _spawn;
        private readonly Transform _root;
        private readonly Vector3 _originalPosition, _endpoint;
        private readonly Vector2 _originalFacing, _endpointFacing;
        private readonly UrCharacterAnimator.OneShotPlayback _originalHeldPlayback;

        private CutscenePlacement(GameCharacter character, Vector3 endpoint, Vector2 facing)
        {
            Character = character;
            _body = character.GetComponent<Rigidbody2D>();
            if (!_body || !_body.simulated || !character.Controller.isActiveAndEnabled)
                throw new InvalidOperationException($"Cutscene character '{character.name}' requires its live physics and controller.");
            _spawn = character.GetComponentInParent<SpawnedObject>();
            _root = _spawn ? _spawn.transform : character.transform; // The player has no spawn record.
            _originalPosition = character.transform.position;
            _originalFacing = character.Orientation.FacingDirection;
            _originalHeldPlayback = character.Animator.HeldPlayback;
            _endpoint = endpoint;
            // Zero means keep the live facing at completion; cancellation uses the pre-run snapshot.
            _endpointFacing = facing;
        }

        internal static CutscenePlacement[] Prepare(CutsceneDefinition definition, LuaBindingRegistry bindings, MapActorLuaApi characters)
        {
            var actions = bindings.GetActions().ToDictionary(method => method.Action.Id, StringComparer.Ordinal);
            var ids = definition.OnStart.Concat(definition.Steps).Concat(definition.OnComplete.Steps)
                .Where(step => !step.IsCondition)
                .SelectMany(step => actions[step.ActionId].Parameters
                    .Where(parameter => parameter.GetCustomAttribute<LuaReferenceAttribute>()?.Type == "characterRef")
                    .Select(parameter => step.Arguments.Single(argument => argument.Name == parameter.Name).Value))
                .Concat(definition.OnComplete.CharacterPlacements.Select(placement => placement.Character)).Distinct(StringComparer.Ordinal).ToArray();
            foreach (var id in ids)
            {
                characters.RequireKnownActor(id);
                var placement = definition.OnComplete.CharacterPlacements.SingleOrDefault(value => value.Character == id);
                if (placement != null) characters.ResolvePosition(placement.Position);
            }
            return ids.Where(id => !characters.IsPlanned(id)).Select(id => PrepareActor(definition, characters, id)).ToArray();
        }

        internal static CutscenePlacement PrepareActor(CutsceneDefinition definition, MapActorLuaApi characters, string id)
        {
            var character = characters.ResolveActor(id);
            var placement = definition.OnComplete.CharacterPlacements.SingleOrDefault(value => value.Character == id);
            var anchor = placement != null && placement.Position.IsAnchor ? characters.ResolveAnchor(placement.Position.Anchor) : null;
            var endpoint = placement == null ? character.transform.position
                : characters.ResolvePosition(placement.Position) - (character.Graphics.position - character.transform.position);
            var facing = placement == null || placement.Facing == "preserve" ? Vector2.zero
                : !string.IsNullOrEmpty(placement.Facing) ? CardinalDirections.Resolve(placement.Facing)
                : anchor ? anchor.FacingDirection : Vector2.zero;
            return new CutscenePlacement(character, endpoint, facing);
        }

        internal void RequireLive()
        {
            if (!Character || !Character.isActiveAndEnabled || !_root || !_body || !_body.simulated)
                throw new InvalidOperationException("A required cutscene character left the live world.");
        }

        internal void Apply(bool completed)
        {
            // Completion has checked all characters before moving any; cancellation can outlive a destroyed character.
            if (!completed && (!Character || !_root || !_body)) return;
            if (!completed && Character.Animator.HeldPlayback != null &&
                !ReferenceEquals(Character.Animator.HeldPlayback, _originalHeldPlayback))
                Character.Animator.EndInteractionAnimation();
            var position = completed ? _endpoint : _originalPosition;
            var facing = completed ? (_endpointFacing == Vector2.zero ? Character.Orientation.FacingDirection : _endpointFacing) : _originalFacing;
            Character.Controller.Stop();
            _root.position += position - Character.transform.position;
            _body.position = position;
            Character.Orientation.ForceDirection(facing);
            Character.SetMovementState(MovementState.Idle);
            Character.Tiles.OnPlaced();
            if (_spawn) _spawn.SavePosition();
        }
    }
}
