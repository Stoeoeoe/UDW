# Asset provenance

| Files                                              | Origin                                                                                            | Licence / usage                                                                  |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| shared/fonts/inter-latin-{400,700}-normal.woff2    | Installed @fontsource/inter package; upstream https://github.com/rsms/inter                       | SIL Open Font License 1.1; full notice in shared/fonts/Inter-LICENSE.txt         |
| shared/fonts/jetbrains-mono-latin-400-normal.woff2 | Installed @fontsource/jetbrains-mono package; upstream https://github.com/JetBrains/JetBrainsMono | SIL Open Font License 1.1; full notice in shared/fonts/JetBrainsMono-LICENSE.txt |
| episodes/demo/dependency-study.svg                 | Authored in this repository for STO-107                                                           | Project-owned geometric illustration; no third-party reference or game capture   |
| Inline icons                                       | lucide-react                                                                                      | ISC; upstream licence shipped with dependency                                    |

Font package versions are pinned in package.json and package-lock.json. To reproduce the bundled files, copy the named files from each package's files/ directory into shared/fonts/ and copy each package's LICENSE alongside them. No font download is performed during a render.

For every new footage, image, music, or narration asset, record the source URL/author, licence, required attribution, and permission evidence here. Keep episode assets under their stable episode ID; put reused assets under shared/. Use original or explicitly licensed material. Do not treat a freely downloadable placeholder as licensed. Never commit secrets, private recordings without permission, or generated renders here.
