using System;
using Character;
using Character.Abilities;
using Core.Common.Editor;
using Core.Context;
using Input;
using Interaction.Tools;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.LowLevel;
using InteractionMode = Core.Context.InteractionMode;
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

        [Test]
        public void RightClickUsesTheHoveredTargetAndKeysTheOneInFront()
        {
            var player = Game.CreatePlayer();
            var stall = Chest();
            var chest = Chest();
            var moment = MousePlay(player) with { InteractableUnderPointer = stall, CurrentInteractable = chest };

            var rightClick = CharacterPerformPrimaryActionAbility.ChooseAttempt(moment, true, true, false)(moment);
            Assert.That(rightClick.ActionableInteractable, Is.SameAs(stall));
            Assert.That(rightClick.Mode, Is.EqualTo(InteractionMode.Interact));

            var key = CharacterPerformPrimaryActionAbility.ChooseAttempt(moment, true, false, false)(moment);
            Assert.That(key.ActionableInteractable, Is.SameAs(chest), "E and Space use the one in front, even while hovering another.");

            var nothingHovered = moment with { InteractableUnderPointer = null };
            Assert.That(CharacterPerformPrimaryActionAbility.ChooseAttempt(nothingHovered, true, true, false), Is.Null);
            var nothingInFront = moment with { CurrentInteractable = null };
            Assert.That(CharacterPerformPrimaryActionAbility.ChooseAttempt(nothingInFront, true, false, false), Is.Null);
        }

        [Test]
        public void ToolsNeverActOnWhatTheyAimAt()
        {
            var player = Game.CreatePlayer();
            var hoe = Game.Asset<ToolData>();
            var moment = MousePlay(player) with { CurrentTool = hoe, CurrentlyHeldItem = hoe };
            var chest = Chest();

            Set(hoe, "Targeting", ToolTargeting.Pointer);
            var tool = CharacterPerformPrimaryActionAbility.ChooseAttempt(moment with { CurrentInteractable = chest }, false, false, true);
            Assert.That(tool, Is.Not.Null, "Clicking a tile elsewhere works next to a chest.");
            Assert.That(tool(moment with { CurrentInteractable = chest }).Mode, Is.EqualTo(InteractionMode.Tool));
            Assert.That(CharacterPerformPrimaryActionAbility.ChooseAttempt(moment with { InteractableUnderPointer = chest }, false, false, true),
                Is.Null, "Clicking the chest itself does nothing.");

            Set(hoe, "Targeting", ToolTargeting.Facing);
            Assert.That(CharacterPerformPrimaryActionAbility.ChooseAttempt(moment with { CurrentInteractable = chest }, false, false, true),
                Is.Null, "A swing in front would land on the chest.");
            Assert.That(CharacterPerformPrimaryActionAbility.ChooseAttempt(moment with { InteractableUnderPointer = chest }, false, false, true),
                Is.Not.Null, "Hovering elsewhere does not stop a swing in front.");
        }

        private static PlayerInteractionContextSnapshot MousePlay(MainCharacter player) =>
            PlayerInteractionContextSnapshot.Empty() with { SceneReady = true, Character = player, UsesPointer = true };

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
