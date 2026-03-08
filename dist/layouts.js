/**
 * Built-in layouts.
 * These match the original Hammerspoon layouts:
 * - "split": Chrome on left + terminal on right, 16:9 aspect ratio on main display
 * - "center": Terminal centered on secondary display, fullscreen recording
 */
export const defaultLayouts = [
    {
        name: 'split',
        screen: 0,
        audio: true,
        windows: [
            { app: 'Google Chrome', position: 'left' },
            { app: 'Alacritty', position: 'right' },
        ],
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
];
