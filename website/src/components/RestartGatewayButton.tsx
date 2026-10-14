import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'

import { Btn } from './ui'
import { i18nT } from '../i18n/t'

/**
 * How long a primed Restart button stays armed.
 *
 * Long enough to read the changed label and click again, short enough that an
 * armed control does not sit there as a trap for an unrelated click a minute
 * later.
 */
const ARM_TIMEOUT_MS = 5000

/**
 * Restart control with a two-step confirm.
 *
 * A restart drops every active session, so it must not fire on a single stray
 * click — but it is also recoverable (the gateway comes straight back), which is
 * why this is an armed button rather than the typed-token treatment reserved for
 * bulk-destructive actions.
 *
 * The arm auto-expires: an armed control left on screen becomes a trap for the
 * next click minutes later, when the user has forgotten what they armed. The
 * timer is cleared on unmount so a restart that navigates away cannot fire
 * `setState` on a dead component.
 *
 * Shared by Settings → About, the speech-to-text settings and the chat error
 * card for a repeated session-start failure, so the confirm step cannot drift
 * between them. It lives outside `pages/settings` so the chat page can render
 * it without importing the Settings panel.
 */
export function RestartGatewayButton({
  primary,
  pending,
  restarting,
  onConfirm,
  testId,
}: {
  primary?: boolean
  pending: boolean
  restarting: boolean
  onConfirm: () => void
  testId: string
}) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const timer = window.setTimeout(() => setArmed(false), ARM_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [armed])

  const busy = pending || restarting
  return (
    <Btn
      primary={primary && !armed}
      className={armed ? '!bg-[var(--warn)] !text-[var(--warn-fg)] hover:!opacity-80' : undefined}
      disabled={busy}
      data-testid={testId}
      // No static aria-label: the visible text IS the accessible name, and it is
      // what changes to announce the armed step. Pinning the label to "Restart
      // gateway" made a screen reader say the same thing on both clicks, hiding
      // the confirm from exactly the users who cannot see the colour change.
      onClick={() => {
        if (busy) return
        if (!armed) { setArmed(true); return }
        setArmed(false)
        onConfirm()
      }}
    >
      <RefreshCw size={13} className={`lucide-inline ${busy ? 'animate-spin' : ''}`} /> {restarting
        ? i18nT('pages.settings.aboutPanel.restarting')
        : armed
          ? i18nT('pages.settings.aboutPanel.restart_confirm')
          : i18nT('pages.settings.aboutPanel.restart_gateway')}
    </Btn>
  )
}
