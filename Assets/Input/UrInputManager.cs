using MoreMountains.Tools;
using MoreMountains.TopDownEngine;
using UnityEngine;

namespace Input
{
    // TODO: Consider directly inhering from InputManager and make a copy
    public class UrInputManager : InputSystemManager
    {
        protected InputSystem_Actions urInputActions;

        protected override void Awake()
        {
            base.Awake();
            urInputActions = new InputSystem_Actions();
        }

        protected override void Initialization()
        {
            urInputActions.PlayerControls.PrimaryMovement.performed += context =>
            {
                _primaryMovementInput = context.ReadValue<Vector2>();
                TestForceDesktop();
            };
            urInputActions.PlayerControls.PrimaryMovement.canceled += context =>
            {
                _primaryMovementInput = context.ReadValue<Vector2>();
                TestForceDesktop();
            };
            
            urInputActions.PlayerControls.SecondaryMovement.performed += context => _secondaryMovementInput = context.ReadValue<Vector2>();
            urInputActions.PlayerControls.SecondaryMovement.canceled += context => _secondaryMovementInput = context.ReadValue<Vector2>();
            urInputActions.PlayerControls.CameraRotation.performed += context => _cameraRotationInput = context.ReadValue<float>();
            urInputActions.PlayerControls.CameraRotation.canceled += context => _cameraRotationInput = context.ReadValue<float>();

            urInputActions.PlayerControls.Jump.performed += context => { BindButton(context, JumpButton); };
            urInputActions.PlayerControls.Run.performed += context => { BindButton(context, RunButton); };
            urInputActions.PlayerControls.Dash.performed += context => { BindButton(context, DashButton); };
            urInputActions.PlayerControls.Crouch.performed += context => { BindButton(context, CrouchButton); };
            urInputActions.PlayerControls.Shoot.performed += context => { BindButton(context, ShootButton); };
            urInputActions.PlayerControls.SecondaryShoot.performed += context => { BindButton(context, SecondaryShootButton); };
            urInputActions.PlayerControls.Interact.performed += context => { BindButton(context, InteractButton); };
            urInputActions.PlayerControls.Reload.performed += context => { BindButton(context, ReloadButton); };
            urInputActions.PlayerControls.Pause.performed += context => { BindButton(context, PauseButton); };
            urInputActions.PlayerControls.SwitchWeapon.performed += context => { BindButton(context, SwitchWeaponButton); };
            urInputActions.PlayerControls.SwitchCharacter.performed += context => { BindButton(context, SwitchCharacterButton); };
            urInputActions.PlayerControls.TimeControl.performed += context => { BindButton(context, TimeControlButton); };
       

            // urInputActions.PlayerControls.Interact.performed += context => { BindButton(context, InteractButton); };
            urInputActions.PlayerControls.PerformPrimaryAction.performed += context => { BindButton(context, PerformPrimaryActionButton); };
            urInputActions.PlayerControls.PerformSecondaryAction.performed += context => { BindButton(context, PerformSecondaryActionButton); };
            
        }


        // public InputAction @UseTool => m_Wrapper.m_PlayerControls_Interact;
        
        public virtual MMInput.IMButton PerformPrimaryActionButton { get; protected set; }
        public virtual void PerformPrimaryActionButtonDown() { PerformPrimaryActionButton.State.ChangeState(MMInput.ButtonStates.ButtonDown); }
        public virtual void PerformPrimaryActionPressed() { PerformPrimaryActionButton.State.ChangeState(MMInput.ButtonStates.ButtonPressed); }
        public virtual void PerformPrimaryActionButtonUp() { PerformPrimaryActionButton.State.ChangeState(MMInput.ButtonStates.ButtonUp); }        
        
        public virtual MMInput.IMButton PerformSecondaryActionButton { get; protected set; }
        public virtual void PerformSecondaryActionButtonDown() { PerformSecondaryActionButton.State.ChangeState(MMInput.ButtonStates.ButtonDown); }
        public virtual void PerformSecondaryActionPressed() { PerformSecondaryActionButton.State.ChangeState(MMInput.ButtonStates.ButtonPressed); }
        public virtual void PerformSecondaryActionButtonUp() { PerformSecondaryActionButton.State.ChangeState(MMInput.ButtonStates.ButtonUp); }
        
        /// <summary>
        /// On enable we enable our input actions
        /// </summary>
        protected override void OnEnable()
        {
            urInputActions.Enable();
        }

        /// <summary>
        /// On disable we disable our input actions
        /// </summary>
        protected override void OnDisable()
        {
            urInputActions.Disable();
        }

        protected override void InitializeButtons()
        {
            base.InitializeButtons();
            ButtonList.Add(PerformPrimaryActionButton = new MMInput.IMButton(PlayerID, "PerformPrimaryAction", PerformPrimaryActionButtonDown, PerformPrimaryActionPressed, PerformPrimaryActionButtonUp));
            ButtonList.Add(PerformSecondaryActionButton = new MMInput.IMButton(PlayerID, "PerformSecondaryAction", PerformSecondaryActionButtonDown, PerformSecondaryActionPressed, PerformSecondaryActionButtonUp));
            // ButtonList.Add(UseToolButton = new MMInput.IMButton(PlayerID, "Interact", InteractButtonDown, InteractButtonPressed, InteractButtonUp));

        }
    }
}