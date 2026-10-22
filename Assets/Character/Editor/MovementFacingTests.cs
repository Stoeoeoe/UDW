using System;
using System.Linq;
using System.Reflection;
using Character.Abilities;
using Core.Common.Editor;
using NUnit.Framework;
using UI.Shared.Editor;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.LowLevel;

namespace Character.Editor
{
    /// <summary>Exercises real movement input when physics has stopped the body or still carries old velocity.</summary>
    public sealed class MovementFacingTests
    {
        private GameTestFixture _fixture;
        private MainCharacter _character;
        private MovementAbility _movement;
        private Keyboard _keyboard;
        private readonly Type _inputRuntimeType = Type.GetType("UnityEngine.InputSystem.InputTestFixture, Unity.InputSystem.TestFramework", true);
        private object _inputRuntime;

        [SetUp]
        public void SetUp()
        {
            // Unity's input test runtime processes player actions in Edit Mode and restores the real devices afterward.
            _inputRuntime = Activator.CreateInstance(_inputRuntimeType);
            _inputRuntimeType.GetMethod("Setup").Invoke(_inputRuntime, null);
            _fixture = new GameTestFixture("Movement facing");
            _fixture.Root.SetActive(true);
            var input = UIScreenPauseTests.CreateScreenServices(_fixture);
            _keyboard = InputSystem.AddDevice<Keyboard>();
            input.Actions.devices = new InputDevice[] { _keyboard };
            var scheme = input.Actions.FindControlScheme("Keyboard&Mouse").Value;
            input.Actions.bindingMask = InputBinding.MaskByGroup(scheme.bindingGroup);
            _character = _fixture.CreateCharacter();
            _movement = _character.GetComponentsInChildren<MovementAbility>(true).Single();
        }

        [TearDown]
        public void TearDown()
        {
            _fixture.Dispose();
            InputSystem.RemoveDevice(_keyboard);
            _inputRuntimeType.GetMethod("TearDown").Invoke(_inputRuntime, null);
        }

        [TestCase(Key.D, Key.W, 1, 0, 0, 1)]
        [TestCase(Key.W, Key.D, 0, 1, 1, 0)]
        [TestCase(Key.A, Key.S, -1, 0, 0, -1)]
        [TestCase(Key.S, Key.A, 0, -1, -1, 0)]
        public void SwitchingBetweenBlockedDirectionsChangesFacingWithoutDisplacement(Key first, Key second,
            int firstX, int firstY, int secondX, int secondY)
        {
            var body = _character.Controller.GetComponent<Rigidbody2D>();
            var position = body.position;
            body.linearVelocity = Vector2.zero; // Collision has stopped movement in both directions at a corner.
            Press(first);
            Assert.That(_character.Orientation.FacingDirection, Is.EqualTo(new Vector2(firstX, firstY)));
            Press(second);
            Assert.That(_character.Orientation.FacingDirection, Is.EqualTo(new Vector2(secondX, secondY)));
            Assert.That(body.linearVelocity, Is.EqualTo(Vector2.zero));
            Assert.That(body.position, Is.EqualTo(position));
        }

        [Test]
        public void InputOverridesOldVelocityAndReleasePreservesTheLastFacing()
        {
            _character.Controller.GetComponent<Rigidbody2D>().linearVelocity = Vector2.right;
            Press(Key.W);
            Assert.That(_character.Orientation.FacingDirection, Is.EqualTo(Vector2.up));
            InputSystem.QueueStateEvent(_keyboard, new KeyboardState());
            InputSystem.Update();
            _movement.Tick();
            Assert.That(_character.MovementState, Is.EqualTo(MovementState.Idle));
            Assert.That(_character.Orientation.FacingDirection, Is.EqualTo(Vector2.up));
        }

        [Test]
        public void BlockedCharacterDoesNotTurnUntilControlsAreReleased()
        {
            _character.Orientation.ForceDirection(Vector2.left);
            _character.SetControlBlocked(this, true);
            Press(Key.W);
            Assert.That(_character.Orientation.FacingDirection, Is.EqualTo(Vector2.left));
            _character.SetControlBlocked(this, false);
            _movement.Tick();
            Assert.That(_character.Orientation.FacingDirection, Is.EqualTo(Vector2.up));
        }

        [TestCase(false)]
        [TestCase(true)]
        public void OwnedMovementSurvivesOrdinaryInputAndControlBlocks(bool blocked)
        {
            var controller = _character.Controller;
            var owner = new object();
            controller.ClaimMovement(owner);
            _character.SetControlBlocked(this, blocked);
            _character.Orientation.ForceDirection(Vector2.left);
            _character.SetMovementState(MovementState.Walking);
            controller.SetOwnedMovementInput(owner, Vector2.left, _character.Attributes.WalkSpeed);

            Press(Key.W);

            // The character fixture stays inactive. Check intent here; active-body tests below check velocity.
            var intent = typeof(Controller2D).GetField("_movementInput", BindingFlags.Instance | BindingFlags.NonPublic);
            Assert.That(intent.GetValue(controller), Is.EqualTo(Vector2.left));
            Assert.That(_character.Orientation.FacingDirection, Is.EqualTo(Vector2.left));
            Assert.That(_character.MovementState, Is.EqualTo(MovementState.Walking));
            controller.ReleaseMovement(owner);
            _character.SetControlBlocked(this, false);
            _movement.Tick();
            Assert.That(_character.Orientation.FacingDirection, Is.EqualTo(Vector2.up));
        }

        [Test]
        public void ReleasingMovementClearsVelocityAndIntent()
        {
            var controller = CreateActiveController();
            var owner = new object();
            controller.SetMovementInput(Vector2.right, _character.Attributes.WalkSpeed);
            GameTestFixture.Invoke(controller, "FixedUpdate");
            Assert.That(controller.CurrentVelocity.x, Is.GreaterThan(0));

            controller.ClaimMovement(owner);
            Assert.That(controller.CurrentVelocity, Is.EqualTo(Vector2.zero));
            controller.SetOwnedMovementInput(owner, Vector2.left, _character.Attributes.WalkSpeed);
            GameTestFixture.Invoke(controller, "FixedUpdate");
            Assert.That(controller.CurrentVelocity.x, Is.LessThan(0));

            controller.ReleaseMovement(owner);
            Assert.That(controller.IsMovementOwned, Is.False);
            Assert.That(controller.CurrentVelocity, Is.EqualTo(Vector2.zero));
            GameTestFixture.Invoke(controller, "FixedUpdate");
            Assert.That(controller.CurrentVelocity, Is.EqualTo(Vector2.zero), "The released action must not leave movement intent behind.");
        }

        [Test]
        public void MovementOwnershipRejectsCompetingOrInvalidCallers()
        {
            var controller = CreateActiveController();
            var owner = new object();
            var other = new object();
            Assert.That(() => controller.ClaimMovement(null), Throws.ArgumentNullException);
            Assert.That(() => controller.SetOwnedMovementInput(null, Vector2.left, 1f), Throws.ArgumentNullException);
            Assert.That(() => controller.ReleaseMovement(null), Throws.ArgumentNullException);
            Assert.That(() => controller.SetOwnedMovementInput(owner, Vector2.left, 1f), Throws.InvalidOperationException);
            Assert.That(() => controller.ReleaseMovement(owner), Throws.InvalidOperationException);
            controller.ClaimMovement(owner);
            Assert.That(() => controller.ClaimMovement(other), Throws.InvalidOperationException);
            Assert.That(() => controller.SetOwnedMovementInput(other, Vector2.left, 1f), Throws.InvalidOperationException);
            Assert.That(() => controller.ReleaseMovement(other), Throws.InvalidOperationException);
            Assert.That(() => controller.SetMovementInput(Vector2.up, 1f), Throws.InvalidOperationException);
            Assert.That(controller.IsMovementOwned, Is.True);
            controller.ReleaseMovement(owner);
        }

        [Test]
        public void StopStillStopsOwnedMovementWithoutReleasingIt()
        {
            var controller = CreateActiveController();
            var owner = new object();
            controller.ClaimMovement(owner);
            controller.SetOwnedMovementInput(owner, Vector2.left, _character.Attributes.WalkSpeed);
            GameTestFixture.Invoke(controller, "FixedUpdate");
            Assert.That(controller.CurrentVelocity.x, Is.LessThan(0));

            controller.Stop();

            Assert.That(controller.IsMovementOwned, Is.True);
            Assert.That(controller.CurrentVelocity, Is.EqualTo(Vector2.zero));
            GameTestFixture.Invoke(controller, "FixedUpdate");
            Assert.That(controller.CurrentVelocity, Is.EqualTo(Vector2.zero));
            controller.ReleaseMovement(owner);
        }

        private Controller2D CreateActiveController()
        {
            var go = _fixture.Own(new GameObject("Movement ownership physics"));
            var controller = go.AddComponent<Controller2D>();
            GameTestFixture.Invoke(controller, "Awake");
            controller.GetComponent<Rigidbody2D>().gravityScale = 0;
            return controller;
        }

        private void Press(Key key)
        {
            InputSystem.QueueStateEvent(_keyboard, new KeyboardState(key));
            InputSystem.Update();
            Assert.That(Input.InputManager.Instance.Move.sqrMagnitude, Is.GreaterThan(0.1f), "The fixture must deliver movement through the authored input map.");
            _movement.Tick();
        }
    }
}
