# The Nexus Cloud app on a phone

Nexus Cloud is a progressive web app (PWA): it installs from the browser, opens full screen with its own icon, and always shows the live data on the server. There is no app store build.

## Install

| Device                                   | Steps                                                                                                                                          |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Android (Chrome, Edge, Samsung Internet) | Open the site, sign in, then Menu → **Install app** (or the browser's "Install app" banner).                                                   |
| iPhone / iPad                            | Open the site in **Safari**, tap Share (square with an arrow) → **Add to Home Screen** → Add. Settings → Install the app shows the same steps. |
| Laptop (Chrome, Edge)                    | The install icon in the address bar, or Settings → Install the app.                                                                            |

The installed app needs HTTPS, which Vercel provides. It signs in like the website; the session lives in the same secure cookie.

## On a phone

- A tab bar at the bottom: Home, Projects, Agents, Settings. **Menu** (top left) opens every section, plus Install app and Sign out. Tap beside the menu or press Escape to close it.
- Pages stack into one column: the cockpit, the Code tab (files, editor, agent, terminal), and the board, whose columns swipe sideways one at a time.
- Folders: zip them and use **Upload .zip**; **Download .zip** saves the task's files (see [files](files.md)).

## Offline and updates

The service worker (`/sw.js`) caches only the offline page and the icons. Signed-in pages and data are never stored on the phone; without a connection the app shows "You're offline" with a Try again button. A new deploy is picked up on the next open, with nothing to update by hand.

## Checks

`tests/e2e/13-mobile-app.spec.ts`: the manifest, icons, service worker and offline page load without a session; the service worker registers under the CSP; at phone size the tab bar and menu work, sign-out sits in the menu, and no page scrolls sideways.
