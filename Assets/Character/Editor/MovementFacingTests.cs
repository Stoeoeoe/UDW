using System;
using System.Linq;
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

        private void Press(Key key)
        {
            InputSystem.QueueStateEvent(_keyboard, new KeyboardState(key));
            InputSystem.Update();
            Assert.That(Input.InputManager.Instance.Move.sqrMagnitude, Is.GreaterThan(0.1f), "The fixture must deliver movement through the authored input map.");
            _movement.Tick();
        }
    }
}
