# The dashboard

`reelforge studio` (or `start.bat` / `start.sh`) opens the dashboard at `http://127.0.0.1:4310`. It lists
**your episodes** (the `episodes/` folder) and the **examples**.

![Dashboard](assets/00-dashboard.jpg)

Each card shows a live thumbnail, the series, preset, number of lines and scenes, the duration, and status
chips:

| Chip                                    | Meaning                                                 |
| --------------------------------------- | ------------------------------------------------------- |
| `voice 1:15` / `no voice`               | Whether a recording is present, and its length          |
| `cues 24/24` / `draft cues` / `no cues` | How many sentences are marked; draft cues are estimates |
| `valid` / `2 warnings` / `1 error`      | Result of the static checks (hover an error to read it) |

| Button           | What it does                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Upload voice** | Choose a recording; it is converted to `voice.wav` (48 kHz)                                                        |
| **Open editor**  | Opens the visual editor for this episode in a new tab (see [The editor](#the-editor))                              |
| **Mark cues**    | Opens the editor in Cues mode, ready to mark when each sentence starts                                             |
| **Validate**     | Runs every check, including the headless text-overflow and caption checks                                          |
| **Render**       | Choose the platform preset, share size, SFX and speed; progress, FPS and ETA appear live; **Cancel** stops cleanly |
| **Folder**       | Opens the episode folder in your file manager                                                                      |
| **Draft cues**   | (only without cues) estimates timing from the text                                                                 |

![Validation results](assets/23-dashboard-validate.jpg)

![Render options](assets/24-dashboard-render-options.jpg)

![Live render progress](assets/25-dashboard-render-progress.jpg)

Finished outputs appear as links on the card: videos open in a player with a **Download** button.
![Built-in player](assets/26-dashboard-player.jpg)

Only one render runs at a time. The dashboard only listens on `127.0.0.1`: it is not reachable from other
computers.
