// public/assets/site-config.js
//
// Edit these values for your own deployment. Nothing here is secret —
// it's just display text and a style choice, safe to commit.
//
// Theming: see the "Theming" section of the README.

window.SITE_CONFIG = {
  ownerName: "Tim Wilson",
  siteName: "Tim Wilson's Personal Talent Marketplace",
  // Pick one preset: "slate" (neutral gray/black), "ocean" (blue), "forest" (green),
  // "sunset" (warm orange/coral), "plum" (purple), "midnight" (neutral dark) —
  // or "custom" to use the customTheme object below.
  theme: "custom",
  customTheme: {
    base: "midnight",
    bg: "#14161A", surface: "#1C1F24", text: "#F4F2EC", mutedText: "#868B8F",
    primary: "#FFC23C", primaryText: "#14161A", accentBg: "#1C1F24",
    border: "#34383F", link: "#4C8DFF", focus: "#FFC23C", danger: "#E5735C",
    fontBody: "'IBM Plex Sans', sans-serif", fontDisplay: "'Archivo', sans-serif",
    colorScheme: "dark"
  },
  // Optional: a stylesheet that loads the fonts named in customTheme.
  fontStylesheetUrl: "https://fonts.googleapis.com/css2?family=Archivo:wght@600;800&family=IBM+Plex+Sans:wght@400;500&display=swap",
  repoUrl: "https://github.com/gilliganondata/talent-marketplace"
};
