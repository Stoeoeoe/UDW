using System;
using System.Reflection;
using Character;
using Character.Abilities;
using Character.Animations;
using Animancer;
using Core.Common.Editor;
using Core.Location;
using Core.Context;
using Core.Game;
using DG.Tweening;
using MoreMountains.Feedbacks;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.LowLevel;
using Object = UnityEngine.Object;

namespace Interaction.Editor
{
    /// <summary>Records optional seating cues without requiring audio or particles in the test scene.</summary>
    public sealed class SeatingFeedbackProbe : MMFeedbacks
    {
        public int Plays;
        public override void PlayFeedbacks() => Plays++;
    }

    /// <summary>Checks exclusive occupation, animated release, presentation cues and interrupted character lifecycles.</summary>
    public sealed class InteractionSlotTests
    {
        private GameTestFixture _fixture;
        private MainCharacter _character, _other;
        private InteractionSlot _slot;
        private Vector3 _graphicsPosition, _graphicsScale;
        private SeatingFeedbackProbe _entry, _exit;
        private bool _dotweenWasInitialized;
        private static readonly FieldInfo DOTweenInitialized = typeof(DOTween).GetField("initialized", BindingFlags.Static | BindingFlags.NonPublic);

        [SetUp]
        public void SetUp()
        {
            // Edit Mode skips DOTween's runtime initialization, including Kill(). These tests advance
            // their own tweens manually; enable that gate temporarily without creating a runtime driver.
            _dotweenWasInitialized = (bool)DOTweenInitialized.GetValue(null);
            DOTweenInitialized.SetValue(null, true);
            _fixture = new GameTestFixture("Seating");
            _fixture.AddSingleton<CharacterManager>();
            _fixture.RegisterSingleton<LevelManager>();
            _character = CreateCharacter();
            _other = CreateCharacter();
            var seat = new GameObject("Seat");
            seat.transform.SetParent(_fixture.Root.transform);
            _slot = seat.AddComponent<InteractionSlot>();
            var exit = new GameObject("Exit").transform;
            exit.SetParent(seat.transform);
            exit.position = new Vector3(2, -1, 0);
            Set(_slot, "exitPoint", exit);
            var animation = AssetDatabase.LoadAssetAtPath<Character.Animations.CharacterAnimationDefinition>("Assets/Interaction/PrototypeSittingAnimation.asset");
            Set(_slot, "occupiedAnimation", animation);
            _entry = seat.AddComponent<SeatingFeedbackProbe>();
            _exit = seat.AddComponent<SeatingFeedbackProbe>();
            Set(_slot, "entryFeedback", _entry);
            Set(_slot, "exitFeedback", _exit);
            _fixture.Root.SetActive(true);
            GameTestFixture.Invoke(_slot, "Awake");
            _graphicsPosition = _character.Graphics.localPosition;
            _graphicsScale = _character.Graphics.localScale;
        }

        private MainCharacter CreateCharacter()
        {
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Character/Player/TestCharacter.prefab");
            var root = Object.Instantiate(prefab, _fixture.Root.transform);
            var character = root.GetComponent<MainCharacter>();
            GameTestFixture.Invoke(root.GetComponent<Controller2D>(), "Awake");
            GameTestFixture.Invoke(character, "Awake");
            GameTestFixture.Invoke(character.Animator, "Awake");
            GameTestFixture.Invoke(character.Occupation, "Awake");
            GameTestFixture.Invoke(character.Occupation, "OnEnable");
            return character;
        }

        [TearDown]
        public void TearDown()
        {
            try
            {
                _slot.Occupant?.ReleaseImmediately();
                GameTestFixture.Invoke(_character.Occupation, "OnDisable");
                GameTestFixture.Invoke(_other.Occupation, "OnDisable");
                _fixture.Dispose();
            }
            finally { DOTweenInitialized.SetValue(null, _dotweenWasInitialized); }
        }

        [Test]
        public void DestroyedOptionalFeedbackDoesNotReceiveEntryOrExitCalls()
        {
            Object.DestroyImmediate(_entry);
            Object.DestroyImmediate(_exit);
            _character.Occupation.TryEnter(_slot);
            Hop(_character).Complete(true);
            _character.Occupation.TryExit();
            Hop(_character).Complete(true);
            Assert.That(_entry.Plays, Is.Zero);
            Assert.That(_exit.Plays, Is.Zero);
            Assert.That(_character.Occupation.Phase, Is.EqualTo(CharacterOccupation.OccupationPhase.Empty));
        }

        [Test]
        public void NormalSeatInteractionUpdatesAvailabilityAndRejectsAnAlreadySeatedCharacter()
        {
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Interaction/BenchPrototype.prefab");
            var bench = Object.Instantiate(prefab, _fixture.Root.transform);
            var seat = bench.GetComponent<SeatInteractable>();
            var slot = bench.GetComponentInChildren<InteractionSlot>();
            GameTestFixture.Invoke(slot, "Awake");
            GameTestFixture.Invoke(seat, "Awake");
            GameTestFixture.Invoke(seat, "OnEnable");
            Set(seat, "ActivationFeedback", _entry);

            Assert.That(seat.CanInteract, Is.True);
            seat.TriggerInteraction(_character);
            Assert.That(slot.Occupant, Is.SameAs(_character.Occupation));
            Assert.That(seat.CanInteract, Is.False);
            Assert.That(_entry.Plays, Is.EqualTo(1));
            _character.Occupation.ReleaseImmediately();
            Assert.That(seat.CanInteract, Is.True);

            _character.Occupation.TryEnter(_slot);
            var activations = _entry.Plays;
            seat.TriggerInteraction(_character);
            Assert.That(slot.Occupant, Is.Null);
            Assert.That(_entry.Plays, Is.EqualTo(activations));
        }

        [Test]
        public void FailedSeatEntryDoesNotConsumeAUseStartCooldownOrPlaySuccessFeedback()
        {
            _fixture.AddSingleton<GameStateManager>();
            GameState.Time.initialized = true;
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Interaction/BenchPrototype.prefab");
            var bench = Object.Instantiate(prefab, _fixture.Root.transform);
            var seat = bench.GetComponent<SeatInteractable>();
            var slot = bench.GetComponentInChildren<InteractionSlot>();
            var id = Guid.NewGuid().ToString("N");
            typeof(AbstractInteractable).GetField("persistentId", BindingFlags.Instance | BindingFlags.NonPublic)
                .SetValue(seat, id);
            Set(seat, "UnlimitedActivations", false);
            Set(seat, "MaxNumberOfActivations", 2);
            Set(seat, "cooldownMode", InteractionCooldownMode.InGameHours);
            Set(seat, "inGameHourCooldown", 1);
            Set(seat, "ActivationFeedback", _entry);
            Set(seat, "DeniedFeedback", _exit);
            GameTestFixture.Invoke(slot, "Awake");
            GameTestFixture.Invoke(seat, "Awake");
            GameTestFixture.Invoke(seat, "OnEnable");

            // The target is ready, but this character already occupies a different slot.
            _character.Occupation.TryEnter(_slot);
            var entryCues = _entry.Plays;
            seat.TriggerInteraction(_character);
            Assert.That(seat.CanInteract, Is.True);
            Assert.That(seat.RemainingUses, Is.EqualTo(2));
            Assert.That(GameState.World.TryGet(id, out InteractableState state), Is.False);
            Assert.That(slot.Occupant, Is.Null);
            Assert.That(_entry.Plays, Is.EqualTo(entryCues));
            Assert.That(_exit.Plays, Is.EqualTo(1));

            _character.SetConditionState(ConditionState.Dead);
            seat.TriggerInteraction(_character);
            Assert.That(seat.CanInteract, Is.True);
            Assert.That(seat.RemainingUses, Is.EqualTo(2));
            Assert.That(GameState.World.TryGet(id, out state), Is.False);
            Assert.That(_entry.Plays, Is.EqualTo(entryCues));
            Assert.That(_exit.Plays, Is.EqualTo(2));

            seat.TriggerInteraction(_other);
            Assert.That(slot.Occupant, Is.SameAs(_other.Occupation));
            Assert.That(seat.RemainingUses, Is.EqualTo(1));
            Assert.That(GameState.World.TryGet(id, out state), Is.True);
            Assert.That(state.uses, Is.EqualTo(1));
            Assert.That(state.availableAtMinute, Is.EqualTo(GameState.Time.TotalMinutes + 60));
            Assert.That(_entry.Plays, Is.EqualTo(entryCues + 1));
            _other.Occupation.ReleaseImmediately();
            Assert.That(seat.CanInteract, Is.False, "A successful entry starts the configured cooldown.");
        }

        [Test]
        public void SeatedPlayerCanExitWithInteractButAnOpenMenuBlocksTheRequest()
        {
            // The project uses predefined assemblies; load Unity's non-auto-referenced test fixture by its exact type.
            // Its isolated input runtime enables player updates in Edit Mode and restores the real devices afterward.
            var runtimeType = Type.GetType("UnityEngine.InputSystem.InputTestFixture, Unity.InputSystem.TestFramework", true);
            var runtime = Activator.CreateInstance(runtimeType);
            runtimeType.GetMethod("Setup").Invoke(runtime, null);
            try
            {
                var input = _fixture.AddSingleton<Input.InputManager>(manager =>
                {
                    manager.GetComponent<PlayerInput>().actions = _fixture.Own(Object.Instantiate(
                        AssetDatabase.LoadAssetAtPath<InputActionAsset>("Assets/InputSystem_Actions.inputactions")));
                    manager.gameObject.SetActive(true);
                });
                var context = _fixture.AddSingleton<PlayerInteractionContext>();
                GameTestFixture.Invoke(_character.GetAbility<CharacterOccupationAbility>(), "Awake");
                var keyboard = InputSystem.AddDevice<Keyboard>();
                try
                {
                    input.Actions.devices = new InputDevice[] { keyboard };
                    input.Actions.bindingMask = InputBinding.MaskByGroup(
                        input.Actions.FindControlScheme("Keyboard&Mouse").Value.bindingGroup);
                    _character.Occupation.TryEnter(_slot);
                    Hop(_character).Complete(true);
                    var snapshot = PlayerInteractionContextSnapshot.Empty() with { SceneReady = true, Character = _character };
                    Set(context, "<CurrentSnapshot>k__BackingField", snapshot with { WorldInteractionBlocked = true });
                    InputSystem.QueueStateEvent(keyboard, new KeyboardState(Key.Space));
                    InputSystem.Update();
                    Assert.That(input.InteractPressed, Is.True, "The fixture must deliver an actual Interact press.");
                    _character.GetAbility<CharacterOccupationAbility>().Tick();
                    Assert.That(_character.Occupation.Phase, Is.EqualTo(CharacterOccupation.OccupationPhase.Occupied));

                    InputSystem.QueueStateEvent(keyboard, new KeyboardState());
                    InputSystem.Update();
                    Set(context, "<CurrentSnapshot>k__BackingField", snapshot);
                    InputSystem.QueueStateEvent(keyboard, new KeyboardState(Key.Space));
                    InputSystem.Update();
                    _character.GetAbility<CharacterOccupationAbility>().Tick();
                    Assert.That(_character.Occupation.Phase, Is.EqualTo(CharacterOccupation.OccupationPhase.Exiting));
                }
                finally { InputSystem.RemoveDevice(keyboard); }
            }
            finally { runtimeType.GetMethod("TearDown").Invoke(runtime, null); }
        }

        [Test]
        public void AvailabilityNotificationsSeeBothSidesOfTheCompletedClaimOrRelease()
        {
            var notifications = 0;
            Action observe = () =>
            {
                notifications++;
                if (_slot.IsAvailable)
                {
                    Assert.That(_character.Occupation.IsOccupied, Is.False);
                    Assert.That(_character.GetComponent<Rigidbody2D>().simulated, Is.True);
                }
                else
                {
                    Assert.That(_slot.Occupant, Is.SameAs(_character.Occupation));
                    Assert.That(_character.Occupation.CurrentSlot, Is.SameAs(_slot));
                    Assert.That(_character.GetComponent<Rigidbody2D>().simulated, Is.False);
                }
            };

            _slot.StateChanged += observe;
            try
            {
                _character.Occupation.TryEnter(_slot);
                Hop(_character).Complete(true);
                _character.Occupation.TryExit();
                Hop(_character).Complete(true);
                Assert.That(notifications, Is.EqualTo(2));
            }
            finally { _slot.StateChanged -= observe; }
        }

        [Test]
        public void EntryClaimsImmediatelyAndRejectsASecondCharacterOrAnotherSlot()
        {
            Assert.That(_character.Occupation.TryEnter(_slot), Is.True);
            Assert.That(_slot.Occupant, Is.SameAs(_character.Occupation));
            Assert.That(_character.Occupation.CurrentSlot, Is.SameAs(_slot));
            Assert.That(_character.IsControlBlocked, Is.True);
            Assert.That(_character.Occupation.Phase, Is.EqualTo(CharacterOccupation.OccupationPhase.Entering));
            Assert.That(_other.Occupation.TryEnter(_slot), Is.False);
            Assert.That(_character.Occupation.TryEnter(_slot), Is.False);
            Assert.That(_character.Occupation.TryExit(), Is.False);
            Assert.That(_entry.Plays, Is.EqualTo(1));
            Assert.That(_exit.Plays, Is.Zero);
            var another = Object.Instantiate(_slot, _fixture.Root.transform);
            Assert.That(_character.Occupation.TryEnter(another), Is.False);
            Object.DestroyImmediate(another);
        }

        [Test]
        public void ExitKeepsTheClaimUntilTheHopCompletesAndRestoresPhysics()
        {
            var body = _character.GetComponent<Rigidbody2D>();
            Assert.That(body.simulated, Is.True);
            _character.Occupation.TryEnter(_slot);
            Assert.That(body.simulated, Is.False);
            Hop(_character).Complete(true);
            Assert.That(_character.Occupation.Phase, Is.EqualTo(CharacterOccupation.OccupationPhase.Occupied));
            Assert.That(_character.transform.position, Is.EqualTo(_slot.transform.position));
            _character.SetConditionState(ConditionState.Normal); // Finishing a normal primary action cannot release occupation.
            Assert.That(_character.IsControlBlocked, Is.True);

            Assert.That(_character.Occupation.TryExit(), Is.True);
            Assert.That(_character.Occupation.TryExit(), Is.False);
            Assert.That(_other.Occupation.TryEnter(_slot), Is.False);
            Assert.That(_exit.Plays, Is.EqualTo(1));
            Assert.That(_slot.Occupant, Is.SameAs(_character.Occupation));
            Hop(_character).Complete(true);

            Assert.That(_character.Occupation.Phase, Is.EqualTo(CharacterOccupation.OccupationPhase.Empty));
            Assert.That(_character.Occupation.CurrentSlot, Is.Null);
            Assert.That(_character.IsControlBlocked, Is.False);
            Assert.That(body.simulated, Is.True);
            Assert.That(_character.transform.position, Is.EqualTo(new Vector3(2, -1, 0)));
            Assert.That(body.position, Is.EqualTo(new Vector2(2, -1)));
            Assert.That(_character.Graphics.localPosition, Is.EqualTo(_graphicsPosition));
            Assert.That(_character.Graphics.localScale, Is.EqualTo(_graphicsScale));
            Assert.That(_other.Occupation.TryEnter(_slot), Is.True);
        }

        [Test]
        public void ReleasingDuringEntryReturnsToTheStartAndDoesNotPlayAnExitCue()
        {
            var start = new Vector3(-2, -1, 0);
            _character.transform.position = start;
            _character.Occupation.TryEnter(_slot);
            Hop(_character).Goto(0.1f);
            Assert.That(_character.transform.position, Is.Not.EqualTo(start));
            _character.Occupation.ReleaseImmediately();
            _character.Occupation.ReleaseImmediately(); // Multiple interruption paths may release the same claim.
            Assert.That(Hop(_character).IsActive(), Is.False);
            Assert.That(_character.transform.position, Is.EqualTo(start));
            Assert.That(_character.GetComponent<Rigidbody2D>().position, Is.EqualTo((Vector2)start));
            Assert.That(_character.Graphics.localPosition, Is.EqualTo(_graphicsPosition));
            Assert.That(_character.Occupation.CurrentSlot, Is.Null);
            Assert.That(_character.GetComponent<Rigidbody2D>().simulated, Is.True);
            Assert.That(_exit.Plays, Is.Zero);
        }

        [Test]
        public void ReleasingDuringExitPlacesAtTheExitWithoutReplayingItsCue()
        {
            _character.Occupation.TryEnter(_slot);
            Hop(_character).Complete(true);
            _character.Occupation.TryExit();
            Hop(_character).Goto(0.1f);
            Assert.That(_character.transform.position, Is.Not.EqualTo(_slot.ExitPoint.position));
            _character.Occupation.ReleaseImmediately();
            Assert.That(Hop(_character).IsActive(), Is.False);
            Assert.That(_character.transform.position, Is.EqualTo(_slot.ExitPoint.position));
            Assert.That(_character.GetComponent<Rigidbody2D>().position, Is.EqualTo((Vector2)_slot.ExitPoint.position));
            Assert.That(_character.GetComponent<Rigidbody2D>().simulated, Is.True);
            Assert.That(_character.Graphics.localPosition, Is.EqualTo(_graphicsPosition));
            Assert.That(_slot.Occupant, Is.Null);
            Assert.That(_exit.Plays, Is.EqualTo(1));
        }

        [Test]
        public void DeathDuringEitherHopUsesItsStandingEndpointWithoutRevivingTheCharacter()
        {
            var start = new Vector3(-2, -1, 0);
            _character.transform.position = start;
            _character.Occupation.TryEnter(_slot);
            Hop(_character).Goto(0.1f);
            _character.SetConditionState(ConditionState.Dead);
            Assert.That(_character.transform.position, Is.EqualTo(start));
            Assert.That(Hop(_character).IsActive(), Is.False);
            Assert.That(_character.ConditionState, Is.EqualTo(ConditionState.Dead));
            Assert.That(_slot.Occupant, Is.Null);

            _other.Occupation.TryEnter(_slot);
            Hop(_other).Complete(true);
            _other.Occupation.TryExit();
            Hop(_other).Goto(0.1f);
            _other.SetConditionState(ConditionState.Dead);
            Assert.That(_other.transform.position, Is.EqualTo(_slot.ExitPoint.position));
            Assert.That(Hop(_other).IsActive(), Is.False);
            Assert.That(_other.ConditionState, Is.EqualTo(ConditionState.Dead));
            Assert.That(_slot.Occupant, Is.Null);
        }

        [Test]
        public void DeathReleasesTheSlotWithoutRevivingOrMovingTheCharacter()
        {
            _character.Occupation.TryEnter(_slot);
            Hop(_character).Complete(true);
            var position = _character.transform.position;
            _character.SetConditionState(ConditionState.Dead);
            Assert.That(_slot.Occupant, Is.Null);
            Assert.That(_character.Occupation.CurrentSlot, Is.Null);
            Assert.That(_character.ConditionState, Is.EqualTo(ConditionState.Dead));
            Assert.That(_character.transform.position, Is.EqualTo(position));
            Assert.That(_character.Occupation.TryEnter(_slot), Is.False);
        }

        [Test]
        public void DisablingEitherParticipantReleasesOccupation()
        {
            _character.Occupation.TryEnter(_slot);
            GameTestFixture.Invoke(_slot, "OnDisable");
            Assert.That(_character.Occupation.CurrentSlot, Is.Null);
            Assert.That(_other.Occupation.TryEnter(_slot), Is.True);
            GameTestFixture.Invoke(_other.Occupation, "OnDisable");
            Assert.That(_slot.Occupant, Is.Null);
            Assert.That(_other.Occupation.CurrentSlot, Is.Null);
        }

        [Test]
        public void LocationLeaveReleasesOccupationWithoutCharacterForwarding()
        {
            _character.transform.position = new Vector3(-2, -1, 0);
            _character.Occupation.TryEnter(_slot);
            Hop(_character).Goto(0.1f);
            var position = _character.transform.position;
            _character.Occupation.OnLocationLeave(null);
            Assert.That(_slot.Occupant, Is.Null);
            Assert.That(_character.Occupation.CurrentSlot, Is.Null);
            Assert.That(Hop(_character).IsActive(), Is.False);
            Assert.That(_character.transform.position, Is.EqualTo(position));
            Assert.That(_character.Graphics.localPosition, Is.EqualTo(_graphicsPosition));
            Assert.That(_character.GetComponent<Rigidbody2D>().simulated, Is.True);

            _other.Occupation.TryEnter(_slot);
            Hop(_other).Complete(true);
            _other.Occupation.TryExit();
            Hop(_other).Goto(0.1f);
            var exitingPosition = _other.transform.position;
            _other.Occupation.OnLocationLeave(null);
            Assert.That(_other.transform.position, Is.EqualTo(exitingPosition));
            Assert.That(Hop(_other).IsActive(), Is.False);
            Assert.That(_slot.Occupant, Is.Null);
        }

        [Test]
        public void WeightedAnimationsRespectRelativeWeightsAndBothRandomEndpoints()
        {
            var first = CreateAnimation("first");
            var second = CreateAnimation("second");
            var set = CreateAnimationSet(first, second);
            Set(set, "variations", new[] { Variation(first, 1f), Variation(second, 3f) });
            set.RequireValidConfiguration();
            Assert.That(set.SelectVariation(0f), Is.SameAs(first));
            Assert.That(set.SelectVariation(0.249f), Is.SameAs(first));
            Assert.That(set.SelectVariation(0.25f), Is.SameAs(second));
            Assert.That(set.SelectVariation(1f), Is.SameAs(second));
        }

        [Test]
        public void AnimationValidationRejectsMissingReferencesInvalidTimingWeightsAndLoopingVariations()
        {
            var animation = CreateAnimation("variation");
            var set = CreateAnimationSet(animation, animation);
            Assert.That(set.ValidateConfiguration(), Is.Empty);
            Set(animation, "clip", null);
            Assert.That(set.ValidateConfiguration(), Is.Not.Empty);
            Set(animation, "clip", CreateClip());
            Set(set, "variationDelay", new Vector2(0, 1));
            Assert.That(set.ValidateConfiguration(), Is.Not.Empty);
            Set(set, "variationDelay", new Vector2(2, 1));
            Assert.That(set.ValidateConfiguration(), Is.Not.Empty);
            Set(set, "variationDelay", new Vector2(1, float.NaN));
            Assert.That(set.ValidateConfiguration(), Is.Not.Empty);
            Set(set, "variationDelay", new Vector2(1, 2));
            Set(set.Variations[0], "weight", 0f);
            Assert.That(set.ValidateConfiguration(), Is.Not.Empty);
            Set(set.Variations[0], "weight", float.PositiveInfinity);
            Assert.That(set.ValidateConfiguration(), Is.Not.Empty);
            Set(set.Variations[0], "weight", 1f);
            var settings = AnimationUtility.GetAnimationClipSettings(animation.Clip);
            settings.loopTime = true;
            AnimationUtility.SetAnimationClipSettings(animation.Clip, settings);
            Assert.That(set.ValidateConfiguration(), Is.Not.Empty);
            Set(set, "variations", Array.Empty<CharacterAnimationSet.Variation>());
            Assert.That(set.ValidateConfiguration(), Is.Empty, "A base loop without variations is valid.");
            Set(set, "baseAnimation", null);
            Assert.That(set.ValidateConfiguration(), Is.Not.Empty);
        }

        [Test]
        public void SharedAnimationSetsHaveIndependentPlaybackAndReturnToBaseAfterAVariation()
        {
            var baseAnimation = _slot.OccupiedAnimation.BaseAnimation;
            var variation = CreateAnimation("variation");
            var set = CreateAnimationSet(baseAnimation, variation);
            set.RequireValidConfiguration();
            _character.Animator.PlayInteractionAnimation(set);
            _other.Animator.PlayInteractionAnimation(set);
            Set(_character.Animator, "_variationDelay", 0f);
            GameTestFixture.Invoke(_character.Animator, "Update");
            var first = InteractionAnimationState(_character);
            Assert.That(first.Clip, Is.SameAs(variation.Clip));
            Assert.That(InteractionAnimationState(_other).Clip, Is.SameAs(baseAnimation.Clip));
            first.Time = first.Length;
            GameTestFixture.Invoke(_character.Animator, "Update");
            Assert.That(InteractionAnimationState(_character).Clip, Is.SameAs(baseAnimation.Clip));
            Assert.That(Read<float>(_character.Animator, "_variationDelay"), Is.InRange(5f, 10f));
        }

        [Test]
        public void ExitingOrReplacingAnAnimationSetStopsItsVariationSchedule()
        {
            var set = CreateAnimationSet(_slot.OccupiedAnimation.BaseAnimation, CreateAnimation("variation"));
            Set(_slot, "occupiedAnimation", set);
            _character.Occupation.TryEnter(_slot);
            Hop(_character).Complete(true);
            Set(_character.Animator, "_variationDelay", 0f);
            GameTestFixture.Invoke(_character.Animator, "Update");
            var oldVariation = InteractionAnimationState(_character);
            Assert.That(_character.Occupation.TryExit(), Is.True);
            oldVariation.Time = oldVariation.Length;
            GameTestFixture.Invoke(_character.Animator, "Update");
            Assert.That(InteractionAnimationState(_character), Is.Null);
            Assert.That(Read<CharacterAnimationSet>(_character.Animator, "_interactionSet"), Is.Null);
            Hop(_character).Complete(true);

            _character.Animator.PlayInteractionAnimation(set);
            _character.Animator.PlayInteractionAnimation(set.BaseAnimation);
            GameTestFixture.Invoke(_character.Animator, "Update");
            Assert.That(InteractionAnimationState(_character).Clip, Is.SameAs(set.BaseAnimation.Clip));
            Assert.That(Read<CharacterAnimationSet>(_character.Animator, "_interactionSet"), Is.Null);
            GameTestFixture.Invoke(_character.Animator, "OnDisable");
            Assert.That(InteractionAnimationState(_character), Is.Null);
        }

        private AnimationClip CreateClip()
        {
            var clip = _fixture.Own(new AnimationClip());
            AnimationUtility.SetEditorCurve(clip, EditorCurveBinding.FloatCurve("", typeof(Transform), "m_LocalScale.z"),
                AnimationCurve.Constant(0, 1, 1));
            return clip;
        }

        private CharacterAnimation CreateAnimation(string id)
        {
            var animation = _fixture.Own(ScriptableObject.CreateInstance<CharacterAnimation>());
            SetAnimationId(animation, "test:" + id);
            Set(animation, "clip", CreateClip());
            return animation;
        }

        private CharacterAnimationSet CreateAnimationSet(CharacterAnimation baseAnimation, CharacterAnimation variation)
        {
            var set = _fixture.Own(ScriptableObject.CreateInstance<CharacterAnimationSet>());
            SetAnimationId(set, "test:set");
            Set(set, "baseAnimation", baseAnimation);
            Set(set, "variations", new[] { Variation(variation, 1f) });
            return set;
        }

        private static CharacterAnimationSet.Variation Variation(CharacterAnimation animation, float weight)
        {
            var variation = new CharacterAnimationSet.Variation();
            Set(variation, "animation", animation);
            Set(variation, "weight", weight);
            return variation;
        }

        private static void SetAnimationId(CharacterAnimationDefinition animation, string id) =>
            typeof(CharacterAnimationDefinition).GetField("animationId", BindingFlags.Instance | BindingFlags.NonPublic).SetValue(animation, id);

        private static T Read<T>(object owner, string field) =>
            (T)owner.GetType().GetField(field, BindingFlags.Instance | BindingFlags.NonPublic).GetValue(owner);

        private static AnimancerState InteractionAnimationState(GameCharacter character) =>
            Read<AnimancerState>(character.Animator, "_interactionState");

        private static Tween Hop(GameCharacter character) =>
            (Tween)typeof(CharacterOccupation).GetField("_hop", BindingFlags.Instance | BindingFlags.NonPublic)
                .GetValue(character.Occupation);

        private static void Set(object owner, string field, object value) =>
            owner.GetType().GetField(field, BindingFlags.Instance | BindingFlags.NonPublic).SetValue(owner, value);
    }
}
