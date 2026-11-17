// The menu bar's version label: the typescript-usd release the viewer is built from, linked to its
// GitHub release. Package versions are A.B.C+N (CHANGELOG.md: the OpenUSD version and this port's
// release count); releases are tagged and shown as A.B.C.N. Web-native addition: upstream usdview
// shows no version.

/** `26.11.1+3` → `26.11.1.3`; undefined for anything that isn't A.B.C+N. */
export function releaseName(packageVersion: string | undefined): string | undefined {
  const m = /^(\d+\.\d+\.\d+)\+(\d+)$/.exec(packageVersion?.trim() ?? '')
  return m ? `${m[1]}.${m[2]}` : undefined
}

/** The label's markup, or nothing when the build carries no release version. */
export function versionLinkHtml(packageVersion: string | undefined): string {
  const name = releaseName(packageVersion)
  if (!name) return ''
  const href = `https://github.com/beersandrew/typescript-usd/releases/tag/v${name}`
  return `<a class="version-link" href="${href}" target="_blank" rel="noopener" title="typescript-usd release">typescript-usd ${name}</a>`
}
