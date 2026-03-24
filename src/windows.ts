import { spawn, type ChildProcess } from 'child_process'

/**
 * Run an osascript command (AppleScript or JXA) and return stdout.
 * Rejects on non-zero exit or stderr.
 */
function osascript(script: string, lang: 'AppleScript' | 'JavaScript' = 'AppleScript'): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = lang === 'JavaScript' ? ['-l', 'JavaScript', '-e', script] : ['-e', script]
    const proc = spawn('osascript', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (d) => (stdout += d))
    proc.stderr.on('data', (d) => (stderr += d))
    proc.on('close', (code) => {
      if (code !== 0) reject(new Error(`osascript exited ${code}: ${stderr.trim()}`))
      else resolve(stdout.trim())
    })
  })
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface ScreenInfo {
  index: number
  x: number
  y: number
  w: number
  h: number
  isMain: boolean
}

/**
 * Get all connected screens with their geometry using JXA + NSScreen.
 * Returns an array sorted by screen index, with coordinates matching
 * what AVFoundation and ffmpeg expect.
 */
export async function getScreens(): Promise<ScreenInfo[]> {
  // JXA script that reads NSScreen frames
  // NSScreen coordinate system has origin at bottom-left, but we need top-left origin
  // for ffmpeg crop coordinates. The main screen's origin is always (0,0) in both systems
  // but y-axis is flipped. We convert here.
  const jxa = `
    ObjC.import('AppKit');
    const screens = $.NSScreen.screens;
    const mainFrame = screens.objectAtIndex(0).frame;
    const mainH = mainFrame.size.height;
    const result = [];
    for (let i = 0; i < screens.count; i++) {
      const s = screens.objectAtIndex(i);
      const f = s.frame;
      const vf = s.visibleFrame;
      // Convert from bottom-left origin to top-left origin
      const y = mainH - f.origin.y - f.size.height;
      result.push({
        index: i,
        x: f.origin.x,
        y: y,
        w: f.size.width,
        h: f.size.height,
        isMain: i === 0,
      });
    }
    JSON.stringify(result);
  `
  const out = await osascript(jxa, 'JavaScript')
  return JSON.parse(out) as ScreenInfo[]
}

/**
 * Set a window's position and size using AppleScript.
 * Handles the AXEnhancedUserInterface workaround for apps like Alacritty
 * that resist frame changes.
 */
export async function setWindowFrame(appName: string, frame: Rect, windowIndex = 0): Promise<void> {
  // JXA approach with AXEnhancedUserInterface workaround (needed for Alacritty etc.)
  // windowIndex selects which window of the app to target (0 = frontmost, 1 = second, etc.)
  // This allows placing multiple windows of the same app in different positions.
  const jxa = `
    ObjC.import('AppKit');
    ObjC.import('ApplicationServices');

    const app = Application("${appName}");
    app.includeStandardAdditions = true;

    // Get the process
    const sysEvents = Application("System Events");
    const proc = sysEvents.processes.whose({name: {_contains: "${appName}"}})[0];
    const winIdx = ${windowIndex};

    if (proc) {
      const winCount = proc.windows.length;
      if (winIdx >= winCount) {
        throw new Error("Window index " + winIdx + " out of range (app has " + winCount + " windows)");
      }
      try {
        // Try to get and toggle AXEnhancedUserInterface
        const axApp = proc.attributes.byName("AXEnhancedUserInterface");
        const wasEnhanced = axApp.value();
        if (wasEnhanced) {
          axApp.value = false;
        }

        // Set position and size
        const win = proc.windows[winIdx];
        win.position = [${Math.round(frame.x)}, ${Math.round(frame.y)}];
        win.size = [${Math.round(frame.w)}, ${Math.round(frame.h)}];

        // Restore AXEnhancedUserInterface
        if (wasEnhanced) {
          delay(0.1);
          axApp.value = true;
        }
      } catch(e) {
        // Fallback: set without AX workaround
        const win = proc.windows[winIdx];
        win.position = [${Math.round(frame.x)}, ${Math.round(frame.y)}];
        win.size = [${Math.round(frame.w)}, ${Math.round(frame.h)}];
      }
    }
  `
  await osascript(jxa, 'JavaScript')
}

/**
 * Get the number of windows an application currently has open.
 */
export async function getWindowCount(appName: string): Promise<number> {
  try {
    const result = await osascript(`
      ObjC.import('AppKit');
      const sysEvents = Application("System Events");
      const proc = sysEvents.processes.whose({name: {_contains: "${appName}"}})[0];
      proc ? proc.windows.length : 0;
    `, 'JavaScript')
    return parseInt(result, 10) || 0
  } catch {
    return 0
  }
}

/**
 * Activate (bring to front) an application.
 */
export async function activateApp(appName: string): Promise<void> {
  await osascript(`tell application "${appName}" to activate`)
}

/**
 * Launch an application if not running, or activate it if already running.
 */
export async function launchApp(appName: string): Promise<void> {
  await osascript(`
    tell application "${appName}"
      activate
    end tell
  `)
}

/**
 * Check if an application is currently running.
 */
export async function isAppRunning(appName: string): Promise<boolean> {
  const result = await osascript(`
    tell application "System Events"
      set appRunning to (name of every process) contains "${appName}"
    end tell
    return appRunning
  `)
  return result === 'true'
}

/**
 * Show a macOS notification.
 */
export async function showNotification(message: string): Promise<void> {
  await osascript(`display notification "${message}" with title "quickscreen"`)
}

/**
 * Show a colored border overlay around a screen rect to indicate the recording area.
 * Creates 4 thin NSWindow panels (top/bottom/left/right) that form a border.
 * The windows are transparent to clicks, always on top, and don't appear in recordings
 * because they sit at a window level above what AVFoundation captures.
 *
 * Returns the osascript child process — kill it to dismiss the overlay.
 *
 * Coordinate conversion: our Rect uses top-left origin (matching ffmpeg/AVFoundation),
 * but NSWindow uses bottom-left origin. We convert using the main screen height.
 */
export function showRecordingOverlay(rect: Rect, screenHeight: number): ChildProcess {
  // Convert from top-left origin to NSWindow bottom-left origin
  const nsX = rect.x
  const nsY = screenHeight - rect.y - rect.h
  const w = rect.w
  const h = rect.h
  const border = 3 // border thickness in points

  // JXA script that creates 4 border windows and keeps them alive via NSRunLoop.
  // Key details for visibility:
  //   - NSApplication activationPolicy must be Accessory so the process can show windows
  //   - NSPanel.hidesOnDeactivate must be false (panels auto-hide when app is inactive by default)
  //   - Use real ObjC constants ($.NSScreenSaverWindowLevel etc.) instead of hardcoded integers
  const jxa = `
    ObjC.import('AppKit');

    const app = $.NSApplication.sharedApplication;
    app.setActivationPolicy($.NSApplicationActivationPolicyAccessory);

    const border = ${border};
    const panels = [];
    // [x, y, w, h] for each edge — in NSWindow (bottom-left) coordinates
    const edges = [
      [${nsX}, ${nsY + h - border}, ${w}, ${border}],           // top
      [${nsX}, ${nsY}, ${w}, ${border}],                         // bottom
      [${nsX}, ${nsY}, ${border}, ${h}],                         // left
      [${nsX + w - border}, ${nsY}, ${border}, ${h}],            // right
    ];

    for (const [ex, ey, ew, eh] of edges) {
      const frame = $.NSMakeRect(ex, ey, ew, eh);
      const panel = $.NSPanel.alloc.initWithContentRectStyleMaskBackingDefer(
        frame,
        0,  // NSBorderlessWindowMask
        $.NSBackingStoreBuffered,
        false
      );
      panel.setLevel($.NSScreenSaverWindowLevel + 1);
      panel.setOpaque(false);
      panel.setAlphaValue(0.85);
      panel.setBackgroundColor($.NSColor.colorWithRedGreenBlueAlpha(1.0, 0.2, 0.2, 1.0));
      panel.setIgnoresMouseEvents(true);
      panel.setHasShadow(false);
      panel.setHidesOnDeactivate(false);
      panel.setCollectionBehavior(
        $.NSWindowCollectionBehaviorCanJoinAllSpaces |
        $.NSWindowCollectionBehaviorFullScreenAuxiliary
      );
      panel.orderFrontRegardless;
      panels.push(panel);
    }

    // Keep the process alive — NSRunLoop keeps windows visible
    $.NSRunLoop.currentRunLoop.run;
  `

  const proc = spawn('osascript', ['-l', 'JavaScript', '-e', jxa], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  })

  // Log errors so we can debug overlay issues
  let stderr = ''
  proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString() })
  proc.stdout?.on('data', (d: Buffer) => { stderr += d.toString() })
  proc.on('close', (code) => {
    if (code !== null && code !== 0 && code !== 15) { // 15 = SIGTERM (expected on hide)
      console.error(`Recording overlay error (exit ${code}): ${stderr.trim()}`)
    }
  })

  return proc
}

/**
 * Dismiss the recording overlay by killing its osascript process.
 */
export function hideRecordingOverlay(proc: ChildProcess): void {
  if (proc.exitCode === null) {
    proc.kill('SIGTERM')
  }
}

/**
 * Resolve a shorthand app name to the full macOS application name.
 * Checks running processes first for a case-insensitive substring match,
 * then falls back to the literal input.
 *
 * Examples:
 *   "chrome"    → "Google Chrome"
 *   "alacritty" → "Alacritty"
 *   "finder"    → "Finder"
 */
export async function resolveAppName(input: string): Promise<string> {
  try {
    const result = await osascript(`
      tell application "System Events"
        set appNames to name of every process whose background only is false
      end tell
      set AppleScript's text item delimiters to "||"
      return appNames as text
    `)
    const runningApps = result.split('||').map((s) => s.trim()).filter(Boolean)
    const lower = input.toLowerCase()

    // Exact match (case-insensitive)
    const exact = runningApps.find((a) => a.toLowerCase() === lower)
    if (exact) return exact

    // Substring match (e.g. "chrome" matches "Google Chrome")
    const substring = runningApps.find((a) => a.toLowerCase().includes(lower))
    if (substring) return substring

    // No match found — return input as-is (the app may not be running yet)
    return input
  } catch {
    return input
  }
}
