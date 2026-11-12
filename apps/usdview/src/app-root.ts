// The viewer's own files (the build's public/ copy: plugins/, assets/) are
// served next to its index.html, which need not be the page that loads the
// viewer: a page elsewhere may import the built entry (e.g. a page under
// another path importing /viewer/assets/index-*.js). They
// are resolved against the viewer's root, found from this module's URL: the
// module is one directory below the root both in the source layout
// (src/app-root.ts under the dev server) and in the build (assets/*.js), so
// this file must stay directly in src/.

/** The viewer root (the directory of its index.html), with a trailing slash. */
export function viewerRoot(): URL {
  // String(...): Vite's dev server rewrites `new URL('<literal>',
  // import.meta.url)` to the file it names, and for '..' that is the
  // directory without its trailing slash (/@fs/.../apps/usdview), so
  // './assets/x' resolved against it dropped 'usdview'. Converting the
  // module URL first keeps the browser's own resolution.
  return new URL('..', String(import.meta.url))
}

/** A viewer file's URL. It is the path as given when the page is the viewer's
 *  own page (the path then means the same file), so URLs shown or compared
 *  in the UI keep their written form; otherwise it is the absolute URL. */
export function viewerFileUrl(path: string, base: string = document.baseURI): string {
  const url = new URL(path, viewerRoot()).href
  return new URL(path, base).href === url ? path : url
}
