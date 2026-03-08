export interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}
export interface ScreenInfo {
    index: number;
    x: number;
    y: number;
    w: number;
    h: number;
    isMain: boolean;
}
/**
 * Get all connected screens with their geometry using JXA + NSScreen.
 * Returns an array sorted by screen index, with coordinates matching
 * what AVFoundation and ffmpeg expect.
 */
export declare function getScreens(): Promise<ScreenInfo[]>;
/**
 * Set a window's position and size using AppleScript.
 * Handles the AXEnhancedUserInterface workaround for apps like Alacritty
 * that resist frame changes.
 */
export declare function setWindowFrame(appName: string, frame: Rect): Promise<void>;
/**
 * Activate (bring to front) an application.
 */
export declare function activateApp(appName: string): Promise<void>;
/**
 * Launch an application if not running, or activate it if already running.
 */
export declare function launchApp(appName: string): Promise<void>;
/**
 * Check if an application is currently running.
 */
export declare function isAppRunning(appName: string): Promise<boolean>;
/**
 * Show a macOS notification.
 */
export declare function showNotification(message: string): Promise<void>;
//# sourceMappingURL=windows.d.ts.map