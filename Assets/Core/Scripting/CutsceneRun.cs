using System;
using System.Collections.Generic;
using System.Linq;
using Character;
using Core.Spawning;
using UnityEngine;

namespace Core.Scripting
{
    public enum CutsceneRunStatus { Running, Completed, Skipped, Cancelled, Failed }

    /// <summary>The lifetime/result of one attempt. Disposing an old handle cannot cancel a newer run.</summary>
    public sealed class CutsceneRun : IDisposable
    {
        private readonly CutsceneRunner _owner;
        private readonly CutsceneLuaApi _cutscene;
        public Guid Id { get; } = Guid.NewGuid();
        public CutsceneDefinition Definition { get; }
        public CutsceneRunStatus Status { get; internal set; } = CutsceneRunStatus.Running;
        public string Error { get; internal set; }
        public string Outcome => _cutscene.Outcome;
        internal LuaExecutionSession Session { get; }
        internal CutscenePlacement[] Placements { get; }

        internal CutsceneRun(CutsceneRunner owner, CutsceneDefinition definition,
            LuaExecutionSession session, CutscenePlacement[] placements, CutsceneLuaApi cutscene)
        { _owner = owner; Definition = definition; Session = session; Placements = placements; _cutscene = cutscene; }

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
            var actions = bindings.Describe().modules.SelectMany(module => module.methods)
                .Where(method => method.action != null).ToDictionary(method => method.action.id, StringComparer.Ordinal);
            var ids = definition.Steps.SelectMany(step => actions[step.ActionId].parameters
                    .Where(parameter => parameter.semanticType == "actorRef")
                    .Select(parameter => step.Arguments.Single(argument => argument.Name == parameter.name).Value))
                .Concat(definition.Completion.ActorOutcomes.Select(outcome => outcome.Actor)).Distinct(StringComparer.Ordinal);
            return ids.Select(id =>
            {
                var actor = actors.ResolveActor(id);
                var outcome = definition.Completion.ActorOutcomes.SingleOrDefault(value => value.Actor == id);
                var anchor = outcome == null ? null : actors.ResolveAnchor(outcome.Anchor);
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
            // A failed/cancelled scene may be tearing down an already-destroyed actor.
            // Successful completion checks every actor first and never uses this exception.
            if (completed) RequireLive();
            else if (!Actor || !_root || !_body) return;
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
