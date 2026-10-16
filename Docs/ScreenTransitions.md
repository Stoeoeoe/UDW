# Screen transitions

The shared `ScreenFader` on `Assets/Resources/SystemRoot.prefab` supports Opacity,
Mosaic and Iris. Choose the effect before entering Play Mode. Beds and location
changes use the same configuration, duration and easing.

`UrTimeManager.EndDay` owns the overnight sequence: publish
`DayTransitionStarted`, await the GUI cover, advance the day, await the GUI reveal,
then publish `DayTransitionFinished` even on cancellation. Crop and shop updates
continue to listen to `NewDayEvent` while the screen is covered. Input and the
character subscribe to the transition events and manage their own state.
`UrTimeManager` configures the overnight blackout duration and optional jingle.
`UrGUIManager.CoverScene` and `RevealScene` provide the shared presentation API
for both overnight and location transitions. Reveal can play a supplied cue and
hold the cover before fading in; location transitions use neither option.
`ScreenFader` remains the visual-effect implementation, referenced only by the
GUI manager. There is no separate day-transition component to configure.

The GUI reports interrupted presentation when disabled. The overnight sequence
subscribes while running and cancels its own coroutine; the GUI does not call
back into the time manager. Sequence cleanup calls `ResetTransition` to kill the
current fade and reveal the scene immediately.

Input suppression tracks active location-loading and day-transition contexts in
a set. Any active context blocks all action maps. Releasing one context leaves
input blocked until every context has ended; repeated activation of the same
context has no additional effect. Screen-map changes still select which map
resumes once the contexts have cleared.

Iris closes around the main character and opens around their destination position.
Leaving **Iris Mask** empty gives a circular opening. To use a silhouette, assign a
square texture with a centered, solid white shape on a black or transparent
background. White with full opacity reveals the scene; black or transparency
covers it. The silhouette shrinks around the character until the screen is black.

Code starting an iris must pass its subject's `Transform` to `FadeOut`/`FadeIn`.
The visible gameplay camera must be tagged `MainCamera`. The fader follows the
subject and camera during the wipe; it does not move or zoom the camera.

## Leaf mask

`Assets/Core/Location/LeafIrisMask.png` is the default authored silhouette, assigned
to the shared fader and selected in SampleScene. It was generated with the built-in
image-generation tool using this prompt:

> Use case: stylized-concept. Asset type: square grayscale texture mask for a cozy farming game's iris screen transition. Create a single bold, friendly broad leaf silhouette, pure opaque white on an entirely pure black background. Leaf body centered exactly at the image center, broad and almost circular with softly pointed top angled slightly right and a tiny subtle stem at the bottom left. Occupy about 85 percent of the square image width and height, generous black border on all edges. The entire central half of the image must be solid white, with no veins, cuts, holes or interior decoration. Slightly organic contour with a few restrained rounded lobes, charming farming-game feel, readable as it shrinks. Flat binary black and white graphic, crisp clean edges. Absolutely no shadows, gradients, texture, lighting, outlines, text, frame, watermark, extra leaves or other objects. This is a functional aperture mask, not a picture of a physical leaf. Square composition.
