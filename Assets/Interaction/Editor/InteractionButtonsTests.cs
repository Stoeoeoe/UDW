using System;
using Character;
using Core.Common.Editor;
using Core.Context;
using Input;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.LowLevel;
using Object = UnityEngine.Object;
using static Core.Common.Editor.Reflect;

namespace Interaction.Editor
{
    /// <summary>A ready target that counts how often the player used it.</summary>
    public sealed class CountingInteractable : AbstractInteractable
    {
        public int Uses;

        protected override bool Interact(GameCharacter instigator)
        {
            Uses++;
            return true;
        }
    }

    /// <summary>Interact uses the target; the action button never does, so a tool cannot hit what the player aims at.</summary>
    public sealed class InteractionButtonsTests : GameTest
    {
        [Test]
        public void InteractUsesTheTargetAndTheActionButtonLeavesItAlone()
        {
            // The project uses predefined assemblies; load Unity's non-auto-referenced test fixture by its exact type.
            var runtimeType = Type.GetType("UnityEngine.InputSystem.InputTestFixture, Unity.InputSystem.TestFramework", true);
            var runtime = Activator.CreateInstance(runtimeType);
            runtimeType.GetMethod("Setup").Invoke(runtime, null);
            try
            {
                var input = Game.Start<InputManager>(manager =>
                {
                    manager.GetComponent<PlayerInput>().actions = Game.Own(Game.InjectObject(Object.Instantiate(
                        AssetDatabase.LoadAssetAtPath<InputActionAsset>("Assets/InputSystem_Actions.inputactions"))));
                    manager.gameObject.SetActive(true);
                });
                var player = Game.CreatePlayer();
                player.EnsureRuntimeInitialized();
                var chest = Chest();
                var context = Game.Get<PlayerInteractionContext>();
                var targeted = PlayerInteractionContextSnapshot.Create(true, player, chest, null, null, null, null, null,
                    null, null, null, default);
                Assume.That(targeted.ActionableInteractable, Is.SameAs(chest));
                Set(context, "<CurrentSnapshot>k__BackingField", targeted);

                var keyboard = InputSystem.AddDevice<Keyboard>();
                try
                {
                    input.Actions.devices = new InputDevice[] { keyboard };
                    input.Actions.bindingMask = InputBinding.MaskByGroup(
                        input.Actions.FindControlScheme("Keyboard&Mouse").Value.bindingGroup);

                    Press(keyboard, Key.Q, player);
                    Assert.That(input.PerformPrimaryActionDown, Is.True, "The fixture must deliver an action button press.");
                    Assert.That(chest.Uses, Is.Zero, "The action button never uses the target.");

                    Press(keyboard, Key.E, player);
                    Assert.That(chest.Uses, Is.EqualTo(1));

                    // Releasing Interact does not use the target again.
                    InputSystem.QueueStateEvent(keyboard, new KeyboardState());
                    InputSystem.Update();
                    player.PerformPrimaryAction.Tick();
                    Assert.That(chest.Uses, Is.EqualTo(1));

                    // Without a target, Interact does nothing.
                    Assert.That(player.PerformPrimaryAction.ActionExecutor.IsIdle, Is.True, "The interaction has finished.");
                    Set(context, "<CurrentSnapshot>k__BackingField", targeted with { CurrentInteractable = null });
                    Press(keyboard, Key.Space, player);
                    Assert.That(chest.Uses, Is.EqualTo(1));
                }
                finally { InputSystem.RemoveDevice(keyboard); }
            }
            finally { runtimeType.GetMethod("TearDown").Invoke(runtime, null); }
        }

        private static void Press(Keyboard keyboard, Key key, MainCharacter player)
        {
            InputSystem.QueueStateEvent(keyboard, new KeyboardState());
            InputSystem.Update();
            player.PerformPrimaryAction.Tick();
            InputSystem.QueueStateEvent(keyboard, new KeyboardState(key));
            InputSystem.Update();
            player.PerformPrimaryAction.Tick();
        }

        private CountingInteractable Chest()
        {
            var root = new GameObject("Chest", typeof(BoxCollider2D)) { layer = LayerMask.NameToLayer("Interactable") };
            root.SetActive(false);
            root.transform.SetParent(Game.Root.transform);
            var chest = Game.Add<CountingInteractable>(root);
            Game.Wake(chest);
            return chest;
        }
    }
}
