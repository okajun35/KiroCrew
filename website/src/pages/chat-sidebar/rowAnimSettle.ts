/** When the session lane may start animating its rows. */
import { useEffect, useRef, useState } from 'react'

/** Upper bound on the hold, from mount. A read that never settles (a gateway
 *  with no sessions never marks its slot list loaded) must not leave the lane
 *  without row animation for the rest of the visit. */
export const ROW_ANIM_SETTLE_MAX_MS = 2000

/**
 * False until the lane's first population has painted, then true for the life
 * of the mount.
 *
 * WHY: a row's Framer layout projection animates any position change between two
 * commits, and the first commits of a fresh lane are full of changes that are not
 * movement. Every `.session-row` is `content-visibility: auto` with a 60px
 * intrinsic size, so the first layout places rows at that placeholder height and
 * the next one at their real height; the folder, tag-column and slot reads then
 * land one by one and refile rows. With projection on, each of those commits
 * springs the whole list into place, and every row also plays its mount slide-in,
 * so the list visibly collapses and re-expands as it loads. The slower the reads
 * (a remote crew's pane, over its tunnel), the further apart those commits land
 * and the more of it the user sees.
 *
 * Held until `readsSettled` (the reads that decide where rows sit) and then two
 * animation frames, so the rows have painted at their real size before the first
 * snapshot is taken. Rows that mount AFTER that keep their slide-in, which is the
 * point of it: a session that appears while the list is on screen. The sidebar
 * root mirrors the answer as `data-row-anim` (`holding` / `settled`).
 */
export function useRowAnimSettled(readsSettled: boolean, maxWaitMs = ROW_ANIM_SETTLE_MAX_MS): boolean {
  const [settled, setSettled] = useState(false)
  const mountedAt = useRef<number | null>(null)
  if (mountedAt.current === null) mountedAt.current = Date.now()
  useEffect(() => {
    if (settled) return
    const done = () => setSettled(true)
    const timer = window.setTimeout(done, Math.max(0, mountedAt.current! + maxWaitMs - Date.now()))
    let outer = 0
    let inner = 0
    if (readsSettled) outer = requestAnimationFrame(() => { inner = requestAnimationFrame(done) })
    return () => {
      window.clearTimeout(timer)
      cancelAnimationFrame(outer)
      cancelAnimationFrame(inner)
    }
  }, [readsSettled, settled, maxWaitMs])
  return settled
}
