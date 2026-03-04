# EchoGraph Installation Guide

## Cross-Platform Status

EchoGraph is built on Tauri with a React frontend, so the intended desktop target is:

* macOS
* Windows
* Linux

The current scaffold is cross-platform in architecture, but "cross-platform" in practice still depends on:

* testing the app on each OS,
* packaging installers for each OS,
* handling OS-specific signing and distribution requirements.

## Easiest Setup On macOS (Right Now)

Because the project is still in early development, the easiest way to run it today on a Mac is as a local development build.

### 1. Install Apple Command Line Tools

```bash
xcode-select --install
```

### 2. Install Homebrew (if you do not already have it)

Homebrew is the simplest way to install the toolchain on macOS.

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### 3. Install Node.js

```bash
brew install node
```

This project currently expects a modern Node version (Node.js 20+ is a good baseline).

### 4. Install Rust

Tauri requires Rust for the native shell.

```bash
brew install rustup-init
rustup-init -y
source "$HOME/.cargo/env"
rustup default stable
```

### 5. Install Project Dependencies

From the project folder:

```bash
npm install
```

### 6. Run The App

For the desktop app:

```bash
npm run tauri dev
```

For the browser-only frontend:

```bash
npm run dev
```

## Packaging For A Real Mac App

Once the app is more complete, you should package a native macOS build:

```bash
npm run tauri build
```

That will produce a packaged app build rather than a dev shell.

To make installation easy for non-technical users on macOS, the best path is:

* distribute a `.dmg` installer,
* sign the app with an Apple Developer certificate,
* notarize it with Apple,
* provide a drag-and-drop install flow into `Applications`.

Without signing and notarization, macOS will present friction through Gatekeeper warnings.

## What "Easy To Use" Should Mean For This App

If your goal is mainstream usability, do not expect users to install Node, Rust, or run terminal commands.

The easiest end-user experience is:

* user downloads a signed `.dmg`,
* opens it,
* drags EchoGraph into `Applications`,
* launches it like any normal Mac app,
* enters an OpenAI API key in a simple onboarding screen.

That should be your target release experience.

## Recommended Distribution Strategy

### During Development

Use:

```bash
npm run tauri dev
```

This is best for you while building features quickly.

### For Internal Testing

Use:

```bash
npm run tauri build
```

Share packaged builds with a small set of testers.

### For Public Release

Ship platform-specific installers:

* macOS: signed and notarized `.dmg`
* Windows: signed installer (`.msi` or `.exe`)
* Linux: AppImage, `.deb`, or `.rpm`

## Troubleshooting

### `npm install` fails

Check that Node.js is installed:

```bash
node -v
npm -v
```

### `npm run tauri dev` fails because Rust is missing

Check:

```bash
rustc -V
cargo -V
```

### `failed to open icon ... src-tauri/icons/icon.png`

Tauri expects a default app icon during compile time, even for local dev builds.

This repository now includes a placeholder icon at `src-tauri/icons/icon.png`. If that file is missing, restore it or add a PNG at that path before running:

```bash
npm run tauri dev
```

### macOS blocks the app

This usually means the app is unsigned or not notarized. That is expected during early local development, but you should fix it before distribution.
