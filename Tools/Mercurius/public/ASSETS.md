# Asset provenance

| Files                                              | Origin                                                       | Licence                                              |
| -------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------- |
| shared/fonts/cinzel-latin-400-normal.woff2         | @fontsource/cinzel; upstream Google Fonts Cinzel             | SIL OFL 1.1; Cinzel-LICENSE.txt alongside font       |
| shared/fonts/gideon-roman-latin-400-normal.woff2   | @fontsource/gideon-roman; upstream Google Fonts Gideon Roman | SIL OFL 1.1; GideonRoman-LICENSE.txt alongside font  |
| shared/fonts/noto-sans-mono-latin-400-normal.woff2 | @fontsource/noto-sans-mono; upstream Noto fonts              | SIL OFL 1.1; NotoSansMono-LICENSE.txt alongside font |
| episodes/demo/dependency-study.svg                 | Authored here for STO-107                                    | Project-owned geometric illustration                 |
| shared/graphics/mercurius.svg                      | Authored here for the playground                             | Project-owned vector monogram                        |
| Inline icons                                       | lucide-react                                                 | ISC; licence shipped with dependency                 |

RomanOrnament's inline meander, laurel, and wave are original SVG paths inspired by the user's reference board. No reference image files are embedded.

Font package versions are pinned in package.json and package-lock.json. Copy the named files from each package's files/ directory and its LICENSE into shared/fonts/ to reproduce the bundled assets. Rendering never downloads fonts.

For new footage, images, music, and narration, record source, author, licence, attribution requirements, and permission evidence here. Keep episode assets under their stable ID, reused assets under shared/, and renders under ignored out/. No third-party footage or music is used by the playground.
