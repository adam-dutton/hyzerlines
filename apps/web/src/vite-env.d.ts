/// <reference types="vite/client" />

/**
 * Build-time configuration.
 *
 * `VITE_` is not decoration: Vite only exposes variables with that prefix to
 * client code, which is the guard that stops a server secret reaching the
 * browser by accident. Everything here is therefore **public** — it is compiled
 * into the bundle any visitor can read. Nothing that must stay secret belongs
 * in this file.
 */
interface ImportMetaEnv {
  /**
   * A MapTiler Cloud API key.
   *
   * Optional. Without it the app falls back to the keyless basemap registry and
   * still works — see `basemaps.ts`, which explains why that fallback exists
   * rather than a hard failure.
   *
   * It ships in the bundle and cannot be hidden, so it must be **restricted by
   * origin** in the MapTiler dashboard. That restriction, not secrecy, is what
   * stops somebody else spending your tile quota.
   */
  readonly VITE_MAPTILER_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
