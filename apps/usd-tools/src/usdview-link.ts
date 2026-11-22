// TypeScript usdview from the tool pages: where it is, and handing it a
// file to open in a new tab.

/** TypeScript usdview, next to the tool pages as on andrew.beer (/s/usdview
 *  beside /s/usd-tools), or where ?usdview= says. */
export const usdviewUrl = new URL(new URLSearchParams(location.search).get('usdview') ?? '../../usdview/', location.href)

/** usdview's licenses page, which covers the code the tool pages run. */
export const licensesUrl = new URL('licenses/', usdviewUrl).href

/** Opens usdview in a new tab and hands it the file: usdview (?open=handoff)
 *  says when it is ready, then is sent the bytes (usdview's main.ts).
 *  Returns false when the browser blocked the tab. */
export function openInUsdview(name: string, bytes: Uint8Array): boolean {
  const url = new URL(usdviewUrl)
  url.searchParams.set('open', 'handoff')
  const tab = window.open(url, '_blank')
  if (!tab) return false
  const timer = setTimeout(() => { removeEventListener('message', ready) }, 60_000)
  function ready(event: MessageEvent): void {
    if (event.source !== tab || (event.data as { type?: unknown } | null)?.type !== 'usdview.ready') return
    removeEventListener('message', ready)
    clearTimeout(timer)
    const copy = bytes.slice().buffer
    tab!.postMessage({ type: 'usdview.open-file', name, bytes: copy }, usdviewUrl.origin, [copy])
  }
  addEventListener('message', ready)
  return true
}
