# Life Forge / iPhone — native project 1.5

The unsigned device IPA is compiled on macOS through the isolated life-forge-ios-build GitHub branch. Install with Sideloadly and your Apple ID on Windows. App and WidgetKit extension must both remain. Signing, installation, background delivery and permissions on the owner’s physical iPhone are not verified here.

Version 1.5 handles camera capture through WKUIDelegate and the actual AVFoundation
authorization status. For the Life Forge HTTPS main frame, a previously authorized
camera grants WebKit capture without another permission dialog. An undetermined
status asks the iOS system once; denied/restricted status is not prompted again.
Other origins, subframes, microphone and combined camera/microphone requests are
denied. Changing system privacy settings still takes effect. Camera capture starts
only when the owner opens the photo interface.
Update the existing app with the same Apple ID and bundle identifiers in Sideloadly;
do not delete it first. Web UI updates do not replace this native camera handler.

For building and signing from source:

1. Open `LifeForge.xcodeproj` in Xcode.
2. Select both targets → Signing & Capabilities → your Apple Team.
3. Choose unique bundle identifiers (`…LifeForge` and `…LifeForge.LiveTimer`).
4. Select your connected iPhone → Run. Sign in inside Life Forge.
5. Start “Роблю зараз” while the app is foregrounded. Lock the phone.

The widget shows a system-drawn elapsed timer, paused state and a Stop App Intent.
The timer's timestamps and records are the same ones as the web/desktop application.
Stop targets the exact entry ID; it cannot end a newer timer on another device.
Session cookies stay in this device's Keychain, accessible after the first unlock.
No Sites service credential, password or API key is embedded in the project.
The web/native bridge accepts messages only from the Life Forge origin and main frame.
Authenticated background Stop uses the normal Site sign-in session, denies redirects,
and may require a new sign-in if that session expires.

When Stop has no network or sign-in session, its **original stop time** is queued locally,
the displayed timer freezes and the widget says “ОЧІКУЄ МЕРЕЖІ”. “Повторити” or
opening the app retries the same stop. The other devices keep showing the running
server timer until that stop syncs. Never force another entry to stop.

Limits: Apple ends an active Live Activity after 8 hours; the journal timer remains
running until explicitly stopped. Sleep longer than 8 hours does not remain a live
system timer indefinitely. This build starts/updates the Live Activity from the
foreground app, not remotely when only the desktop app is open. Remote updates while
the iPhone app is suspended require a separately configured APNs provider and Apple
credentials, which are not available here. Web Push is for reminders, not a replacement
for ActivityKit updates. The PWA itself cannot create this lock-screen Live Activity.

Required device checks before release: ChatGPT sign-in in WKWebView, first start,
lock-screen Stop, offline Stop/retry, expired session, paused timer, simultaneous
phone/desktop switch, timezone changes, system 8-hour limit. No physical iOS testing
has been performed here. Both source targets are included in this Xcode project.

Version 1.2 adds two small Lock Screen widgets: **Мій день** (today's calendar)
and **Роблю зараз** (opens the activity chooser; never starts an invented activity).
After installation: hold the Lock Screen → Customize → Lock Screen → Add Widgets
→ Life Forge → select both circular widgets. iOS chooses their monochrome/tinted
appearance. Face ID/unlocking may be required to enter the private app.

Sleep: press **Йду спати** in the signed-in native app, then lock the iPhone.
The Live Activity uses the saved start time; **Прокинувся** closes that exact
record, including when synchronization must retry. A sleep record continues
after the system's eight-hour Live Activity limit; this is not an unlimited
overnight Lock Screen clock and is not a measurement of biological sleep.

Optional alarm integration must be set up once on the iPhone itself:
Shortcuts → Automation → Alarm → **Goes Off** (or **Is Stopped** if preferred)
→ choose the actual wake-up alarm → Run Immediately → Life Forge **Завершити сон**
→ reason **Спрацював будильник**. This action only targets a sleep record; it
cannot stop music/work/study. Alarm-ended sleep is marked wake-unconfirmed and
is not proof that the owner got up. No alarm list, private Clock API or scheduled
time is read. An alarm schedule edit alone does not end sleep.

If network/sign-in is unavailable, the original end time and exact sleep ID are
queued locally, then retried when the app opens. The action survives the Live
Activity's system timeout by reading the current authenticated sleep record.
It does not require an App Group or share account cookies with navigation widgets.
Test the shortcut, locked-device execution, an 8+ hour interval, offline end,
and a newer timer on another device with a signed device build before release.

Version 1.1: Persona-inspired black/paper/red Live Activity, per-category accent and
icon, system-drawn clock, accessible Stop/Retry controls. The displayed clock freezes
at the earlier of the current pause or original pending Stop. The web camera has a straight,
safe-area-aware full-screen layout; normal camera permissions are still required.

## Location journal (1.4)
Open the native app, sign in, open «Застосунок і дані» and tap «Увімкнути геолокацію».
Accept the system location permission; for background capture choose Always in iOS
Settings → Privacy & Security → Location Services → Life Forge. The app never retries
a denied prompt automatically. iOS may show its own background-location reminders.
Tracking persists across launches; «Зупинити геолокацію» stops both location services.
100-metre accuracy/distance mode plus significant-change events reduce battery usage.
Samples include timestamp and reported accuracy; at most one sample per minute.
Missing samples, stationary pauses, force-quits and permission/session expiry are gaps,
not inferred movement. No Apple guarantee of an uninterrupted route is made.
An offline JSON queue uses atomic writes and protected files accessible after first unlock.
Uploads use only the Site’s signed-in cookies from Keychain and never follow redirects.
Foreground metadata of other iPhone apps is unavailable in this build. There is no
Screen Time entitlement, continuous camera, microphone, screen or keystroke capture.
