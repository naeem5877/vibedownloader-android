import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

const { StoryModule } = NativeModules;

export interface StoryItem {
  id: string;
  /** SnapSave CDN url carrying a signed token; this is what gets downloaded. */
  url: string;
  thumbnail: string;
  type: 'image' | 'video';
  username: string;
  platform: string;
  timestamp: number;
  duration: number;
  title: string;
}

export interface StoryDownloadResult {
  processId: string;
  filePath: string;
  fileName: string;
  platform: string;
  exitCode: number;
}

export interface StoryBatchResult {
  success: number;
  failed: number;
  total: number;
}

interface StoryNativeModule {
  fetchStories(platform: string, username: string): Promise<StoryItem[]>;
  downloadStory(
    storyUrl: string,
    platform: string,
    username: string,
    storyType: string,
    processId: string
  ): Promise<StoryDownloadResult>;
  downloadAllStories(
    storiesJson: string,
    platform: string,
    username: string
  ): Promise<StoryBatchResult>;
}

/**
 * Stories are served by SnapSave rather than Instagram's own endpoints, which
 * require a login for anything past the first few posts. The module is Android
 * only, so `StoryNative` is null elsewhere and callers must keep a fallback.
 */
export const StoryNative: StoryNativeModule | null =
  Platform.OS === 'android' && StoryModule ? (StoryModule as StoryNativeModule) : null;

export const storyEventEmitter = StoryNative
  ? new NativeEventEmitter(StoryModule)
  : null;