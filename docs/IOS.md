# EventOS iOS app (TestFlight)

## How the app works

The iPhone app is a native shell (Capacitor 8) that opens the live site,
`https://eventos.werunthesestreetz.com`, full screen. So:

- **Web updates reach the app immediately.** Anything pushed to the branch Hostinger deploys shows up in the app the next time it opens. You only need a new TestFlight build when something native changes (icon, splash, plugins, `capacitor.config.json`, anything in `ios/`).
- Sign-in, roles, events, public pages and Stripe checkout behave exactly as on the web. The session cookie lasts across app restarts.
- Native touches: WRTS icon and launch screen, a navy status bar, **Export CSV** opens the iOS share sheet (Save to Files, Mail, AirDrop), **Share link** on the event page uses the share sheet, public event links open in an in-app Safari sheet, and a branded "You're offline" screen with **Try again**.
- iPhone runs portrait-only. iPad runs in any orientation and uses the desktop layout.

| Setting | Value | Where |
| --- | --- | --- |
| Bundle ID | `com.werunthesestreetz.eventos` | `capacitor.config.json`, Xcode project |
| App name under the icon | EventOS | `capacitor.config.json` |
| Version | 1.0.0 | `MARKETING_VERSION` in `ios/App/App.xcodeproj/project.pbxproj` |
| Build number | the workflow's run number (rises on every run) | `.github/workflows/ios.yml` |
| Minimum iOS | 15 | Xcode project |
| Icon and launch screen sources | `native/icon-1024.png`, `native/splash-2732.png` | copied into `ios/App/App/Assets.xcassets` |

## One-time Apple setup (about 30 minutes once the Developer account is active)

1. **Apple Developer Program.** Enroll at developer.apple.com/programs ($99/year). Enroll as an organization for We Run These Streetz LLC so the App Store lists the company as the seller. Organization enrollment needs a D-U-N-S number; Apple can take a few days to verify it.
2. **Register the bundle ID.** developer.apple.com → Certificates, IDs & Profiles → Identifiers → **+** → App IDs → App. Description `EventOS`, Bundle ID **Explicit** `com.werunthesestreetz.eventos`. No capabilities are needed yet.
3. **Create the app in App Store Connect.** appstoreconnect.apple.com → Apps → **+** → New App. Platform iOS, name `EventOS` (if it's taken, use `WRTS EventOS`), primary language English (U.S.), bundle ID from step 2, SKU `wrts-eventos`.
4. **Create an API key.** App Store Connect → Users and Access → Integrations → App Store Connect API → Team Keys → **+**. Name it `GitHub TestFlight` with **Admin** access (needed so the build can create its own signing certificate). Download the `.p8` file. Apple only lets you download it once. Note the **Key ID** and the **Issuer ID** shown above the list.
5. **Find your Team ID.** developer.apple.com → Account → Membership details → Team ID (10 characters).
6. **Add four secrets to GitHub.** github.com/wrtsdev/EventOS → Settings → Secrets and variables → Actions → **New repository secret**:

   | Secret | Value |
   | --- | --- |
   | `APPLE_TEAM_ID` | Team ID from step 5 |
   | `ASC_KEY_ID` | Key ID from step 4 |
   | `ASC_ISSUER_ID` | Issuer ID from step 4 |
   | `ASC_KEY_P8` | The full text of the `.p8` file, including the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines |

   GitHub secrets stay private even though the repository is public, and runs started from forks never see them. Never commit the `.p8` file.

## Make a TestFlight build

github.com/wrtsdev/EventOS → **Actions** → **iOS app** → **Run workflow** → pick the branch → **Run workflow**.

The job takes about 10–20 minutes on a GitHub Mac (free for public repositories). When it's green, the build appears in App Store Connect → your app → **TestFlight** after Apple finishes processing, usually 5–30 minutes.

- **Internal testing** (you and up to 100 people on your App Store Connect team): no review. Add them under TestFlight → Internal Testing, and they install with the TestFlight app.
- **External testing** (up to 10,000 people by email or a public link): the first build of each version goes through Beta App Review, usually within a day. Apple asks for a description, a feedback email, and sign-in details for the reviewer. Give them a test organizer account, and mention the **Explore the demo** button.

Leave **Upload to TestFlight** unchecked to only test signing. The `.ipa` is then saved on the run for 7 days.

Pushes that change `ios/`, `native/`, `capacitor.config.json` or the npm packages run an unsigned compile check automatically, so a broken native build shows up before you need it.

## Working on a Mac (optional)

```bash
npm ci
npx cap sync ios      # copies the config and offline page into the Xcode project
npx cap open ios      # opens Xcode; pick a simulator or your iPhone and press Run
```

On your own iPhone, choose your team under Signing & Capabilities the first time.

To change the icon or launch screen, replace `native/icon-1024.png` (1024×1024, no transparency) or `native/splash-2732.png`, then copy them into `ios/App/App/Assets.xcassets` (`AppIcon.appiconset/AppIcon-512@2x.png` and the three files in `Splash.imageset/`).

For a new App Store version, raise `MARKETING_VERSION` (for example 1.1.0). Build numbers take care of themselves.

## Before the App Store (not needed for TestFlight)

- **App Review guideline 4.2 (minimum functionality).** Apple rejects apps that are "just a website." The share sheet, offline screen and native styling help, but plan at least one feature that only makes sense in an app before public release, for example a QR-code check-in scanner for race day or push notifications for registrations and day-of updates.
- **Payments.** Registration fees for real-world events can go through Stripe; Apple's in-app purchase rules don't cover goods and services used outside the app. **Donations** are stricter: inside an App Store app, only approved nonprofits can take them. If WRTS (an LLC) collects donations, the public page may need to send donors to Safari, or the nonprofit partner may need to be the one collecting. Check this before submitting.
- **Store listing.** You'll need a public privacy policy URL, a support URL, App Privacy answers (EventOS collects names, emails, ZIP codes, and payments through Stripe), and screenshots for 6.9" iPhone (and iPad, since the app supports it).
- **Sign-in links in email.** Invitation and password-reset links open in Safari, not the app. Universal Links can send them into the app later; that needs an `apple-app-site-association` file on the domain and the Associated Domains capability.
