/**
 * Lets a screen or sheet tell the Download <-> Library tab swipe to stand down.
 *
 * App.tsx claims every clearly-horizontal move in the capture phase (which runs
 * parent-first), so a child that wants horizontal drags of its own - a trim
 * handle, a slider - never gets them: the tab swipe takes the gesture and the
 * screen behind slides instead. The child's own responder cannot prevent that,
 * because capture is decided before the child is asked.
 *
 * It is a counter, not a boolean, so two things holding the lock at once (a
 * sheet open *and* a handle being dragged inside it) cannot release each
 * other's hold.
 */
let holds = 0;

/** Takes the lock. Returns a release function that is safe to call twice. */
export function acquireTabSwipeLock(): () => void {
  holds += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds = Math.max(0, holds - 1);
  };
}

export function isTabSwipeLocked(): boolean {
  return holds > 0;
}
