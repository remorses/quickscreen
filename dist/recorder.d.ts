import { type ChildProcess } from 'child_process';
import type { ScreenInfo, Rect } from './windows.js';
export interface RecordingOptions {
    /** AVFoundation screen name, e.g. "Capture screen 0" */
    screenName: string;
    /** Screen geometry for calculating crop offsets */
    screenFrame: Rect;
    /** Optional crop region (absolute coordinates). If omitted, records full screen. */
    crop?: Rect;
    /** Record audio from default system input device */
    audio: boolean;
    /** Output file path */
    outputPath: string;
    /** Video quality: lower = better (default: 18) */
    crf?: number;
    /** Frame rate (default: 30) */
    framerate?: number;
}
/**
 * Get the AVFoundation screen device name for a given screen index.
 * AVFoundation lists capture screens as "Capture screen 0", "Capture screen 1", etc.
 * The ordering matches the NSScreen ordering.
 */
export declare function getScreenName(screenIndex: number): string;
/**
 * Generate a timestamped output file path.
 */
export declare function generateOutputPath(outputDir?: string): string;
/**
 * Start an ffmpeg recording as a child process.
 * Returns the process handle — send 'q' to its stdin to stop gracefully.
 */
export declare function startRecording(opts: RecordingOptions): ChildProcess;
/**
 * Stop a recording gracefully by sending 'q' to ffmpeg's stdin.
 * Waits for the process to exit, then returns.
 */
export declare function stopRecording(proc: ChildProcess): Promise<void>;
/**
 * Reveal a file in Finder.
 */
export declare function revealInFinder(filePath: string): void;
/**
 * Calculate the recording crop rect and window frames for a layout.
 */
export declare function calculateLayoutGeometry(screen: ScreenInfo, padding: {
    edge: number;
    gap: number;
    top: number;
    bottom: number;
}, windowCount: number, recording: {
    area: 'fullscreen' | 'windows';
    aspectRatio?: number;
}): {
    windowFrames: Rect[];
    recordingRect: Rect | undefined;
};
//# sourceMappingURL=recorder.d.ts.map