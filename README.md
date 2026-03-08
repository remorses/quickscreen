# quickscreen

CLI to arrange windows into layouts and record the screen on macOS. Uses ffmpeg + AVFoundation under the hood.

Define layouts as objects with percentage-based sizing, then run one command to arrange your windows and start recording. Press Ctrl+C to stop — the recording is saved and revealed in Finder.

```bash
npx quickscreen split
```

## Install

```bash
npm i -g quickscreen
```

Requires macOS and ffmpeg (`brew install ffmpeg`).

## Usage

```bash
# Arrange Chrome left + Alacritty right, start recording
quickscreen split

# Center terminal on secondary display, start recording
quickscreen center

# Record without microphone audio
quickscreen split --no-audio

# List available layouts
quickscreen --list
```

## Built-in layouts

**split** — Two windows side by side on main display (16:9 aspect ratio recording area)

**center** — Single window centered on secondary display (fullscreen recording)

## How it works

1. Detects screens via NSScreen (JXA)
2. Moves windows into position via AppleScript (with AXEnhancedUserInterface workaround for apps like Alacritty)
3. Spawns ffmpeg with AVFoundation to capture the screen region + default system microphone
4. Ctrl+C sends `q` to ffmpeg for clean shutdown, then reveals the `.mov` file in Finder
