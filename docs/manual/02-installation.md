# Installation

Unzip the package anywhere you like (for example `Documents/ReelForge`). Avoid folders synced by OneDrive
or iCloud for faster renders.

## Windows 10 / 11

1. Install **Node.js 22 LTS** from <https://nodejs.org> (keep the default options). If it is missing, the
   installer can install it for you with `winget`.
2. Double-click **`install.bat`**. It will:
   - check Node.js,
   - offer to install **ffmpeg** with `winget` (answer **Y**),
   - install ReelForge's dependencies,
   - download the pinned Chromium browser used for rendering,
   - run a full environment check.
3. Double-click **`start.bat`** to open the dashboard.

> If Windows SmartScreen warns about the script, choose **More info → Run anyway**. If ffmpeg was just
> installed, close and reopen `start.bat` so Windows picks up the new PATH.

## macOS

1. Install **Node.js 22 LTS** from <https://nodejs.org> and **Homebrew** from <https://brew.sh>.
2. Open **Terminal** in the ReelForge folder (Finder → right-click the folder → _New Terminal at Folder_) and run:

   ```bash
   ./install.sh
   ```

   Answer **Y** when it offers `brew install ffmpeg`.

3. Double-click **`ReelForge.command`** (or run `./start.sh`) to open the dashboard.

## Linux

```bash
./install.sh          # add --yes to accept every prompt
./start.sh            # opens the dashboard
```

The installer uses your package manager (`apt`, `dnf`, `pacman` or `zypper`) for ffmpeg and can install
Chromium's system libraries (it asks for `sudo`).

## Check your setup at any time

```bash
reelforge doctor          # Windows: reelforge.cmd doctor
```

It checks Node.js, ffmpeg (version, encoders and filters), Chromium and the bundled fonts, and prints the
exact fix for anything missing. The dashboard shows the same check as the status pill in the top bar.

![reelforge doctor](assets/20-cli-doctor.png)

## Updating

Download the new version from your CodeCanyon **Downloads** page, unzip it next to the old one, copy your
`episodes/` folder (and any custom `themes/` or `presets/`) into the new folder, then run the installer
again. Your episodes are plain files: nothing else needs migrating.

## Uninstalling

Delete the ReelForge folder. The Chromium download lives in your user cache folder
(`%LOCALAPPDATA%\ms-playwright` on Windows, `~/Library/Caches/ms-playwright` on macOS,
`~/.cache/ms-playwright` on Linux) and can be deleted too.
