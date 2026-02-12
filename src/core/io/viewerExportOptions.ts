// ============================================================
// Viewer Export Options - shared type + defaults
// ============================================================

export type ViewerTheme = "dark" | "light";

export interface ViewerExportOptions {
  // Orbit behavior
  autospin?: number; // 0=off, >0 speed, <0 reverse (rad/s)
  minDistance?: number;
  maxDistance?: number;

  // Branding / metadata
  title?: string;
  description?: string;
  theme?: ViewerTheme;
  customCss?: string;

  // Embed behavior
  responsiveEmbed?: boolean;
  aspectRatio?: string; // e.g. "16 / 9" or "4:3"

  // Viewer chrome
  showInfoPanel?: boolean;

  // Loading screen
  loadingEnabled?: boolean;
  loadingTitle?: string;
  loadingSubtitle?: string;
  loadingBackground?: string;
  loadingTextColor?: string;
  loadingAccentColor?: string;

  // Preview poster (embedded as data URL in exported HTML)
  includePreviewImage?: boolean;
  previewImageDataUrl?: string;
}

export const DEFAULT_VIEWER_EXPORT_OPTIONS: ViewerExportOptions = {
  autospin: 0,
  theme: "dark",
  responsiveEmbed: false,
  aspectRatio: "16 / 9",
  showInfoPanel: true,
  loadingEnabled: true,
  loadingTitle: "Loading Viewer",
  loadingSubtitle: "Preparing scene...",
  loadingBackground: "#101317",
  loadingTextColor: "#ffffff",
  loadingAccentColor: "#4da6ff",
  includePreviewImage: true,
};

export function mergeViewerExportOptions(
  options?: ViewerExportOptions
): ViewerExportOptions {
  return { ...DEFAULT_VIEWER_EXPORT_OPTIONS, ...(options ?? {}) };
}
