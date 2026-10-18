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
