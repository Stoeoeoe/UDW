# CLI operations

Project-specific Unity CLI commands for inspecting and testing the game. Run them
from the project folder with the Unity Editor open and the `unity` CLI available.

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
