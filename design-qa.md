# Design QA: desktop startup page

## Reference and render evidence

- Visual source of truth: `/Users/bytedance/.codex/generated_images/01a033ef-301f-7150-82f3-ae4e302b0281/exec-559d0b37-fc6c-480d-a325-dad5c18905c5.png`
- Rendered implementation: `/private/tmp/dsh-startup-implementation.png`
- Side-by-side comparison: `/private/tmp/dsh-startup-comparison.png`
- Browser QA viewport: 1280 × 720 CSS pixels at device pixel ratio 1. The desktop window opens at 1280 × 840 and has a 900 × 640 minimum; the implementation uses viewport-relative placement and a `max-height: 700px` adjustment.
- Source pixels: 1446 × 1087. Render pixels: 1280 × 720. The comparison normalized dimensions by viewport percentage because the startup page is responsive rather than fixed to the concept image's aspect ratio.
- State: light startup screen with the whale visible during its crossing, bubbles rising, ocean drifting, and the loading current in progress.

## Comparison

The full-view comparison covers the complete startup surface. The whale, title, subtitle, progress indicator, brand mark, negative space, and mint wave field are all large enough in that view, so a separate cropped comparison would not expose additional detail.

Comparison history:

1. The first render made the whale materially smaller than the selected concept. This P2 mismatch was fixed by increasing the responsive whale route to `clamp(220px, 28vw, 360px)` and softening the bubbles.
2. The larger whale then sat too close to the title. This P2 mismatch was fixed by moving the route to 20% from the top and preserving a clear title gap through the crossing.
3. The final render matches the concept's hierarchy and tone. No P0, P1, or P2 visual mismatch remains.

The implementation deliberately uses the repository's current whale and Mint app icon instead of recreating the exploratory concept's approximate marks. The omitted blue wake accent is a P3 styling difference; the moving whale, bubbles, waves, and loading current provide the intended motion without adding a second directional flourish.

## Runtime verification

- The page was rendered in the in-app browser from `http://localhost:4173/startup.html`.
- Computed styles reported running animations for the ocean, whale route, whale bob, bubbles, and progress current.
- The browser console was checked with no warnings or errors.
- There are no interactive controls on this transient screen. Reduced-motion behavior was verified through the stylesheet and the startup-page test: scene motion stops, bubbles are hidden, and the whale and progress indicator remain visible in static positions.

Final result: passed
