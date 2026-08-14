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

  /**
   * A Mapbox access token.
   *
   * The intended provider: with this set, the basemaps come from the Studio
   * styles drawn for this app. **Mapbox wins if both keys are set**, and
   * MapTiler stays reachable by removing this one, which is the road back if
   * the styles turn out wrong. Same public-by-construction caveat as above:
   * restrict it by URL in the Mapbox dashboard, because it is in the bundle.
   */
  readonly VITE_MAPBOX_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
