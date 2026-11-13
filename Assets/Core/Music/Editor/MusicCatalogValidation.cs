using System;
using System.Collections.Generic;
using System.Linq;

namespace Core.Music.Editor
{
    /// <summary>Arrangements of one theme are switched in time with each other, so they must share timing and sample counts.</summary>
    internal static class MusicCatalogValidation
    {
        public static void Validate(IEnumerable<MusicCue> cues)
        {
            foreach (var group in cues.GroupBy(cue => cue.Theme))
            {
                var first = group.First();
                foreach (var cue in group.Skip(1))
                    if (cue.bpm != first.bpm || cue.beatsPerBar != first.beatsPerBar || cue.loopBars != first.loopBars ||
                        cue.stems[0].clip.frequency != first.stems[0].clip.frequency || cue.stems[0].clip.samples != first.stems[0].clip.samples)
                        throw new InvalidOperationException($"Music theme '{group.Key}' has arrangements with different timing or sample counts.");
            }
        }
    }
}
