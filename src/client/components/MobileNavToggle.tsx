import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { IconPanelLeft } from '../core/icon-compat.ts'
import { NS } from '../i18n/locales.ts'
import { openFilesPanel } from './open-files-panel.ts'

/** Full props for the session-header directory toggle. */
export interface MobileNavToggleProps extends PropsRuntime<'conversation.session.header.actions'>, PropsLocale<typeof NS> {
  /** Bound ctx.layout.toggleSidebar(). */
  toggleSidebar: () => void
}

/**
 * Mobile-only icon buttons next to the session title:
 * - toggle: opens the directory drawer on narrow screens.
 * - files: opens the file browser directly — one tap, no drawer round-trip.
 *   Which surface that is (host right sidebar vs. the third-party explorer
 *   sheet) is decided in open-files-panel.ts. The hero/blank phases have no
 *   session header, so this control is absent there; the files entry in those
 *   phases is the right-edge leftward swipe (sidebar-swipe.ts).
 * Hidden entirely on wide screens (CSS media query).
 */
export function MobileNavToggle({ toggleSidebar, t }: MobileNavToggleProps) {
  const toggleExplorer = (): void => {
    openFilesPanel()
  }
  return (
    <>
      <button
        type="button"
        data-mobile-nav="toggle"
        aria-label={t('open')}
        title={t('open')}
        onClick={() => toggleSidebar()}
      >
        <IconPanelLeft size={16} />
      </button>
      <button
        type="button"
        data-mobile-nav="files"
        aria-label={t('sidebarRight')}
        title={t('sidebarRight')}
        onClick={toggleExplorer}
      >
        {/* Host only ships IconPanelLeft; mirroring it gives the same glyph the
            desktop header uses for the right sidebar. */}
        <span style={{ display: 'inline-flex', transform: 'scaleX(-1)' }}>
          <IconPanelLeft size={16} />
        </span>
      </button>
    </>
  )
}
