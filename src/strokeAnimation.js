// strokeAnimation.js
// Builds one Web Animations API Animation per stroke path, revealing each
// path sequentially via stroke-dasharray/stroke-dashoffset — the standard,
// dependency-free "line drawing" SVG animation technique. Each stroke gets
// its own Animation object so play/pause/cancel naturally stay consistent
// per-stroke (the browser owns the timeline, not hand-rolled state).
export function buildStrokeAnimations(strokePathEls, { speed, strokeWidth, pathToColor, defaultColor }) {
  const animations = [];

  strokePathEls.forEach((path, index) => {
    const color = pathToColor.get(path) || defaultColor;

    path.setAttribute("fill", "none");
    path.setAttribute("stroke", color);
    path.setAttribute("stroke-width", String(strokeWidth));
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    path.removeAttribute("style");

    const totalLength = path.getTotalLength();
    path.style.strokeDasharray = String(totalLength);
    path.style.strokeDashoffset = String(totalLength);

    const animation = path.animate(
      [{ strokeDashoffset: totalLength }, { strokeDashoffset: 0 }],
      {
        duration: speed,
        delay: index * speed,
        fill: "forwards",
        easing: "ease-in-out",
      }
    );
    animation.pause();

    animations.push(animation);
  });

  return animations;
}

export function playAnimations(animations) {
  animations.forEach((a) => a.play());
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