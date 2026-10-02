# BarkOff website

Marketing site for the [BarkOff](https://github.com/nikolamirilo/bark-off) app. It covers:

- **Landing page** with an animated hero and the **Bark Lab**, a live demo that runs the app's own bark detection rules on simulated sounds
- **Features** with a closer look at detection, the two messages, calibration, cooldown and reports
- **Download** with a direct APK download, install steps and a QR code for computer visitors. Google Play is shown as coming soon
- **Testing group** signup for the Google Play test, with the next steps for testers
- **Contact** form plus email, Instagram and TikTok
- **Privacy notes** (draft)

This branch holds the interactive prototype for review. The forms validate and show their success screens, but nothing is sent yet.

## Structure

| Path | What it is |
| --- | --- |
| `src/page.html` | Shell: header, footer, icon sprite and include slots |
| `src/views/*.html` | One file per page |
| `src/styles.css` | All styles, with the design tokens at the top |
| `src/app.js` | Router, hero animation, Bark Lab, report chart and forms |
| `assets/` | Illustrations and the bark sound, converted from the app repo |
| `index.html` | Built output. Do not edit it by hand |

## Build

```bash
node build.mjs
```

This inlines the styles, views and script into `index.html`.

## Preview

`index.html` has no `<html>` or `<head>` tags, because the artifact viewer adds them when it is published. To preview it locally, serve the folder and open the page:

```bash
python3 -m http.server 8080
# then open http://localhost:8080/index.html
```

## Publishing a new APK

The **Download APK** button and the QR code both point to:

```
https://github.com/nikolamirilo/bark-off/releases/latest/download/barkoff.apk
```

GitHub always serves this file from the newest release of the app repo, so the site does not change when you ship a new version.

1. Build the APK in the app repo: `eas build -p android --profile preview`
2. Download the `.apk` from the EAS build page and rename it to `barkoff.apk`.
3. On [nikolamirilo/bark-off](https://github.com/nikolamirilo/bark-off/releases/new), create a release (for example `v1.0.0`) and attach `barkoff.apk`.

Until the first release exists, the button opens a GitHub "not found" page.

## Before going live

- Publish the first APK release (see above).
- Connect the contact and testing group forms to a mailbox or form service.
- Swap the hand-drawn "Coming soon to Google Play" badge for the official badge once the app is on Google Play.
- Have the privacy notes reviewed.
