# CLI operations

Project tooling for authoring, inspecting and testing the game. Run Unity commands from the project root with
the Unity Editor open and the `unity` CLI available.

## Music content (Apollo)

Music is authored in the Vulcanus Music editor: **New > Music** imports a MIDI and SoundFont
with a stable namespaced cue ID and proposes musical loop bounds. Select named SoundFont presets,
adjust the loop/fade, preview the mix and press **Render**. Renders replace the fixed Unity output under
`Assets/Content/Music/mymod/score`, preserving existing Unity GUIDs. Unity imports
`cue.apollocue` automatically. In Vulcanus map metadata assign `musicCue` and
`musicPreset` to choose where the cue plays. See [Apollo](../Tools/Apollo/README.md).

## Weather

List authored weather IDs and the current Play Mode weather:

```powershell
unity command list_weather
```

Change weather while the game is running in Play Mode:

```powershell
unity command set_weather --weather LightRainSpring
unity command set_weather --weather Sunny
```

Use an ID returned by `list_weather`. The command also accepts a label or asset
name, ignoring case. Unknown or ambiguous matches are rejected.

Switching weather updates the existing effects, post-processing, daylight tint,
and weather notifications without advancing the date. Notifications and daylight
refresh finish on the next frame. The next normal weather roll, such as a new day,
replaces the selection; seasonal probabilities and authored assets stay unchanged.

Implementation: [WeatherCommands.cs](../Assets/Core/TimeAndWeather/Editor/WeatherCommands.cs).

## Social standing

Set the player's standing with a character, village or other subject while the game is running in Play Mode:

```powershell
unity command set_social_standing --subject base:fabia --standing 75
```

The standing is a whole number from 0 to 100. The result lists the previous and new standing. It changes standing through
`SocialStandingService`, so the saved state and the changed event behave as in play, and dialogue and routine conditions
see it at once. See [Social standing](../Assets/Core/SocialStanding/README.md).

Implementation: [SocialStandingCommands.cs](../Assets/Core/SocialStanding/Editor/SocialStandingCommands.cs).

## Sleeping in place

Sleep through the night while the game is running in Play Mode:

```powershell
unity command sleep_here
```

This runs the normal overnight sequence (fade out, new day, autosave, fade in)
but skips the trip home, so the player wakes up at their current position.
Sleeping at a bed still returns the player to their home bed.

Implementation: [DayCommands.cs](../Assets/Core/TimeAndWeather/Editor/DayCommands.cs).

## Navigation

Send a character in the current map to an anchor with tile pathfinding while the game is running in Play mode:

```powershell
unity command navigate_to --characterId <id> --anchorId <anchor>
```

The result lists the status, total cost and planned waypoints (or the error). The route keeps walking until it
arrives, the location unloads or Play mode stops. See [Tile README](../Assets/Core/Tile/README.md) for the rules and the
Scene-view debug view (**Tools > Navigation > Show Navigation Debug**).

Implementation: [NavigationCommands.cs](../Assets/Character/Editor/NavigationCommands.cs).

## Indoor weather

In Vulcanus map metadata, set **Location Type** to **Indoor** for rooms. **Mute
weather audio** disables weather ambience in that location, indoors or outdoors,
without affecting other audio. These fields import as `LocationData.locationType`
and `LocationData.muteWeatherAudio`.

Each `WeatherData` defines optional **Outdoor Ambience** and **Indoor Ambience**
looping clips, their shared volume, and **Indoor Daylight Color Gradient**. An
unassigned clip is silent; there is no fallback from indoor to outdoor audio.
The indoor gradient is sampled using the same playable-day progress as outdoor
lighting. Rain starts with an 80% neutral indoor tint; other weather defaults to
white. Assign the same clip to both ambience slots to keep a loop playing across
room transitions, or use a separate indoor recording. **Indoor Ambience Low Pass**
enables a source-local filter indoors with the authored **Indoor Ambience Cutoff
Frequency** (Hz). **Indoor Ambience Volume Multiplier** controls its indoor level.
Light rain uses the same loop in both slots, a 1500 Hz cutoff and a 0.6 indoor
volume multiplier. Returning outdoors disables the filter and restores volume.

Entering a room suppresses the fullscreen weather material and water rain
splashes immediately, without changing the rolled weather. Indoor and cutscene
suppression compose independently, so revealing a cutscene inside a room keeps
weather hidden. Returning outside restores the active weather and seasonal or
weather-specific outdoor daylight ramp. Extra indoor effects such as thunder
are not implemented.
