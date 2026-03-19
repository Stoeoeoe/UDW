using MoreMountains.TopDownEngine;

namespace Character
{
    public class UrTopDownController2D : TopDownController2D
    {
        protected override void CheckIfGrounded()
        {
            // base.CheckIfGrounded();
            // _groundedTest = Physics2D.OverlapPoint((Vector2)this.transform.position, GroundLayerMask);
            // _holeTestMin = Physics2D.OverlapPoint((Vector2)ColliderBounds.min, HoleLayerMask);
            // _holeTestMax = Physics2D.OverlapPoint((Vector2)ColliderBounds.max, HoleLayerMask);
            // Grounded = (_groundedTest != null);
            // OverHole = ((_holeTestMin != null) && (_holeTestMax != null));                        
            // JustGotGrounded = (!_groundedLastFrame && Grounded);
            // _groundedLastFrame = Grounded;
            
            // TODO: Fix
            Grounded = true;
        }
    }
}