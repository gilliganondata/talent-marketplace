// public/assets/theme.js
//
// Reads window.SITE_CONFIG.theme (set in site-config.js) and applies the
// matching palette as CSS custom properties on the document root, so every
// page's stylesheet (which references var(--color-primary) etc.) picks it
// up automatically. Load this AFTER site-config.js and BEFORE any visible
// content, so there's no flash of the wrong colors.

const THEMES = {
  slate:  { bg: "#ffffff", text: "#1a1a1a", primary: "#1a1a1a", primaryText: "#ffffff", accentBg: "#f5f5f5", border: "#cccccc" },
  ocean:  { bg: "#f7fbfd", text: "#0f2430", primary: "#0f6e8c", primaryText: "#ffffff", accentBg: "#e6f4f8", border: "#bcdce6" },
  forest: { bg: "#f7faf7", text: "#1c2a1c", primary: "#2f6b3a", primaryText: "#ffffff", accentBg: "#e7f2e8", border: "#c3dcc6" },
  sunset: { bg: "#fffaf7", text: "#2a1a12", primary: "#d1592f", primaryText: "#ffffff", accentBg: "#fbe8de", border: "#f0c3ac" },
  plum:   { bg: "#faf7fb", text: "#241a2a", primary: "#6b3f8c", primaryText: "#ffffff", accentBg: "#ede3f2", border: "#d6bfe6" }
};

(function applyTheme() {
  const key = (window.SITE_CONFIG && window.SITE_CONFIG.theme) || "slate";
  const theme = THEMES[key] || THEMES.slate;
  const root = document.documentElement.style;
  root.setProperty("--color-bg", theme.bg);
  root.setProperty("--color-text", theme.text);
  root.setProperty("--color-primary", theme.primary);
  root.setProperty("--color-primary-text", theme.primaryText);
  root.setProperty("--color-accent-bg", theme.accentBg);
  root.setProperty("--color-border", theme.border);
})();