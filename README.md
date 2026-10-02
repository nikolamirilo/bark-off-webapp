# BarkOff website

Marketing site for the [BarkOff](https://github.com/nikolamirilo/bark-off) app. It covers:

- **Landing page** with an animated hero and the **Bark Lab**, a live demo that runs the app's own bark detection rules on simulated sounds
- **Features** with a closer look at detection, the two messages, calibration, cooldown and reports
- **Download** with the Google Play link, a QR code for desktop visitors and the iPhone waitlist
- **Testing group** signup with the next steps for testers
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

## Before going live

- Connect the contact and testing group forms to a mailbox or form service.
- Replace the hand-drawn Google Play and App Store badges with the official ones.
- The Google Play link points to `com.reactifysolutions.barkoff`. While the app is in closed testing it only opens for testers.
- Have the privacy notes reviewed.
