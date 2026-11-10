import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { installMobileEffect } from '../platform/breakpoints.ts'

/**
 * Local fork addition (2026-11-10): publish the right sidebar's open state on
 * `<html data-dsh-right-sidebar="open|closed">` so the stylesheet can hand the
 * full screen to the panel while it is open.
 *
 * Why a runtime probe instead of a pure-CSS `:has()` selector:
 * - The host keeps the collapse control in the DOM in BOTH states; only its
 *   computed `visibility` flips (`hidden` → `visible`). CSS cannot match on
 *   computed style.
 * - The opener (`[data-sidebar-right-expand]`) is unmounted while open, which
 *   looks usable — but there are close paths where it is not remounted
 *   promptly, and hiding the header on that signal made the header disappear
 *   for good (reported 2026-11-10).
 *
 * Measuring the collapse control's visibility is the actual truth, so the
 * attribute always flips back when the panel closes, whatever closed it.
 */
const CLOSER = '[data-sidebar-right-toggle]'
const ATTRIBUTE = 'data-dsh-right-sidebar'

/** Read the panel state from the host's own collapse control. */
function readOpen(): boolean {
  const closer = document.querySelector(CLOSER)
  if (closer === null) return false
  const style = getComputedStyle(closer)
  if (style.visibility === 'hidden' || style.display === 'none') return false
  const rect = closer.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

/** Mirror the state onto <html>, touching the DOM only when it changed. */
function publish(): void {
  const root = document.documentElement
  const value = readOpen() ? 'open' : 'closed'
  if (root.getAttribute(ATTRIBUTE) !== value) root.setAttribute(ATTRIBUTE, value)
}

export function installRightSidebarState(ctx: ClientContext): void {
  installMobileEffect(ctx, 'dsh-web-mobile: right sidebar state', () => {
    let scheduled = false
    const timers: ReturnType<typeof setTimeout>[] = []
    // The host closes the panel with a transition: the class/attribute
    // mutation happens while the collapse control is still `visible`, and
    // nothing mutates once the transition ends — a single post-mutation read
    // would stay stale (open state stuck, header gone). Re-check a few times
    // across the transition instead.
    const RETRY_DELAYS = [0, 120, 320, 800]
    const run = (): void => {
      scheduled = false
      publish()
    }
    const schedule = (): void => {
      if (scheduled) return
      scheduled = true
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run)
      else setTimeout(run, 16)
      for (const delay of RETRY_DELAYS) {
        if (delay === 0) continue
        timers.push(setTimeout(publish, delay))
      }
    }

    publish()

    const observer = new MutationObserver(schedule)
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
    })

    // Safety net: while the panel is reported open, poll gently so a close
    // transition that mutates nothing still flips the attribute back.
    const interval = setInterval(() => {
      if (document.documentElement.getAttribute(ATTRIBUTE) === 'open') publish()
    }, 800)

    window.addEventListener('resize', schedule, { passive: true })
    window.addEventListener('orientationchange', schedule, { passive: true })

    return () => {
      observer.disconnect()
      clearInterval(interval)
      for (const timer of timers) clearTimeout(timer)
      window.removeEventListener('resize', schedule)
      window.removeEventListener('orientationchange', schedule)
      document.documentElement.removeAttribute(ATTRIBUTE)
    }
  })
}
