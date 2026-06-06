/**
 * QNSA School Plans — Logo Component
 * Clipboard-checklist mark in maroon tones on a white tile
 */

const LOGO_SVG = `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="13" y="16" width="38" height="42" rx="7" fill="#ffffff" stroke="#6f1029" stroke-width="4"/>
  <polyline points="19,29.5 22,32.5 27,26.5" fill="none" stroke="#a83356" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>
  <line x1="32" y1="29.5" x2="45" y2="29.5" stroke="#d98ea0" stroke-width="3.6" stroke-linecap="round"/>
  <polyline points="19,40 22,43 27,37" fill="none" stroke="#a83356" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>
  <line x1="32" y1="40" x2="45" y2="40" stroke="#d98ea0" stroke-width="3.6" stroke-linecap="round"/>
  <polyline points="19,50.5 22,53.5 27,47.5" fill="none" stroke="#a83356" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>
  <line x1="32" y1="50.5" x2="45" y2="50.5" stroke="#d98ea0" stroke-width="3.6" stroke-linecap="round"/>
  <path d="M28.5 10 V8 a3.5 3.5 0 0 1 7 0 V10" fill="none" stroke="#8a1538" stroke-width="3" stroke-linecap="round"/>
  <rect x="24" y="10" width="16" height="12" rx="4" fill="#ffffff" stroke="#8a1538" stroke-width="3"/>
</svg>`

interface LogoProps {
  size?:       number
  tileBg?:     string   /* خلفية المربع */
  shadow?:     boolean
  className?:  string
}

export default function Logo({
  size     = 40,
  tileBg   = '#ffffff',
  shadow   = true,
  className = '',
}: LogoProps) {
  const radius  = Math.round(size * 0.25)
  const padding = Math.round(size * 0.13)

  return (
    <span
      aria-label="QNSA logo"
      className={className}
      style={{
        width:       size,
        height:      size,
        borderRadius: radius,
        background:  tileBg,
        boxShadow:   shadow ? 'var(--shadow-sm)' : 'none',
        display:     'inline-flex',
        alignItems:  'center',
        justifyContent: 'center',
        flexShrink:  0,
        padding,
        boxSizing:   'border-box',
      }}
      dangerouslySetInnerHTML={{ __html: LOGO_SVG }}
    />
  )
}
