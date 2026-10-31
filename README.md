# Padkit

Controller support for existing websites and your own web applications. Includes a guided CLI, Chromium extension, small JavaScript/TypeScript SDK, and an optional macOS USB bridge for the PowerA FUSION Pro 2.

## Install

```sh
brew install simonstoryparker/tap/padkit
padkit setup
```

Setup uses arrow-key menus to select an installed browser, profile, controls and site. Domains such as `frsim.com` are accepted. Add the actual game address too, for example `rebuilt.frsim.com`: sites match exact origins.

Setup opens the extensions page and copies the extension folder path. Enable Developer mode, choose **Load unpacked**, press **⌘⇧G**, paste, then select the folder. There is **one extension per browser profile**, covering all enabled sites. After changing sites, Reload the existing extension and refresh the page.

```sh
padkit add rebuilt.frsim.com --browser dia --profile 'Profile 4'
padkit remove example.com --browser dia --profile 'Profile 4'
padkit browsers
padkit status
padkit doctor
brew upgrade padkit
```

Settings and generated extensions live in `~/Library/Application Support/Padkit`. `PADKIT_HOME` overrides this location. Setup migrates older checkout-local `.local` data when no stable configuration exists, retaining the old files. After migration, load the extension from the new folder once. After a Homebrew upgrade, rerun setup to update the generated bundle, then Reload it.

`--no-open` prepares files without opening apps. Noninteractive setup only opens apps when passed `--install`. Setup uses no Accessibility automation. A running browser may ignore profile-launch arguments; verify the selected profile yourself. If the extensions page does not open, enter `chrome://extensions/` in its address bar.

## Controller support

- **Gamepad preset:** use the website's own controls.
- **Navigation preset:** D-pad scrolls/moves focus; the south face button activates the focused element.
- **Standard controllers:** use the browser Gamepad API; compatibility depends on the controller, OS and browser.
- **PowerA FUSION Pro 2 (`20d6:4001`):** select the USB bridge in setup. Homebrew includes its binaries; setup installs a user launch agent and native-messaging registration. Existing shared PowerA services are reused. No administrator privileges are required. The reader runs on demand. Close competing controller readers if USB access fails. Steam/game configuration is not changed.

Arc and Dia have been used with the PowerA bridge locally. Other discovered Chromium browsers need end-to-end testing. Safari/Firefox extension support, native application mapping, rumble output, and automatic controller calibration are not included.

## Developer SDK

The SDK does not require the CLI for controllers already recognized by the browser. Install the release from GitHub (not published to npm):

```sh
npm install github:simonstoryparker/padkit#v0.5.0
```

Already handling controller input? Declare ownership so the extension yields:

```js
import { claimControllerSupport } from '@simonstoryparker/padkit';
const cleanup = claimControllerSupport();
// Keep your existing controller implementation; call cleanup() on unmount.
```

For a new integration:

```js
import { createController } from '@simonstoryparker/padkit';
const input = createController({
  onFrame(pads) { /* normalized axes/buttons; pads[i].raw is the native Gamepad */ },
  bindings: { confirm: 0 }, // optional
  onAction({ action, phase }) { /* press / release */ }
});
// On unmount:
input.dispose();
```

One shared polling loop handles focus loss, disconnects and page lifecycle. Identical callback references/options share a reference-counted subscription; different callbacks subscribe independently. Types are included. See [SDK examples](examples/integration.ts) and [developer details](docs/development.md).

## Troubleshooting

- Extension shows an old error: Reload Padkit and refresh the site; clear the old error log.
- No controller in a game: confirm the game’s exact subdomain is enabled and run `padkit doctor`.
- PowerA service missing: run `padkit native-install` (source users need Apple Command Line Tools).
- Folder picker: **⌘⇧G**, then paste the path copied by setup.
- Setup confirmation times out: installation can still be completed manually. Confirmation checks extension loading, not physical input or browser-profile identity.

See [installation and removal](docs/installation.md). Licensed under [MIT](LICENSE).
