# Installation details

Homebrew installs Node, the CLI, extension sources and locally built macOS native binaries. It does not start a background service during `brew install`. Selecting PowerA in setup (or `padkit native-install`) creates the per-user service. Registration preserves existing installations; conflicting registrations are reported instead of overwritten.

The shared native backend retains the compatibility directory `~/Library/Application Support/PowerA Adapters`, label `local.powera.input`, and host name `local.powera.browser`. This lets older local consumers keep working. Its private Unix socket is created by launchd. Browser native-host registrations allow only the stable Padkit extension ID.

Setup confirmation briefly listens on `127.0.0.1` with a random one-use URL and extension-origin check. Generated bundles receive a loopback host permission for confirmation. The listener closes after receipt, timeout or cancellation. No TCP server runs during normal controller use.

## Removal

`padkit uninstall --browser dia --profile 'Profile 4'` removes that profile's generated configuration. Remove its extension card in the browser as well. `brew uninstall padkit` removes the CLI; user settings and shared PowerA services are retained.

To remove a shared PowerA service, first ensure no other application relies on it. Run `launchctl bootout gui/$(id -u)/local.powera.input`, then remove `~/Library/LaunchAgents/local.powera.input.plist`. Remove only the `local.powera.browser.json` registrations under browser `NativeMessagingHosts` directories. The compatibility directory may contain adapters belonging to older applications; do not delete it wholesale.

## Source development

```sh
git clone https://github.com/simonstoryparker/padkit.git
cd padkit
npm test
sh native/build.sh
python3 native/tests/test-native.py
node packages/cli/index.js setup
```

No npm dependencies are needed for the CLI or SDK. Native compilation requires macOS Command Line Tools. Native tests use a temporary Unix socket; installer tests use a temporary localhost listener. Neither installs a service. For isolated CLI tests set `PADKIT_HOME` to a temporary directory.
