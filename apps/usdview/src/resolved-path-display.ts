// How the viewer shows a resolved asset path. The viewer's resolver
// (http-resolver.ts) resolves each load's assets to
// usdview-load:<source id>:<URL>, so a resolved path finds its own load's
// transport again; the source id is an internal handle. usdview shows the
// file the path resolves to, so the viewer shows the URL.

/** usdview-load:<source id>:<URL> (http-resolver.ts sourcePath). */
export const usdviewLoadPath = /^usdview-load:(\d+):(.*)$/s

/** The URL a resolved path names, for display; other paths unchanged. */
export function displayResolvedPath(path: string): string {
  const match = usdviewLoadPath.exec(path)
  return match ? match[2]! : path
}
