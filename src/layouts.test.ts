// Tests for resolveLayout() and calculateLayoutGeometry()
import { describe, test, expect } from 'bun:test'
import { resolveLayout } from './layouts.js'
import { calculateLayoutGeometry } from './recorder.js'
import type { ScreenInfo } from './windows.js'

const mockScreen: ScreenInfo = {
  index: 0,
  x: 0,
  y: 0,
  w: 1920,
  h: 1080,
  isMain: true,
}

describe('resolveLayout', () => {
  test('1 app → center fullscreen layout', () => {
    const layout = resolveLayout(['Alacritty'])
    expect(layout.windows).toMatchInlineSnapshot(`
[
  {
    "app": "Alacritty",
    "position": "center",
  },
]
`)
    expect(layout.recording.area).toBe('fullscreen')
  })

  test('2 apps → side-by-side split', () => {
    const layout = resolveLayout(['Google Chrome', 'Alacritty'])
    expect(layout.windows).toMatchInlineSnapshot(`
[
  {
    "app": "Google Chrome",
    "position": "left",
  },
  {
    "app": "Alacritty",
    "position": "right",
  },
]
`)
    expect(layout.recording.area).toBe('windows')
    expect(layout.recording.aspectRatio).toBeCloseTo(16 / 9)
  })

  test('3 apps → 1 left + 2 right stacked', () => {
    const layout = resolveLayout(['Chrome', 'Alacritty', 'Finder'])
    expect(layout.windows).toMatchInlineSnapshot(`
[
  {
    "app": "Chrome",
    "position": "left",
  },
  {
    "app": "Alacritty",
    "position": "right-top",
  },
  {
    "app": "Finder",
    "position": "right-bottom",
  },
]
`)
  })

  test('4 apps → 2x2 grid', () => {
    const layout = resolveLayout(['A', 'B', 'C', 'D'])
    expect(layout.windows.map((w) => w.position)).toMatchInlineSnapshot(`
[
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
]
`)
  })

  test('2 windows of same app → different positions', () => {
    const layout = resolveLayout(['Chrome', 'Chrome'])
    expect(layout.windows).toMatchInlineSnapshot(`
[
  {
    "app": "Chrome",
    "position": "left",
  },
  {
    "app": "Chrome",
    "position": "right",
  },
]
`)
  })

  test('3 windows with duplicate app', () => {
    const layout = resolveLayout(['Chrome', 'Chrome', 'Alacritty'])
    expect(layout.windows.map((w) => `${w.app}:${w.position}`)).toMatchInlineSnapshot(`
[
  "Chrome:left",
  "Chrome:right-top",
  "Alacritty:right-bottom",
]
`)
  })

  test('0 apps throws', () => {
    expect(() => resolveLayout([])).toThrow('At least one app name is required')
  })

  test('5 apps throws', () => {
    expect(() => resolveLayout(['A', 'B', 'C', 'D', 'E'])).toThrow('Maximum 4 apps supported')
  })

  test('respects custom options', () => {
    const layout = resolveLayout(['Chrome', 'Alacritty'], {
      screen: 1,
      audio: false,
      align: 'right',
      recording: 'fullscreen',
    })
    expect(layout.screen).toBe(1)
    expect(layout.audio).toBe(false)
    expect(layout.align).toBe('right')
    expect(layout.recording.area).toBe('fullscreen')
  })
})

describe('calculateLayoutGeometry', () => {
  test('1 window: single frame fills usable area', () => {
    const { windowFrames, recordingRect } = calculateLayoutGeometry(
      mockScreen,
      { edge: 0.10, gap: 0, top: 0.10, bottom: 0.10 },
      1,
      { area: 'fullscreen' },
    )
    expect(windowFrames).toHaveLength(1)
    expect(recordingRect).toBeUndefined()
    // Check the frame is within screen bounds
    const f = windowFrames[0]
    expect(f.x).toBeGreaterThanOrEqual(0)
    expect(f.y).toBeGreaterThanOrEqual(0)
    expect(f.x + f.w).toBeLessThanOrEqual(1920)
    expect(f.y + f.h).toBeLessThanOrEqual(1080)
  })

  test('2 windows: two non-overlapping frames', () => {
    const { windowFrames } = calculateLayoutGeometry(
      mockScreen,
      { edge: 0.035, gap: 0.023, top: 0.083, bottom: 0.083 },
      2,
      { area: 'windows', aspectRatio: 16 / 9 },
    )
    expect(windowFrames).toHaveLength(2)
    const [left, right] = windowFrames
    // Left frame ends before right frame starts
    expect(left.x + left.w).toBeLessThan(right.x)
    // Same vertical position and height
    expect(left.y).toBe(right.y)
    expect(left.h).toBe(right.h)
  })

  test('3 windows: left full-height, right stacked', () => {
    const { windowFrames } = calculateLayoutGeometry(
      mockScreen,
      { edge: 0.02, gap: 0.015, top: 0.04, bottom: 0.04 },
      3,
      { area: 'windows', aspectRatio: 16 / 9 },
    )
    expect(windowFrames).toHaveLength(3)
    const [left, rightTop, rightBottom] = windowFrames
    // Left is taller than each right window
    expect(left.h).toBeGreaterThan(rightTop.h)
    // Right windows are stacked vertically
    expect(rightTop.x).toBe(rightBottom.x)
    expect(rightTop.y + rightTop.h).toBeLessThan(rightBottom.y)
    // Left and right don't overlap horizontally
    expect(left.x + left.w).toBeLessThan(rightTop.x)
  })

  test('4 windows: 2x2 grid, no overlaps', () => {
    const { windowFrames } = calculateLayoutGeometry(
      mockScreen,
      { edge: 0.02, gap: 0.015, top: 0.04, bottom: 0.04 },
      4,
      { area: 'windows', aspectRatio: 16 / 9 },
    )
    expect(windowFrames).toHaveLength(4)
    const [tl, tr, bl, br] = windowFrames
    // Top row: same y, no horizontal overlap
    expect(tl.y).toBe(tr.y)
    expect(tl.x + tl.w).toBeLessThan(tr.x)
    // Bottom row: same y, no horizontal overlap
    expect(bl.y).toBe(br.y)
    expect(bl.x + bl.w).toBeLessThan(br.x)
    // Top and bottom rows don't overlap vertically
    expect(tl.y + tl.h).toBeLessThan(bl.y)
    // All same size
    expect(tl.w).toBe(tr.w)
    expect(tl.w).toBe(bl.w)
    expect(tl.h).toBe(tr.h)
    expect(tl.h).toBe(bl.h)
  })
})
