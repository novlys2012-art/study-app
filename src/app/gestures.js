// Mobile & tablet touch polish: swipe-to-dismiss for bottom sheets and visualViewport keyboard tracking.

const SWIPE_THRESHOLD_PX = 80;
const SWIPE_VELOCITY_PX_MS = 0.55;

export function enableSheetSwipe(dialog, closeSheet) {
  if (!dialog) return;
  let startY = 0, startX = 0, startAt = 0, dy = 0, dragging = false, tracking = false;

  const isBottomSheetMode = () => !window.matchMedia("(min-width: 900px)").matches;
  const isFormControl = (el) => !!el && !!el.closest("input, select, textarea, [contenteditable]");

  dialog.addEventListener("touchstart", (e) => {
    if (!dialog.open || e.touches.length !== 1 || !isBottomSheetMode()) return;
    if (dialog.scrollTop > 0 || isFormControl(e.target)) return;
    const t = e.touches[0];
    startY = t.clientY;
    startX = t.clientX;
    startAt = Date.now();
    dy = 0;
    dragging = false;
    tracking = true;
  }, { passive: true });

  dialog.addEventListener("touchmove", (e) => {
    if (!tracking || e.touches.length !== 1) return;
    const t = e.touches[0];
    const deltaY = t.clientY - startY;
    const deltaX = t.clientX - startX;
    if (!dragging) {
      if (deltaY < 8 || Math.abs(deltaX) > deltaY || dialog.scrollTop > 0) {
        if (Math.abs(deltaY) > 10 || Math.abs(deltaX) > 10) tracking = false;
        return;
      }
      dragging = true;
      dialog.style.transition = "none";
    }
    if (deltaY > 0) {
      dy = deltaY;
      dialog.style.transform = `translateY(${Math.round(dy)}px)`;
      if (e.cancelable) e.preventDefault();
    }
  }, { passive: false });

  const finish = () => {
    if (!tracking) return;
    tracking = false;
    if (!dragging) return;
    dragging = false;
    const elapsed = Math.max(1, Date.now() - startAt);
    const velocity = dy / elapsed;
    const dismiss = dy >= SWIPE_THRESHOLD_PX || velocity >= SWIPE_VELOCITY_PX_MS;
    if (dismiss) {
      dialog.style.transition = "";
      dialog.style.transform = "";
      closeSheet(dialog);
      return;
    }
    dialog.style.transition = "transform var(--t-fast) var(--ease)";
    dialog.style.transform = "translateY(0)";
    setTimeout(() => {
      dialog.style.transition = "";
      dialog.style.transform = "";
    }, 150);
  };

  dialog.addEventListener("touchend", finish, { passive: true });
  dialog.addEventListener("touchcancel", finish, { passive: true });
}

// Exposes soft keyboard height as CSS custom property --kb so bottom sheets and fixed bars stay clear of the keyboard.
export function trackKeyboardViewport() {
  if (typeof window === "undefined" || !window.visualViewport) return;
  const vv = window.visualViewport;
  const root = document.documentElement;
  let prevKb = 0;

  const update = () => {
    const raw = window.innerHeight - vv.height - vv.offsetTop;
    const kb = raw > 80 ? Math.round(raw) : 0;
    if (kb === prevKb) return;
    prevKb = kb;
    root.style.setProperty("--kb", kb + "px");
    document.body.classList.toggle("kb-open", kb > 0);
    if (kb > 0 && document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
      requestAnimationFrame(() => {
        try { document.activeElement.scrollIntoView({ block: "nearest", behavior: "smooth" }); } catch (e) {}
      });
    }
  };

  vv.addEventListener("resize", update, { passive: true });
  vv.addEventListener("scroll", update, { passive: true });
}
