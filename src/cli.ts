#!/usr/bin/env node
import { goke } from 'goke'
import { z } from 'zod'
import { defaultLayouts, resolveLayout } from './layouts.js'
import {
  getScreenName,
  generateOutputPath,
  startRecording,
  stopRecording,
  revealInFinder,
  calculateLayoutGeometry,
} from './recorder.js'
import {
  getScreens,
  setWindowFrame,
  launchApp,
  activateApp,
  isAppRunning,
  resolveAppName,
  getWindowCount,
  showRecordingOverlay,
  hideRecordingOverlay,
} from './windows.js'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const pkg = require('../package.json') as { version: string }

const cli = goke('quickscreen')

cli
  .command('[...apps]', `Arrange windows and record the screen. Press Ctrl+C to stop and save.

Pass app names to auto-arrange them:
  quickscreen "Google Chrome" Alacritty     # 2 apps → side-by-side
  quickscreen Alacritty                      # 1 app  → fullscreen
  quickscreen Chrome Alacritty Finder        # 3 apps → 1 left + 2 right

Or use a built-in layout: ${defaultLayouts.map((l) => l.name).join(', ')}
  quickscreen split                          # Chrome left, Alacritty right`)
  .option('--output [dir]', z.string().describe('Output directory for recordings (default: ~/Desktop)'))
  .option('--no-audio', 'Disable microphone recording')
  .option('--crf [crf]', z.number().default(18).describe('Video quality, lower is better'))
  .option('--screen [index]', z.number().default(0).describe('Display index (0 = main, 1 = secondary)'))
  .option('--align [align]', z.enum(['left', 'center', 'right']).describe('Horizontal alignment (default: left)'))
  .option('--aspect-ratio [ratio]', z.number().describe('Constrain to aspect ratio (e.g. 1.77 for 16:9)'))
  .option('--recording [area]', z.enum(['fullscreen', 'windows']).describe('What area to record'))
  .option('--list', 'List available layouts and exit')
  .example('# Two apps side by side')
  .example('quickscreen "Google Chrome" Alacritty')
  .example('# Single app fullscreen')
  .example('quickscreen Alacritty')
  .example('# Three apps: 1 left + 2 stacked right')
  .example('quickscreen Chrome Alacritty Finder')
  .example('# Use a built-in layout')
  .example('quickscreen split')
  .example('# Record on secondary display without audio')
  .example('quickscreen Alacritty --screen 1 --no-audio')
  .example('# List built-in layouts')
  .example('quickscreen --list')
  .action(async (apps, options) => {
    // List layouts
    if (options.list || apps.length === 0) {
      console.log('Available built-in layouts:\n')
      for (const layout of defaultLayouts) {
        const windows = layout.windows.map((w) => `${w.app} (${w.position})`).join(', ')
        console.log(`  ${layout.name}`)
        console.log(`    screen: ${layout.screen}, audio: ${layout.audio}`)
        console.log(`    windows: ${windows}`)
        console.log(`    recording: ${layout.recording.area}${layout.recording.aspectRatio ? ` (${layout.recording.aspectRatio}:1)` : ''}`)
        console.log()
      }
      console.log('Or pass app names directly: quickscreen "Google Chrome" Alacritty\n')
      return
    }

    // Check if the first (and only) arg matches a built-in layout name
    let layout
    const builtIn = apps.length === 1 ? defaultLayouts.find((l) => l.name === apps[0]) : undefined
    if (builtIn) {
      layout = { ...builtIn }
    } else {
      // Resolve app names to fuzzy-matched macOS app names
      const resolvedApps: string[] = []
      for (const app of apps) {
        const resolved = await resolveAppName(app)
        resolvedApps.push(resolved)
      }
      layout = resolveLayout(resolvedApps, {
        screen: options.screen,
        audio: options.audio !== false,
        align: options.align,
        aspectRatio: options.aspectRatio,
        recording: options.recording,
      })
    }

    // Override audio from flag
    const audio = options.audio !== false ? layout.audio : false

    // Get screen info
    console.log('Detecting screens...')
    const screens = await getScreens()
    if (layout.screen >= screens.length) {
      console.error(`Screen ${layout.screen} not found. Available screens: ${screens.length}`)
      for (const s of screens) {
        console.error(`  Screen ${s.index}: ${s.w}x${s.h} at (${s.x}, ${s.y})${s.isMain ? ' (main)' : ''}`)
      }
      process.exit(1)
    }
    const screen = screens[layout.screen]
    console.log(`Using screen ${screen.index}: ${screen.w}x${screen.h}${screen.isMain ? ' (main)' : ''}`)

    // Calculate layout geometry
    const { windowFrames, recordingRect } = calculateLayoutGeometry(
      screen,
      layout.padding,
      layout.windows.length,
      layout.recording,
      layout.align,
    )

    // Arrange windows
    // Frames are returned in the same order as layout.windows:
    //   1 window:  [center]
    //   2 windows: [left, right]
    //   3 windows: [left, right-top, right-bottom]
    //   4 windows: [top-left, top-right, bottom-left, bottom-right]
    // Per-app window index counter — supports multiple windows of the same app
    // (e.g. "Chrome Chrome" targets windows[0] and windows[1] of Chrome)
    const appWindowCounter = new Map<string, number>()
    console.log('Arranging windows...')
    for (let i = 0; i < layout.windows.length; i++) {
      const slot = layout.windows[i]
      const targetFrame = windowFrames[i]
      const winIdx = appWindowCounter.get(slot.app) ?? 0
      appWindowCounter.set(slot.app, winIdx + 1)

      // Launch app if not running
      const running = await isAppRunning(slot.app)
      if (!running) {
        console.log(`  Launching ${slot.app}...`)
        await launchApp(slot.app)
        await sleep(1000) // Wait for app to start
      }

      // Warn if the app doesn't have enough windows open
      if (winIdx > 0) {
        const count = await getWindowCount(slot.app)
        if (winIdx >= count) {
          console.warn(`  Warning: ${slot.app} has ${count} window(s) but need window #${winIdx + 1}. Open another window first.`)
          continue
        }
      }

      const label = winIdx > 0 ? `${slot.app} [window ${winIdx + 1}]` : slot.app
      console.log(`  Moving ${label} to ${slot.position} (${Math.round(targetFrame.w)}x${Math.round(targetFrame.h)})`)
      await setWindowFrame(slot.app, targetFrame, winIdx)
      await sleep(200) // Small delay between window operations
    }

    // Focus the last window
    const lastApp = layout.windows[layout.windows.length - 1]
    await activateApp(lastApp.app)

    // Wait for windows to settle
    await sleep(500)

    // Show recording area overlay (red border around the recording crop region).
    // The overlay sits above NSScreenSaverWindowLevel so AVFoundation doesn't capture it.
    // It stays visible for the entire recording and is dismissed on Ctrl+C / process exit.
    const overlayRect = recordingRect ?? screen
    const mainScreenH = screens[0].h
    const overlayProc = showRecordingOverlay(overlayRect, mainScreenH)

    // Start recording
    const outputPath = generateOutputPath(options.output)
    const screenName = getScreenName(screen.index)

    console.log(`Recording to: ${outputPath}`)
    console.log(`Audio: ${audio ? 'on (default mic)' : 'off'}`)
    console.log(`Press Ctrl+C to save, Ctrl+Z to discard\n`)

    const ffmpeg = startRecording({
      screenName,
      screenFrame: screen,
      crop: recordingRect,
      audio,
      outputPath,
      crf: options.crf,
    })

    // Log ffmpeg stderr for debugging
    ffmpeg.stderr?.on('data', (data: Buffer) => {
      const line = data.toString().trim()
      // Only show important lines, skip the verbose frame output
      if (line.startsWith('frame=') || line.startsWith('size=')) return
      if (line.includes('Error') || line.includes('error') || line.includes('Warning')) {
        console.error(`ffmpeg: ${line}`)
      }
    })

    // Handle ffmpeg exit (unexpected crash)
    ffmpeg.on('close', (code) => {
      if (code !== 0 && code !== 255) {
        console.error(`\nffmpeg exited with code ${code}`)
      }
    })

    // Ctrl+C: stop recording and save the file
    let stopping = false
    const save = async () => {
      if (stopping) return
      stopping = true

      console.log('\nStopping recording...')
      hideRecordingOverlay(overlayProc)
      await stopRecording(ffmpeg)

      // Wait a moment for file to be fully written
      await sleep(1000)

      console.log(`Saved: ${outputPath}`)
      revealInFinder(outputPath)

      // Give Finder a moment to open, then exit
      await sleep(500)
      process.exit(0)
    }

    // Ctrl+Z: discard recording and clean up
    const discard = async () => {
      if (stopping) return
      stopping = true

      console.log('\nDiscarding recording...')
      hideRecordingOverlay(overlayProc)
      ffmpeg.kill('SIGKILL')

      // Remove the partial file
      const { unlink } = await import('fs/promises')
      try { await unlink(outputPath) } catch {}

      console.log('Recording discarded.')
      process.exit(0)
    }

    process.on('SIGINT', save)
    process.on('SIGTERM', save)
    process.on('SIGTSTP', discard)

    // Keep the process alive while ffmpeg runs
    await new Promise<void>((resolve) => {
      ffmpeg.on('close', resolve)
    })
  })

cli.help()
cli.version(pkg.version)
cli.parse()

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
