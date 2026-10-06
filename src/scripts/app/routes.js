// Every page of the site in one table. The router reads it to swap views and rewrite the
// per-page metadata; build.mjs reads the same table to write sitemap.xml and to fill in the
// home page's title, description and canonical. Adding a page here is enough for both.
//
// `path` is relative to the site root and has no trailing slash, which is what lets the
// built index.html keep using relative links: from /features, "download" resolves to
// /download and "styles.css" to /styles.css.

export const ROUTES = {
  home: {
    path: "",
    title: "BarkOff - dog separation anxiety and bark control",
    description:
      "Does your dog bark or whine when left alone? BarkOff listens while you are out and plays your own recorded voice the moment it starts. Free on Android.",
    priority: "1.0",
  },
  features: {
    path: "features",
    title: "Features | BarkOff",
    description:
      "How BarkOff decides a sound is loud enough, the gentle message and the firm one, setting sensitivity by barking at your phone, the cooldown, and the session report.",
    priority: "0.8",
  },
  download: {
    path: "download",
    title: "Download for Android | BarkOff",
    description:
      "Download BarkOff free for Android and start calming your dog with your own voice. Install the APK from this page, or scan the QR code from a computer.",
    priority: "0.9",
  },
  beta: {
    path: "beta",
    title: "Testing group | BarkOff",
    description:
      "Join the BarkOff testing group and help bring it to Google Play. Testers install through a Google Play test and tell us what to improve. An Android phone is needed.",
    priority: "0.7",
  },
  contact: {
    path: "contact",
    title: "Contact | BarkOff",
    description:
      "Questions, bugs, ideas, or a photo of your dog. Message the BarkOff team here, or reach us by email, Instagram or TikTok. We read everything that comes in.",
    priority: "0.5",
  },
  privacy: {
    path: "privacy",
    title: "Privacy | BarkOff",
    description:
      "What BarkOff does with sound and data, in plain words. Audio is measured on your phone, never uploaded, and deleted when the session ends. Your voice stays local.",
    priority: "0.3",
  },
};

// Sections of the home page that have their own #token. They scroll rather than swap views,
// so they are not pages and never reach the sitemap.
export const ANCHORS = { how: "home", lab: "home", faq: "home" };

// Shown for anything that does not resolve. Kept out of ROUTES so it cannot be indexed.
export const NOT_FOUND = {
  title: "Page not found | BarkOff",
  description: "That page could not be found.",
};

export const VIEWS = Object.keys(ROUTES);
