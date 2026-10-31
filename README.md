# Padkit

Third-party USB Xbox controller support for macOS in Chromium browsers and web apps.

macOS does not natively support third-party USB Xbox controllers. Padkit bridges this gap with a guided CLI, a Chromium extension, a macOS USB bridge, and an optional JavaScript/TypeScript SDK.

Currently tested on PowerA controllers.

## Install

```sh
brew install simonstoryparker/tap/padkit
padkit setup
```

```sh
padkit add rebuilt.frsim.com --browser dia --profile 'Profile 4'
padkit remove example.com --browser dia --profile 'Profile 4'
padkit browsers
padkit status
padkit doctor
brew upgrade padkit
```

See [installation details](docs/installation.md) for manual loading, configuration paths, and removal.

## Developer SDK

Install the package directly from GitHub:

```sh
npm install github:simonstoryparker/padkit#v0.5.0
```

```js
import { claimControllerSupport, createController } from '@simonstoryparker/padkit';

// Tell Padkit to yield if your web app already handles controller input
const cleanup = claimControllerSupport();

// Or create a managed controller subscription
const controller = createController({
  onFrame(pads) { /* normalized axes and buttons */ },
  onAction({ action, phase }) { /* press / release */ }
});

// Clean up on unmount
controller.dispose();
cleanup();
```

See [SDK examples](examples/integration.ts) and [developer details](docs/development.md).

## Troubleshooting

- **No controller detected in game:** Verify the exact subdomain is enabled and run `padkit doctor`.
- **PowerA bridge service missing:** Run `padkit native-install` to reinstall the background service.
- **Stale extension state:** Reload the Padkit extension in your browser and refresh the page.

Licensed under [MIT](LICENSE).
