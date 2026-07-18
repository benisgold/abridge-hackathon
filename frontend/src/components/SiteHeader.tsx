import type { ReactNode } from 'react'
import './SiteHeader.css'

type Props = {
  /** Fires when the brand is clicked (usually navigate home). */
  onBrandClick?: () => void
  /** Right-side content: nav links, actions, or user info. */
  children?: ReactNode
}

/** The OpenCost Health top bar, shared by the landing page and the tool. */
export function SiteHeader({ onBrandClick, children }: Props) {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <button
          type="button"
          className="site-brand"
          onClick={onBrandClick}
          aria-label="OpenCost Health home"
        >
          <span className="site-brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path
                d="M4 12h16M12 4v16"
                stroke="#fff"
                strokeWidth="2.4"
                strokeLinecap="round"
              />
              <circle cx="12" cy="12" r="8" stroke="#5eead4" strokeWidth="1.6" />
            </svg>
          </span>
          OpenCost Health
        </button>
        {children && <div className="site-nav">{children}</div>}
      </div>
    </header>
  )
}
