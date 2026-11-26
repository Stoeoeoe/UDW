# Writing a Roemer short

Research checked 18 November 2026. The writer is at [localhost:3109/#writer](http://127.0.0.1:3109/#writer), using the same `npm run playground` server as the studies.

## What the sources support

| Source                                                                                                                                                              | Useful finding or advice                                                                                                                                      | What we do with it                                                                                           | Scope                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| [YouTube: Todd Sherman and Jenny Hoyos, 28 January 2025](https://blog.youtube/creator-and-artist-stories/youtube-shorts-deep-dive/)                                 | Hoyos stresses the opening second and a small, self-contained story.                                                                                          | Plan the first image and first line together. Put the question or visible change early.                      | Creator experience in an official interview, not a controlled study or an algorithm rule.                                                 |
| [TikTok: Creative Codes](https://ads.tiktok.com/business/en/blog/creative-best-practices-top-performing-ads)                                                        | Recommends an opening hook, body, and close, and designing for vertical display and sound.                                                                    | Give the opening a reason to watch and deliver its promise before finishing.                                 | Advertiser guidance. Its recall and conversion claims do not establish organic devlog performance. A sales CTA is not a requirement here. |
| [BBC Academy: Writing for different platforms](https://downloads.bbc.co.uk/academy/youngreporter/Lesson%20Plans%20-%20Lesson%20Five%20-%20Transcript%20English.pdf) | Images can tell part of the story; scripts should be planned for their medium.                                                                                | Write visual directions beside narration, rather than adding generic footage afterwards.                     | Journalism teaching, adapted here to devlogs.                                                                                             |
| [CDC: Audio Script Writing Guide, revised 19 April 2011](https://tools.cdc.gov/medialibrary/docs/AudioScriptWritingGuide.pdf)                                       | Conversational language and an aloud reading expose unclear phrasing and breath problems.                                                                     | Provide a narration-only read-through. Revise wording that is difficult to speak or follow.                  | Spoken delivery guidance, not social-platform retention research.                                                                         |
| [Guo, Kim & Rubin, 2014: How Video Production Affects Student Engagement](https://pg.ucsd.edu/publications/edX-MOOC-video-production-and-engagement_LAS-2014.pdf)   | Analysis of 6.9 million viewing sessions across four edX courses associates shorter videos and continuous drawing-style explanations with greater engagement. | Keep one focused explanation and plan meaningful visual progression.                                         | Observational MOOC study. Engagement is not proof of learning; its minute-scale findings do not establish an ideal Shorts duration.       |
| [Brame, 2016: Effective Educational Videos](https://pmc.ncbi.nlm.nih.gov/articles/PMC5132380/)                                                                      | Synthesizes work on attention cues, reducing irrelevant material, and complementary audio and visuals.                                                        | Mark the exact connection or code line being discussed; remove material that distracts from the explanation. | Research review about education, not a new experiment or evidence about TikTok distribution.                                              |

These sources support a starting method, not a guaranteed performance formula. The five beats, 45-second starting length, and 150 words/minute estimate are Mercurius editorial choices. There is no supported universal instruction to cut every two seconds, make everything a cliffhanger, or insert a follow request.

## Before drafting

Write down the audience, one concrete question or situation, and the result the viewer should understand. Gather a capture or source trace that can demonstrate it. For implementation claims, record source paths and revisions; distinguish observed behaviour, intent, and unfinished work.

Choose a **devlog** when the story is a change you made and its consequence for the player. Choose an **explainer** when the viewer needs to understand a mechanism. Both are editable starting structures. The prompts are questions for the author, not narration to copy.

## Starting template: 45 seconds

| Time   | Devlog          | Technical explainer | What to write                                                                                                               |
| ------ | --------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 0–4s   | The change      | The question        | A concrete opening line and its first image. The one-second curtain is included here; consider beginning narration over it. |
| 4–11s  | Before          | The situation       | Only the context needed to understand what follows.                                                                         |
| 11–26s | What I did      | How it works        | The decision or mechanism, with a visual that advances alongside the explanation.                                           |
| 26–39s | Show it working | The demonstration   | A comparable before/after, reproducible trace, or actual behaviour. Leave time for viewers to observe it.                   |
| 39–45s | Where it stands | The answer          | Resolve the opening and name a relevant limit. A genuine viewer question is optional.                                       |

Give every beat narration and visual/sound notes. Use the evidence field for captures still needed, paths, revisions, and uncertain claims. Change timings after reading aloud. The word estimate covers speech only; pauses, sound, code reading, and demonstrations still need space inside the planned duration. If an idea needs more context than the short allows, narrow the question rather than compressing every sentence.

## Review before recording

- Does the first line make sense to someone who has not seen an earlier episode?
- Does the demonstration support the claim? Is illustrative code clearly identified?
- Can a viewer follow the order of events without rereading?
- Does each visual have a job, and can it be read at phone size?
- Does the ending answer the opening? Can anything after that answer be removed?
- Read aloud, time it, and revise. Do not treat the estimate as a recording length.

## Saving and export

The writer autosaves one active draft in this browser, on this origin. It shows saving errors. Use **Save draft** to download a `.mercurius.json` file for durable storage or another machine, and **Open draft** to resume it. Opening or starting a new draft asks before replacing the current writing. Invalid files do not replace the draft. Browser storage is not a file backup; clearing browser data removes it.

**Export script .md** includes the brief, timed beats, narration, visual/sound directions, evidence, and scratchpad. **Narration .txt** contains only spoken text for recording. Keep these with an episode's existing `brief.md` and `script.md` as appropriate. Exports do not create Remotion scenes, synthesize speech, assign exact animation frames, or render a video; authored `timeline.ts` remains the production timing contract.
