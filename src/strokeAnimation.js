// strokeAnimation.js
// Builds Web Animations API Animations per stroke path, revealing each path
// sequentially via stroke-dasharray/stroke-dashoffset — the standard,
// dependency-free "line drawing" SVG animation technique.
//
// Each stroke gets TWO independent Animation objects sharing the same delay
// and duration: one for strokeDashoffset (ease-in-out, the drawing motion)
// and one for `stroke` color (always linear, so a percentage-based crossfade
// is actually linear in time). They're kept separate because WAAPI's
// per-keyframe easing applies to every property changing at that keyframe —
// a single Animation can't give strokeDashoffset an ease-in-out curve and
// `stroke` a linear one over the same segment. Both animations land in the
// same flat `animations` array; play/pause/cancel don't need to know which
// is which since they're driven identically.
//
// When strokeAnimationColor is set, the stroke draws in strokeAnimationColor
// and crossfades to its final block color over the last
// `strokeAnimationColorFade` percent of its own duration (0 = hard switch
// right at completion, no crossfade). When unset/null, the color animation
// is skipped entirely and the stroke just sits at its final block color.
//
// Stroke-number labels (if enabled) get a companion Animation, on the same
// delay as their stroke, that flips them from invisible to visible right as
// the stroke starts drawing — so numbers appear one at a time instead of all
// at once.
const NUMBER_REVEAL_FRACTION = 0.15; // fraction of `speed` spent fading the number in

export function buildStrokeAnimations(
  strokePathEls,
  { speed, strokeWidth, pathToColor, defaultColor, strokeAnimationColor, strokeAnimationColorFade }
) {
  const animations = [];

  strokePathEls.forEach((path, index) => {
    const finalColor = pathToColor.get(path) || defaultColor;
    const drawColor = strokeAnimationColor || finalColor;

    path.setAttribute("fill", "none");
    path.setAttribute("stroke", drawColor);
    path.setAttribute("stroke-width", String(strokeWidth));
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    path.removeAttribute("style");

    const totalLength = path.getTotalLength();
    path.style.strokeDasharray = String(totalLength);
    path.style.strokeDashoffset = String(totalLength);

    const delay = index * speed;

    const dashAnimation = path.animate(
      [{ strokeDashoffset: totalLength }, { strokeDashoffset: 0 }],
      { duration: speed, delay, fill: "forwards", easing: "ease-in-out" }
    );
    dashAnimation.pause();
    animations.push(dashAnimation);

    if (strokeAnimationColor && strokeAnimationColor !== finalColor) {
      const fadeFraction = Math.min(100, Math.max(0, strokeAnimationColorFade || 0)) / 100;
      const colorKeyframes =
        fadeFraction > 0
          ? [
              { stroke: drawColor, offset: 0 },
              { stroke: drawColor, offset: 1 - fadeFraction },
              { stroke: finalColor, offset: 1 },
            ]
          : [
              { stroke: drawColor, offset: 0 },
              { stroke: drawColor, offset: 1 },
              { stroke: finalColor, offset: 1 },
            ];

      const colorAnimation = path.animate(colorKeyframes, {
        duration: speed,
        delay,
        fill: "forwards",
        easing: "linear",
      });
      colorAnimation.pause();
      animations.push(colorAnimation);
    }
  });

  return animations;
}

export function buildStrokeNumberAnimations(strokeNumberEls, { speed }) {
  const animations = [];

  strokeNumberEls.forEach((text, index) => {
    text.style.opacity = "0";

    const revealDuration = speed * NUMBER_REVEAL_FRACTION;
    const animation = text.animate(
      [{ opacity: 0 }, { opacity: 1 }],
      {
        duration: revealDuration,
        delay: index * speed,
        fill: "forwards",
        easing: "linear",
      }
    );
    animation.pause();

    animations.push(animation);
  });

  return animations;
}

export function playAnimations(animations) {
  animations.forEach((a) => {
    // WAAPI rewinds an animation back to currentTime 0 when you call
    // .play() on it while it's sitting at (or past) the end of its active
    // duration with a positive playbackRate — true whether its playState is
    // "finished" (never paused) or "paused" (paused after finishing, which
    // is exactly what pause() does to every animation, including strokes
    // that already fully drew before the pause). Checking playState alone
    // doesn't catch the "paused at the end" case, so compare currentTime
    // against the animation's own end time instead: skip .play() for any
    // animation that has already reached it, or a completed stroke would
    // visibly redraw itself from scratch out of sequence on resume.
    // Floating-point timing means currentTime can land a hair below the
    // true end (e.g. 1049.9999999998 vs. 1050) even when the animation has
    // fully played out — an exact >= comparison misses that and lets a
    // completed stroke's play() call rewind it to 0. A small epsilon
    // absorbs that imprecision.
    const endTime = a.effect.getTiming().delay + a.effect.getTiming().duration;
    if (a.currentTime !== null && a.currentTime >= endTime - 0.5) return;
    a.play();
  });
}

export function pauseAnimations(animations) {
  animations.forEach((a) => a.pause());
}

export function resetAnimations(animations, strokePathEls) {
  animations.forEach((a) => a.cancel());
  strokePathEls.forEach((path) => {
    const totalLength = path.getTotalLength();
    path.style.strokeDashoffset = String(totalLength);
  });
}

export function resetNumberAnimations(animations, strokeNumberEls) {
  animations.forEach((a) => a.cancel());
  strokeNumberEls.forEach((text) => {
    text.style.opacity = "0";
  });
}
