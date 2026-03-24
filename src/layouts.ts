export type WindowPosition =
  | 'center'
  | 'left'
  | 'right'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'right-top'
  | 'right-bottom'

export interface WindowSlot {
  /** Application name as it appears in macOS (e.g. "Google Chrome", "Alacritty") */
  app: string
  /** Where to place the window on screen */
  position: WindowPosition
}

export interface Layout {
  /** Layout name used as the CLI argument */
  name: string
  /** Display index: 0 = main/primary, 1 = secondary, etc. */
  screen: number
  /** Whether to record microphone audio (uses system default input device) */
  audio: boolean
  /** Windows to arrange */
  windows: WindowSlot[]
  /** Padding as percentages of screen dimensions */
  padding: {
    /** Left/right edge padding as fraction of screen width (e.g. 0.05 = 5%) */
    edge: number
    /** Gap between windows as fraction of screen width */
    gap: number
    /** Top padding as fraction of screen height */
    top: number
    /** Bottom padding as fraction of screen height */
    bottom: number
  }
  /** Horizontal alignment of the layout area on screen (default: 'center') */
  align?: 'left' | 'center' | 'right'
  /** What area to record */
  recording: {
    /** 'fullscreen' records the entire display, 'windows' crops to the arranged window area */
    area: 'fullscreen' | 'windows'
    /** Constrain the layout to an aspect ratio before placing windows (e.g. 16/9) */
    aspectRatio?: number
  }
}

/**
 * Built-in layouts.
 * These match the original Hammerspoon layouts:
 * - "split": Chrome on left + terminal on right, 16:9 aspect ratio on main display
 * - "center": Terminal centered on secondary display, fullscreen recording
 */
export const defaultLayouts: Layout[] = [
  {
    name: 'split',
    screen: 0,
    audio: true,
    windows: [
      { app: 'Google Chrome', position: 'left' },
      { app: 'Alacritty', position: 'right' },
    ],
    align: 'left',
    padding: { edge: 0.035, gap: 0.023, top: 0.083, bottom: 0.083 },
    recording: { area: 'windows', aspectRatio: 16 / 9 },
  },
  {
    name: 'center',
    screen: 1,
    audio: true,
    windows: [{ app: 'Alacritty', position: 'center' }],
    padding: { edge: 0.10, gap: 0, top: 0.10, bottom: 0.10 },
    recording: { area: 'fullscreen' },
  },
]

export interface ResolveLayoutOptions {
  screen?: number
  audio?: boolean
  align?: 'left' | 'center' | 'right'
  aspectRatio?: number
  recording?: 'fullscreen' | 'windows'
}

/**
 * Build a Layout dynamically from a list of app names.
 * The number of apps determines the arrangement:
 *   1 app  → fullscreen centered
 *   2 apps → side-by-side split
 *   3 apps → 1 left (full height) + 2 right (stacked)
 *   4 apps → 2×2 grid
 */
export function resolveLayout(apps: string[], options: ResolveLayoutOptions = {}): Layout {
  const count = apps.length
  if (count === 0) {
    throw new Error('At least one app name is required')
  }
  if (count > 4) {
    throw new Error(`Maximum 4 apps supported, got ${count}`)
  }

  const screen = options.screen ?? 0
  const audio = options.audio ?? true

  if (count === 1) {
    return {
      name: `auto-${count}`,
      screen,
      audio,
      windows: [{ app: apps[0], position: 'center' }],
      padding: { edge: 0.10, gap: 0, top: 0.10, bottom: 0.10 },
      recording: {
        area: options.recording ?? 'fullscreen',
      },
    }
  }

  if (count === 2) {
    return {
      name: `auto-${count}`,
      screen,
      audio,
      align: options.align ?? 'left',
      windows: [
        { app: apps[0], position: 'left' },
        { app: apps[1], position: 'right' },
      ],
      padding: { edge: 0.035, gap: 0.023, top: 0.083, bottom: 0.083 },
      recording: {
        area: options.recording ?? 'windows',
        aspectRatio: options.aspectRatio ?? 16 / 9,
      },
    }
  }

  if (count === 3) {
    return {
      name: `auto-${count}`,
      screen,
      audio,
      align: options.align ?? 'left',
      windows: [
        { app: apps[0], position: 'left' },
        { app: apps[1], position: 'right-top' },
        { app: apps[2], position: 'right-bottom' },
      ],
      padding: { edge: 0.02, gap: 0.015, top: 0.04, bottom: 0.04 },
      recording: {
        area: options.recording ?? 'windows',
        aspectRatio: options.aspectRatio ?? 16 / 9,
      },
    }
  }

  // count === 4: 2×2 grid
  return {
    name: `auto-${count}`,
    screen,
    audio,
    align: options.align ?? 'left',
    windows: [
      { app: apps[0], position: 'top-left' },
      { app: apps[1], position: 'top-right' },
      { app: apps[2], position: 'bottom-left' },
      { app: apps[3], position: 'bottom-right' },
    ],
    padding: { edge: 0.02, gap: 0.015, top: 0.04, bottom: 0.04 },
    recording: {
      area: options.recording ?? 'windows',
      aspectRatio: options.aspectRatio ?? 16 / 9,
    },
  }
}
