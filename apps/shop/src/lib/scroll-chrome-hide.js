/** Scroll ile üst/alt chrome gizleme — px cinsinden birikimli ilerleme (0 = tam görünür, 1 = tam gizli) */
export const CHROME_HIDE_RANGE_PX = 96;

/**
 * @param {number} prevProgress 0..1
 * @param {{ scrollY: number, delta: number, nearDocumentBottom: boolean, scrollThreshold: number, scrollUpDelta: number }} opts
 * @returns {number} 0..1
 */
export function nextChromeHideProgress(
  prevProgress,
  { scrollY, delta, nearDocumentBottom, scrollThreshold, scrollUpDelta },
) {
  let p = prevProgress;
  if (scrollY <= scrollThreshold) {
    p = 0;
  } else if (delta > 0) {
    p = Math.min(1, p + delta / CHROME_HIDE_RANGE_PX);
  } else if (delta < -scrollUpDelta && !nearDocumentBottom) {
    p = Math.max(0, p + delta / CHROME_HIDE_RANGE_PX);
  }
  return p;
}

/** Boolean tüketiciler (alt nav, kompakt mod eşiği) */
export function scrollingDownFromProgress(progress, threshold = 0.04) {
  return progress > threshold;
}
