/// <reference types="vite/client" />
// Build and dev-server configuration the viewer reads (welcome.ts, tourSource).
interface ImportMetaEnv {
  /** The tour the welcome note's Start Museum Tour button plays (a root layer URL). */
  readonly VITE_MUSEUM_TOUR_URL?: string
  /** The plugInfo.json URLs the tour needs registered, comma-separated. */
  readonly VITE_MUSEUM_TOUR_PLUGINS?: string
  /** The typescript-usd package version (A.B.C+N), from vite.config.ts. */
  readonly VITE_TYPESCRIPT_USD_VERSION?: string
}
