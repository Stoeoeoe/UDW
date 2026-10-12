using System;

namespace UI.Shared
{
    [Flags]
    public enum ScreenPauseMode
    {
        None = 0,
        Character = 1,
        GameClock = 2,
        CharacterAndClock = Character | GameClock
    }
}
