# Installation & Setup

Padkit provides third-party USB Xbox controller support (such as PowerA controllers) for macOS in Chromium-based browsers. It consists of:

1. **CLI (`padkit`)**: Discovers installed browsers, manages target origins, compiles profile-specific unpacked extensions, and provisions the native bridge.
2. **Chromium Extension**: Injects gamepad shims or navigation controls into configured origins.
3. **macOS Native Service**: An on-demand launchd daemon and native messaging host bridging USB controller packets to Chromium.
4. **JavaScript / TypeScript SDK**: An optional client library for web apps and games to claim input control and consume normalized controller state.

---

## Prerequisites

- **Operating System**: macOS (tested on macOS 13+)
- **Runtime**: Node.js 20 or newer
- **Browser**: Any supported Chromium-based browser:
  - Google Chrome / Chrome Beta / Chrome Canary
  - Arc
  - Dia
  - Brave Browser
  - Microsoft Edge
  - Vivaldi
  - Chromium
  - Opera / Opera GX

> [!NOTE]
> Safari and Firefox are not supported by the extension because they do not support the required Chromium extension APIs and native messaging host architecture.

---

## Installation

### Via Homebrew (Recommended)

Install Padkit through the official tap:

```sh
brew install simonstoryparker/tap/padkit
```

This installs Node dependencies, the `padkit` CLI binary, extension source templates, and precompiled macOS native binaries.

### From Source

Clone the repository and build the native components (Padkit has zero external npm dependencies, using Node.js's built-in test runner):

```sh
git clone https://github.com/simonstoryparker/padkit.git
cd padkit
npm test
sh native/build.sh
python3 native/tests/test-native.py
npm link # makes the `padkit` command available globally in your shell
```

If you prefer not to link globally, you can execute the CLI entrypoint directly: `node packages/cli/index.js <command>`.

---

## Initial Configuration (`padkit setup`)

Run interactive setup to configure your browser, profile, and target sites:

```sh
padkit setup
```

The interactive prompt walks through:
1. **Browser Selection**: Detects installed Chromium browsers in `/Applications`, `~/Applications`, and `/System/Applications`.
2. **Profile Selection**: Lists profiles (e.g., `Default`, `Profile 1`) associated with that browser.
3. **Control Preset**:
   - `gamepad`: Passes standard controller inputs directly to web apps (for games, emulators, robotics sims).
   - `navigation`: Translates D-pad and stick inputs into page scrolling, tab focus, and enter/click actions.
4. **PowerA USB Bridge**:
   - `true`: Installs and enables the macOS native background service for third-party USB controllers.
   - `false`: Uses standard browser-recognized gamepads only.
5. **Target Site Origin**: The initial domain or URL to allow (e.g., `https://rebuilt.frsim.com`).

### Non-Interactive / Scripted Setup

You can bypass interactive prompts by passing CLI arguments:

```sh
padkit setup \
  --browser chrome \
  --profile Default \
  --site https://rebuilt.frsim.com \
  --preset gamepad \
  --powera \
  --install
```

#### Setup Flags

| Flag | Values | Description |
|---|---|---|
| `--browser` | `chrome`, `dia`, `arc`, `brave`, `edge`, `vivaldi`, `chromium`, `opera`, `opera-gx` | Target browser identifier. |
| `--profile` | `Default`, `Profile 1`, etc. | Browser profile directory name. |
| `--site` | URL or domain | Origin allowed to receive gamepad inputs. |
| `--preset` | `gamepad` \| `navigation` | Controller interaction mode. |
| `--powera` | *(flag)* | Installs and enables the PowerA USB native daemon. |
| `--no-powera` | *(flag)* | Disables the native USB bridge. |
| `--install` | *(flag)* | Attempts guided installation with clipboard copy and browser opening. |
| `--no-open` | *(flag)* | Suppresses opening the browser's extensions page. |

---

## Loading the Extension into Chromium

Each configured browser profile has its own unpacked extension directory generated under:

```
~/Library/Application Support/Padkit/<browser>-<profile>/extension
```

*(Note: Profile directory names with spaces are preserved verbatim, e.g. `~/Library/Application Support/Padkit/chrome-Profile 1/extension`—quote the path when referencing it in a shell).*

During guided setup (`padkit setup`), Padkit automatically copies this path to your macOS clipboard and opens `chrome://extensions/`.

To load or reload manually:

1. Open your browser in the selected profile.
2. Navigate to `chrome://extensions/`.
3. Toggle on **Developer mode** in the top-right corner.
4. Click **Load unpacked**.
5. Press `Cmd + Shift + G` in the file picker, press `Cmd + V` to paste the extension path, press `Enter`, and click **Select**.
6. When updating sites or settings in an existing profile, do not re-add the extension—simply click the **Reload** (circular arrow) icon on the Padkit extension card.

> [!IMPORTANT]
> If you previously installed a legacy standalone PowerA extension with ID `ocbijffibhfpjbgpdahfklpgflkinhio`, disable or remove it before enabling Padkit to avoid native messaging conflicts.

---

## Managing Sites

One extension bundle handles all enabled sites for a profile. You do not need to create multiple extensions for different websites.

### Adding a Site

```sh
padkit add https://example.com --browser chrome --profile Default
```

*Note: Bare domains (e.g. `example.com`) are automatically normalized to HTTPS origin (`https://example.com`).*

### Removing a Site

```sh
padkit remove https://example.com --browser chrome --profile Default
```

After adding or removing sites, reload the Padkit extension in `chrome://extensions/` and refresh any active tabs.

---

## Status and Diagnostics

### Check Configured Targets

Inspect the current configuration JSON:

```sh
padkit status
```

Output displays all profile targets, their enabled site origins, presets, and PowerA toggle status.

### Discover Installed Browsers

List detected browsers and available user profiles:

```sh
padkit browsers
```

### Run System Health Check

Verify background services, sockets, and native host registrations:

```sh
padkit doctor
```

`padkit doctor` checks:
- Node.js version and platform.
- Presence of Unix domain socket (`~/Library/Application Support/PowerA Adapters/input.sock`).
- Native messaging executable (`PowerABrowserHost`).
- Chromium Native Messaging Host JSON manifests.
- Active targets and site counts.

### Reinstall Native Daemon

If the native background daemon is missing or unresponsive:

```sh
padkit native-install
```

---

## File Locations & Architecture

| Component | Path | Description |
|---|---|---|
| **Configuration** | `~/Library/Application Support/Padkit/config.json` | Stores profiles, presets, and origin whitelist. Override with `$PADKIT_HOME`. |
| **Generated Extensions** | `~/Library/Application Support/Padkit/<browser>-<profile>/extension/` | Unpacked Chromium extension bundle for each profile. |
| **Bridge Socket & Daemons** | `~/Library/Application Support/PowerA Adapters/` | Contains `PowerAInput` (USB daemon), `PowerABrowserHost` (stdio bridge), and `input.sock`. |
| **Launchd Job** | `~/Library/LaunchAgents/local.powera.input.plist` | Per-user on-demand service managed by launchd. |
| **Native Messaging Hosts** | `~/Library/Application Support/<BrowserFolder>/NativeMessagingHosts/local.powera.browser.json` | Registers the native host binary with supported Chromium browsers (e.g. `Google/Chrome`, `Arc/User Data`, `Dia/User Data`, `BraveSoftware/Brave-Browser`, `Microsoft Edge`, `Vivaldi`, `Chromium`). |

---

## Uninstallation & Removal

### Step 1: Remove Target Profile Configuration

Remove a specific browser profile's generated extension and configuration:

```sh
padkit uninstall --browser chrome --profile Default
```

Then remove the extension card from `chrome://extensions/` in that browser profile.

### Step 2: Remove CLI and Application Files

If installed with Homebrew:

```sh
brew uninstall padkit
```

To purge Padkit configuration files and generated extensions:

```sh
rm -rf "$HOME/Library/Application Support/Padkit"
```

### Step 3: Remove Shared PowerA Native Bridge (Optional)

If no other applications require the shared PowerA USB bridge service:

1. Stop and remove the launchd agent:
   ```sh
   launchctl bootout "gui/$(id -u)/local.powera.input"
   rm -f "$HOME/Library/LaunchAgents/local.powera.input.plist"
   ```

2. Remove Native Messaging Host manifests from browsers:
   ```sh
   rm -f "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/local.powera.browser.json"
   rm -f "$HOME/Library/Application Support/Arc/User Data/NativeMessagingHosts/local.powera.browser.json"
   rm -f "$HOME/Library/Application Support/Dia/User Data/NativeMessagingHosts/local.powera.browser.json"
   rm -f "$HOME/Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts/local.powera.browser.json"
   rm -f "$HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts/local.powera.browser.json"
   rm -f "$HOME/Library/Application Support/Vivaldi/NativeMessagingHosts/local.powera.browser.json"
   rm -f "$HOME/Library/Application Support/Chromium/NativeMessagingHosts/local.powera.browser.json"
   ```

3. Remove the native host binaries:
   ```sh
   rm -rf "$HOME/Library/Application Support/PowerA Adapters"
   ```
