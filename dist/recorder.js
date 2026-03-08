import { spawn } from 'child_process';
import { homedir } from 'os';
import { join } from 'path';
/**
 * Get the AVFoundation screen device name for a given screen index.
 * AVFoundation lists capture screens as "Capture screen 0", "Capture screen 1", etc.
 * The ordering matches the NSScreen ordering.
 */
export function getScreenName(screenIndex) {
    return `Capture screen ${screenIndex}`;
}
/**
 * Generate a timestamped output file path.
 */
export function generateOutputPath(outputDir) {
    const dir = outputDir || join(homedir(), 'Desktop');
    const timestamp = new Date()
        .toISOString()
        .replace(/T/, '-')
        .replace(/:/g, '')
        .replace(/\..+/, '');
    return join(dir, `recording-${timestamp}.mov`);
}
/**
 * Ensure dimensions are even (required by H.264 encoder).
 */
function ensureEven(n) {
    const rounded = Math.floor(n);
    return rounded % 2 === 0 ? rounded : rounded - 1;
}
/**
 * Start an ffmpeg recording as a child process.
 * Returns the process handle — send 'q' to its stdin to stop gracefully.
 */
export function startRecording(opts) {
    const crf = opts.crf ?? 18;
    const framerate = opts.framerate ?? 30;
    const args = [
        // Input: screen + audio
        '-f', 'avfoundation',
        '-framerate', String(framerate),
    ];
    // Input device: "screen:audio" or "screen:none"
    const audioDevice = opts.audio ? 'default' : 'none';
    args.push('-i', `${opts.screenName}:${audioDevice}`);
    // Video filters
    const vf = [];
    if (opts.crop) {
        const cropX = Math.floor(opts.crop.x - opts.screenFrame.x);
        const cropY = Math.floor(opts.crop.y - opts.screenFrame.y);
        const cropW = ensureEven(opts.crop.w);
        const cropH = ensureEven(opts.crop.h);
        vf.push(`crop=${cropW}:${cropH}:${cropX}:${cropY}`);
    }
    if (vf.length > 0) {
        args.push('-vf', vf.join(','));
    }
    // Video codec
    args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', String(crf), '-pix_fmt', 'yuv420p');
    // Audio codec — force 44100 Hz output sample rate to avoid crackling
    // caused by sample rate mismatch between capture device and encoder
    if (opts.audio) {
        args.push('-c:a', 'aac', '-b:a', '128k', '-ar', '44100');
    }
    // Output
    args.push('-movflags', '+faststart', opts.outputPath);
    const proc = spawn('ffmpeg', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
    });
    return proc;
}
/**
 * Stop a recording gracefully by sending 'q' to ffmpeg's stdin.
 * Waits for the process to exit, then returns.
 */
export function stopRecording(proc) {
    return new Promise((resolve, reject) => {
        if (proc.exitCode !== null) {
            // Already exited
            resolve();
            return;
        }
        proc.on('close', () => resolve());
        proc.on('error', reject);
        // Send 'q' to stdin — ffmpeg's graceful shutdown
        proc.stdin?.write('q');
    });
}
/**
 * Reveal a file in Finder.
 */
export function revealInFinder(filePath) {
    spawn('open', ['-R', filePath], { stdio: 'ignore', detached: true }).unref();
}
/**
 * Calculate the recording crop rect and window frames for a layout.
 */
export function calculateLayoutGeometry(screen, padding, windowCount, recording) {
    const { w: screenW, h: screenH, x: screenX, y: screenY } = screen;
    // Apply aspect ratio constraint if specified
    let totalW = screenW;
    let totalH = screenH;
    if (recording.aspectRatio) {
        totalH = screenH;
        totalW = totalH * recording.aspectRatio;
        if (totalW > screenW) {
            totalW = screenW;
            totalH = totalW / recording.aspectRatio;
        }
    }
    // Calculate padding in pixels
    const edgePx = totalW * padding.edge;
    const gapPx = totalW * padding.gap;
    const topPx = totalH * padding.top;
    const bottomPx = totalH * padding.bottom;
    const usableW = totalW - 2 * edgePx;
    const usableH = totalH - topPx - bottomPx;
    // Center the constrained area on the screen
    const offsetX = screenX + (screenW - totalW) / 2;
    const offsetY = screenY + (screenH - totalH) / 2;
    const windowFrames = [];
    if (windowCount === 1) {
        // Center: single window with padding
        windowFrames.push({
            x: offsetX + edgePx,
            y: offsetY + topPx,
            w: usableW,
            h: usableH,
        });
    }
    else if (windowCount === 2) {
        // Split: two windows side by side
        const availableW = usableW - gapPx;
        const windowW = availableW / 2;
        const leftX = offsetX + edgePx;
        const rightX = leftX + windowW + gapPx;
        const y = offsetY + topPx;
        windowFrames.push({ x: leftX, y, w: windowW, h: usableH }, { x: rightX, y, w: windowW, h: usableH });
    }
    // Calculate recording rect
    let recordingRect;
    if (recording.area === 'fullscreen') {
        recordingRect = undefined; // No crop — record entire screen
    }
    else {
        // Record the window area plus padding
        const leftmost = Math.min(...windowFrames.map((f) => f.x));
        const rightmost = Math.max(...windowFrames.map((f) => f.x + f.w));
        const layoutW = rightmost - leftmost;
        const layoutCenterX = leftmost + layoutW / 2;
        const recW = ensureEven(layoutW + 2 * edgePx);
        const recX = layoutCenterX - recW / 2;
        recordingRect = {
            x: recX,
            y: screenY,
            w: recW,
            h: ensureEven(screenH),
        };
    }
    return { windowFrames, recordingRect };
}
