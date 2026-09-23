# Text-first editorial refinement

The user approved the Troco colors, canonical logo, typography and centered
composition, and supplied Nubank references for scale and whitespace. Preserve
the brand, light/dark treatments and centered stack. Do not reproduce reference
logos, photography or 3D objects.

Use 80px lateral text margins on 1080px practical-lesson scenes (920px width),
124px maximum headlines and 88px maximum supporting text. Keep the existing
minimum readable sizes. Remove the redundant hook kicker for lessons only.
Use 96px major gaps and retain the small contextual illustration only in the
scenario. Full-bleed backgrounds remain unchanged; text never bleeds off-canvas.
Keep the existing short lesson copy and plain bio CTA. No provider writes or
changes to persisted campaign plans/media.

Implementation sequence: add a regression test for the missing kicker and
920px lesson layout limits; observe failure; add lesson-specific typography and
spacing to the existing renderer; run all checks; regenerate the 12-lesson
gallery and inspect representative scenes and full sample videos.
