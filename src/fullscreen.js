// Fullscreen + landscape helpers. Must be called from a tap/click handler (browser rule).
export async function enterFullscreen() {
  const el = document.documentElement
  try {
    if (!document.fullscreenElement && el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' })
    else if (!document.fullscreenElement && el.webkitRequestFullscreen) el.webkitRequestFullscreen()
  } catch { /* not allowed / unsupported (e.g. iPhone Safari) */ }
  try { await window.screen.orientation?.lock?.('landscape') } catch { /* desktop or unsupported */ }
}

export async function exitFullscreen() {
  try { window.screen.orientation?.unlock?.() } catch { /* ignore */ }
  try { if (document.fullscreenElement) await document.exitFullscreen() } catch { /* ignore */ }
}

export const toggleFullscreen = () => (document.fullscreenElement ? exitFullscreen() : enterFullscreen())
