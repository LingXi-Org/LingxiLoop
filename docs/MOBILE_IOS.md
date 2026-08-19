# LingxiLoop Mobile — iOS build & App Store submission

This document walks the end-to-end flow for building, testing and
submitting the LingxiLoop iOS app via Capacitor. It assumes a clean macOS
machine with Xcode 15+ and Ruby/CocoaPods installed.

## Architecture summary

- **Renderer**: the same Vite/React bundle that ships in Electron
  (`src/`). Mobile vs desktop is chosen by `useIsMobile()` in
  `src/lib/utils.ts`. On iOS/Android, Capacitor's native bridge sets
  `window.Capacitor.isNativePlatform()` to `true`, which forces the
  mobile shell regardless of viewport size (handles iPad split-view).
- **Native shell**: Capacitor 8.x. Config lives in
  `capacitor.config.ts`. Plugins wired through `src/lib/native.ts`:
  status bar, splash screen, keyboard, app (back button), haptics.
- **Backend**: the same cloud API used by Web and desktop. No production API
  is committed; an operator must supply `VITE_LINGXILOOP_API_BASE` at build
  time.
- **Release status**: native source is retained and branded, but no iOS or
  Android CI/publishing workflow is supported.

## One-time setup

```bash
# Install Capacitor plugin packages declared in package.json.
npm install

# The native iOS project (./ios/App) is already committed — do NOT run
# `npx cap add ios` on a fresh checkout.

# Generate App Icon + Splash assets from assets/lingxiloop-logo.svg.
# `sharp` is required just for this script — install transient.
npm install --no-save sharp
node scripts-gen-ios-assets.mjs

# Build the web bundle and copy native assets/plugins into ios/.
npm run mobile:sync
```

## Day-to-day development

```bash
# Iterate against a live web bundle in the simulator. Capacitor will
# load index.html from the bundled dist/ — for hot reload point
# server.url at your laptop's LAN IP (NOT checked in).
npm run mobile:ios:run
```

To run against a remote dev API, temporarily uncomment a `server.url`
in capacitor.config.ts (don't commit) or set `lingxiloop.serverUrl` via
localStorage in the in-WebView devtools.

## Release build for App Store / TestFlight

1. **Provide the API endpoint for this local build** — export a clean HTTPS
   origin as `VITE_LINGXILOOP_API_BASE`. Do not commit the value.

2. **Bump the version.** `Info.plist` reads `$(MARKETING_VERSION)` /
   `$(CURRENT_PROJECT_VERSION)`, so bump those two settings in
   `ios/App/App.xcodeproj/project.pbxproj` — each appears in both the
   Debug and Release configuration blocks. Every App Store Connect
   upload needs a unique (version, build) tuple; Apple rejects
   duplicates.

3. **Build and sync**:

   ```bash
   npm run mobile:sync
   ```

4. **Open in Xcode**:

   ```bash
   npx cap open ios
   ```

5. In Xcode:
   - Select the **App** target → **Signing & Capabilities**: pick
     your Apple Developer team. Bundle identifier should be
     `cn.lingxilearn.loop` (matches `capacitor.config.ts`). Note the
     committed Release config uses **manual signing** with a
     pre-created distribution cert + profile; on a fork, switch the
     Release config to your own team (automatic signing is fine
     for a first build).
   - Verify the App Icon set is `AppIcon` and the launch storyboard
     uses the generated Splash image.
   - **Product → Archive**. When the Organizer opens, choose
     **Distribute App → App Store Connect** → **Upload**.

6. In App Store Connect, attach the build to a new version, fill in
   the privacy/encryption answers, attach the screenshots described
   below, and submit for review.

## Required Info.plist keys

Add these to `ios/App/App/Info.plist` before submission (the Capacitor
defaults are too minimal for App Review):

```xml
<key>NSCameraUsageDescription</key>
<string>LingxiLoop uses the camera to share photos in conversations.</string>
<key>NSPhotoLibraryUsageDescription</key>
<string>LingxiLoop needs access to your photo library to attach images to messages.</string>
<key>NSMicrophoneUsageDescription</key>
<string>LingxiLoop can record short voice notes for your conversations.</string>
<key>NSUserTrackingUsageDescription</key>
<string>LingxiLoop does not track you across other apps and websites.</string>
<key>ITSAppUsesNonExemptEncryption</key>
<false/>
```

(Only include the camera/photo/mic strings if those features ship; App
Review rejects bundles that declare permissions they don't use.)

## App Store screenshots — required sizes

Apple currently requires:

| Device class                 | Pixels         | Notes                              |
|------------------------------|----------------|------------------------------------|
| 6.9" iPhone (15/16 Pro Max)  | 1290 × 2796    | Required for all iPhone-only apps  |
| 6.5" iPhone (XS Max)         | 1284 × 2778    | Optional fallback if 6.9" present  |
| 12.9" iPad Pro (3rd gen+)    | 2048 × 2732    | Required if app supports iPad      |

Use the iOS simulator: Device → 16 Pro Max, then Cmd+S in each of the
app's main tabs to capture a screenshot per surface. Save them anywhere
convenient (they are not tracked in the repo) and upload via
App Store Connect.

## Privacy — App Privacy questionnaire

LingxiLoop collects the following per-user data (be explicit when answering
the questionnaire):

| Category              | Items                  | Linked to user | Tracking | Reason             |
|-----------------------|------------------------|----------------|----------|--------------------|
| Contact Info          | Name, email            | Yes            | No       | Account            |
| User Content          | Messages, attachments  | Yes            | No       | App Functionality  |
| Identifiers           | User ID                | Yes            | No       | Account            |
| Usage Data            | Product Interaction    | Yes            | No       | Analytics (PostHog)|
| Diagnostics           | Crash data             | No             | No       | App Functionality  |

PostHog is the only third-party SDK and is keyed off the
`VITE_PUBLIC_POSTHOG_KEY` env. If the key is omitted at build time,
PostHog is not initialised — declare it conditional in the App Store
listing.

## Known mobile gaps tracked as follow-up work

- **Convene tab**: shows an intentional empty state until the
  workspace-wide active-sessions endpoint lands. Triggering a Convene
  from a conversation header still works.
- **MobileMe → Status**: removed pending a backend presence API.
  Resurface as a Status row once `setSelfStatus` exists server-side.
- **Voice / camera capture**: composer attachment picker uses the
  generic file input. To get a native sheet, add
  `@capacitor/camera` and branch on `isNativePlatform()` in the
  picker.

Push notifications, once on this list, have shipped end-to-end — see
[PUSH_NOTIFICATIONS.md](./PUSH_NOTIFICATIONS.md).

## Validating the build before upload

```bash
# Sanity check the web bundle that ships inside the .ipa.
npm run typecheck
npm run build

# Capacitor doctor — verifies plugin versions and native config.
npx cap doctor ios
```

If `cap doctor` flags missing pods, run `cd ios/App && pod install`.
