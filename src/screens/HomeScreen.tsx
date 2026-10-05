/**
 * HomeScreen - Premium UI for VibeDownloader Mobile
 */
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
    View,
    Text,
    ScrollView,
    StyleSheet,
    StatusBar,
    Alert,
    ToastAndroid,
    PermissionsAndroid,
    Platform,
    Linking,
    AppState,
    Animated,
    Easing,
    TouchableOpacity,
    AppStateStatus,
    Share,
    Dimensions,
    ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, BorderRadius, Spacing, Typography, PlatformThemes, getPlatformColor, Shadows } from '../theme';
import {
    PlatformSelector,
    URLInput,
    VideoInfoCard,
    FormatList,
    DownloadProgress,
    OfflineBanner,
    UpdateModal,
    EmptyState,
    SettingsModal,
    LyricsPanel,
    SubtitlePicker,
    AudioTrackSelector,
    FormatsSkeleton,
} from '../components';
import { CookieManagerService } from '../services/CookieManagerService';
import { LocalDB } from '../services/LocalDB';
import { PlaylistSelectionModal } from '../components/PlaylistSelectionModal';
import { SkeletonCard } from '../components/SkeletonCard';
import { DiscordButton } from '../components/DiscordButton';

// BatchDownloadProgress removed in favor of useDownloadQueue
import { useYtDlp } from '../hooks/useYtDlp';
import { VideoFormat, ytDlpEventEmitter, YtDlpNative } from '../native/YtDlpModule';
import { StoryNative } from '../native/StoryModule';
import { WebViewLoginNative } from '../native/WebViewLoginModule';
import { DownloadIcon, SparkleIcon, LayersIcon, WaveformIcon, LibraryIcon, CloseIcon, SettingsIcon, ChevronRightIcon, ScissorsIcon, WarningIcon } from '../components/Icons';
import { useDownloadQueue } from '../hooks/useDownloadQueue';
import { DownloadQueuePanel } from '../components/DownloadQueuePanel';
import { BatchDownloadSheet, BatchResolvedItem } from '../components/BatchDownloadSheet';
import { CutDownloadSheet } from '../components/CutDownloadSheet';
import { LiveBadge, LiveRecordBar } from '../components/LiveRecordBar';
import { checkForUpdates, UpdateInfo } from '../services/GitHubUpdateService';
import { getSpotifyPlaylist, extractSpotifyId, getTrackInfo, buildYouTubeSearchQuery, formatTrackMetadata } from '../services/SpotifyService';

import { getYouTubeMusicAlbumArt, isYouTubeMusicUrl, isYouTubeUrl, extractYouTubeVideoId } from '../services/YouTubeMusicService';
import { lookupLyrics } from '../services/LyricsService';
import type { LyricsResult } from '../services/lyrics/types';
import type { AudioTrack, SubtitleTrack } from '../native/YtDlpModule';
import { detectPlatform } from '../utils/platform';
import { Haptics } from '../utils/haptics';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface HomeScreenProps {
    onNavigateToLibrary?: () => void;
}

/** `3:45`, or `1:02:03` for long media, for inline duration labels. */
function formatDuration(seconds: number): string {
    const safe = Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : 0;
    const h = Math.floor(safe / 3600);
    const m = Math.floor((safe % 3600) / 60);
    const s = safe % 60;
    if (h > 0) {
        return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${m}:${String(s).padStart(2, '0')}`;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({ onNavigateToLibrary }) => {
    const [url, setUrl] = useState('');
    const [detectedPlatform, setDetectedPlatform] = useState<string | null>(null);
    const [userSelectedPlatform, setUserSelectedPlatform] = useState(false);
    // Removed downloadMode toggle - auto-detect based on platform (Spotify/SoundCloud = audio)

    // Playlist State
    const [playlistModalVisible, setPlaylistModalVisible] = useState(false);
    const [playlistItems, setPlaylistItems] = useState<any[]>([]);
    const [playlistTitle, setPlaylistTitle] = useState('');
    const [playlistImage, setPlaylistImage] = useState<string | undefined>(undefined);
    const [isPlaylistLoading, setIsPlaylistLoading] = useState(false);

    // Network State
    const [isOffline, setIsOffline] = useState(false);

    useEffect(() => {
        let NetInfo: any;
        try {
            NetInfo = require('@react-native-community/netinfo').default;
        } catch (e) {
            NetInfo = null;
        }

        if (NetInfo) {
            const unsubscribe = NetInfo.addEventListener((state: any) => {
                setIsOffline(state.isConnected === false);
            });
            return () => unsubscribe();
        }
    }, []);

    // Update Modal State
    const [updateModalVisible, setUpdateModalVisible] = useState(false);
    const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);

    // Settings Modal State
    const [settingsVisible, setSettingsVisible] = useState(false);



    // YouTube Music album art state
    // When a music.youtube.com URL is detected we fetch the real lh3 album art
    // so both the preview card and the embedded ID3 tag use it.
    const [ytMusicAlbumArtUrl, setYtMusicAlbumArtUrl] = useState<string | null>(null);

    // ── Lyrics / subtitles / audio-language selection ──
    // All three reset when the fetched video changes, otherwise a selection made
    // for one track would silently apply to the next.
    const [lyrics, setLyrics] = useState<LyricsResult | null>(null);
    const [lyricsLoading, setLyricsLoading] = useState(false);
    const [selectedAudioFormatId, setSelectedAudioFormatId] = useState<string | null>(null);
    const [downloadingSubtitleKey, setDownloadingSubtitleKey] = useState<string | null>(null);
    const [downloadedSubtitleKey, setDownloadedSubtitleKey] = useState<string | null>(null);
    /** True once the last download tap asked for audio only, for the selector hint. */
    const [audioOnlyIntent, setAudioOnlyIntent] = useState(false);

    const [state, actions] = useYtDlp();

    const [queuePanelVisible, setQueuePanelVisible] = useState(false);
const [batchSheetVisible, setBatchSheetVisible] = useState(false);
const [cutSheetVisible, setCutSheetVisible] = useState(false);
const [liveRecording, setLiveRecording] = useState(false);
    const {
        queue,
        isQueueRunning,
        isPaused,
        totalDone,
        totalFailed,
        stats,
        addToQueue,
        cancelItem,
        cancelAll,
        clearQueue,
        retryItem,
        retryFailed,
        pause,
        resume,
    } = useDownloadQueue();

    // Animation refs
    const playlistCheckTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    /**
     * URL already auto-fetched from a share.
     *
     * The share intent is not consumed by the native side, so `checkShareIntent`
     * sees the same payload from both the mount timer and the AppState
     * 'active' listener - and `onShareReceived` can fire as well. Without this
     * guard one share started up to three extractions, each spawning its own
     * Python interpreter.
     */
    const consumedShareRef = useRef<string | null>(null);

    const [loginModalVisible, setLoginModalVisible] = useState(false);
    const [loggedInPlatforms, setLoggedInPlatforms] = useState<Record<string, boolean>>({});

    // Check login state periodically or on change
    // sessionsRestored ensures we don't run checkLogins before
    // LocalDB.restoreSessions() has finished writing the cookie files.
    const [sessionsRestored, setSessionsRestored] = useState(false);

    useEffect(() => {
        if (!sessionsRestored) return; // wait for cookie files to be written first
        const checkLogins = async () => {
            const platforms = ['instagram', 'facebook', 'youtube', 'tiktok', 'twitter', 'x', 'twitch'];
            const states: Record<string, boolean> = {};
            for (const p of platforms) {
                const cookie = await CookieManagerService.getCookiesForPlatform(p === 'x' ? 'twitter' : p);
                states[p] = !!cookie;
            }
            setLoggedInPlatforms(states);
        };
        checkLogins();
    }, [sessionsRestored, loginModalVisible, detectedPlatform]);

    const headerFadeAnim = useRef(new Animated.Value(0)).current;
    const headerSlideAnim = useRef(new Animated.Value(-20)).current;
    const batchActiveRef = useRef(false);
    const lastPastedUrlRef = useRef<string>('');

    const handleFetch = useCallback(async (text: string = url) => {
        if (!text.trim()) {
            ToastAndroid.show('Please enter a URL', ToastAndroid.SHORT);
            return;
        }

        // Clear previous playlist state
        setPlaylistItems([]);
        setPlaylistTitle('');
        setPlaylistImage(undefined);

        // ── 0. YouTube / YouTube Music — fetch real album art before/alongside normal fetch ──
        if (isYouTubeUrl(text)) {
            setYtMusicAlbumArtUrl(null); // clear stale art from previous track
            getYouTubeMusicAlbumArt(text)
                .then((result) => {
                    if (result && result.isRealAlbumArt) {
                        console.log(
                            `[HomeScreen] YT Music album art (${result.isRealAlbumArt ? 'real' : 'fallback'}): ${result.url.slice(0, 60)}`
                        );
                        setYtMusicAlbumArtUrl(result.url);
                    }
                })
                .catch((e) => console.warn('[HomeScreen] YT Music art fetch failed:', e));
        } else {
            setYtMusicAlbumArtUrl(null);
        }

        // 1. Check Spotify
        const spotifyData = extractSpotifyId(text);

        // Spotify Playlist / Album
        if (spotifyData && (spotifyData.type === 'playlist' || spotifyData.type === 'album')) {
            setIsPlaylistLoading(true);
            setPlaylistModalVisible(true);
            try {
                const data = await getSpotifyPlaylist(spotifyData.id);
                setPlaylistTitle(data.name);
                setPlaylistImage(data.images?.[0]?.url);

                const items = data.tracks.items.map((item: any) => ({
                    id: item.track.id,
                    title: item.track.name,
                    author: item.track.artists.map((a: any) => a.name).join(', '),
                    duration: item.track.duration_ms ? `${Math.floor(item.track.duration_ms / 60000)}:${((item.track.duration_ms % 60000) / 1000).toFixed(0).padStart(2, '0')}` : undefined,
                    thumbnail: item.track.album.images?.[0]?.url,
                    url: item.track.external_urls.spotify,
                    type: 'spotify',
                    searchQuery: buildYouTubeSearchQuery(item.track),
                    rawTrack: item.track
                }));

                setPlaylistItems(items);
            } catch (error: any) {
                console.error('Spotify error:', error);
                ToastAndroid.show('Failed to fetch Spotify playlist: ' + error.message, ToastAndroid.SHORT);
                setPlaylistModalVisible(false);
            } finally {
                setIsPlaylistLoading(false);
            }
            return;
        }

        // Spotify Single Track
        if (spotifyData && spotifyData.type === 'track') {
            try {
                // Manually trigger loading state if we could, but for now we'll just wait
                ToastAndroid.show('Fetching Spotify track...', ToastAndroid.SHORT);

                const track = await getTrackInfo(spotifyData.id);
                const metadata = formatTrackMetadata(track);

                // Create synthetic VideoInfo for UI to display
                const syntheticInfo: any = {
                    id: track.id,
                    title: track.name,
                    description: `Artist: ${metadata.artist}\nAlbum: ${metadata.album}`,
                    thumbnail: metadata.thumbnail,
                    uploader: metadata.artist,
                    uploaderUrl: '',
                    duration: metadata.duration,
                    viewCount: 0,
                    likeCount: 0,
                    uploadDate: metadata.releaseDate,
                    extractor: 'spotify',
                    url: text,
                    platform: 'Spotify',
                    formats: [
                        { formatId: 'audio_mp3', ext: 'mp3', formatNote: 'High Quality', filesize: 0 }
                    ],
                    // Extra data for downloader
                    searchQuery: buildYouTubeSearchQuery(track),
                    rawMetadata: metadata,
                    spotifyId: spotifyData.id,
                };

                actions.setVideoInfo(syntheticInfo);



            } catch (error: any) {
                console.error('Spotify Track Error', error);
                ToastAndroid.show(`Spotify Error: ${error.message || 'Unknown error'}`, ToastAndroid.LONG);
            }
            return;
        }

        // 1.5 Check Instagram / Facebook Profile for Stories
        const igRegex = /(?:https?:\/\/)?(?:www\.)?instagram\.com\/([a-zA-Z0-9._]+)\/?$/;
        const igHighlightRegex = /(?:https?:\/\/)?(?:www\.)?instagram\.com\/stories\/highlights\/([0-9]+)\/?/;
        const fbRegex = /(?:https?:\/\/)?(?:www\.)?facebook\.com\/([a-zA-Z0-9._-]+)\/?$/;
        
let isStoryFetch = false;
        let storyUrl = '';
        let platformName = '';
        // SnapSave resolves stories from a handle for Instagram but from a full
        // permalink for Facebook, so the original input is kept intact here.
        let storyUsername = '';

        const inputStr = text.trim();
        const fullIgStoryRegex = /(?:https?:\/\/)?(?:www\.)?instagram\.com\/stories\/([a-zA-Z0-9._]+)\/(\d+)\/?/;
        const fullFbStoryRegex = /(?:https?:\/\/)?(?:www\.)?facebook\.com\/([a-zA-Z0-9._-]+)\/stories\/(\d+)\/?/;
        // Story-tray permalink as copied from the Facebook app:
        //   facebook.com/stories/<page_id>/<opaque_story_id>/?bucket_count=9&source=story_tray
        const fbTrayStoryRegex = /(?:https?:\/\/)?(?:www\.|m\.)?facebook\.com\/stories\/(\d+)\/([A-Za-z0-9_=%+-]+)/;
        let match = inputStr.match(igRegex);
        if (match && match[1] && !['stories', 'p', 'reel', 'tv'].includes(match[1].toLowerCase())) {
            isStoryFetch = true;
            storyUsername = match[1];
            storyUrl = `https://instagram.com/stories/${match[1]}/`;
            platformName = 'instagram';
        } else {
            const igStory = inputStr.match(fullIgStoryRegex);
            const fbStory = inputStr.match(fullFbStoryRegex);
            const fbTray = inputStr.match(fbTrayStoryRegex);
            if (igStory) {
                isStoryFetch = true;
                platformName = 'instagram';
                storyUsername = igStory[1];
                storyUrl = `https://www.instagram.com/stories/${igStory[1]}/${igStory[2]}/`;
            } else if (fbTray) {
                isStoryFetch = true;
                platformName = 'facebook';
                // Keep both path segments so the native side can rebuild the
                // permalink exactly; the query string is not needed.
                storyUsername = `stories/${fbTray[1]}/${fbTray[2]}`;
                storyUrl = `https://www.facebook.com/stories/${fbTray[1]}/${fbTray[2]}/`;
            } else if (fbStory) {
                isStoryFetch = true;
                platformName = 'facebook';
                storyUsername = `${fbStory[1]}/${fbStory[2]}`;
                storyUrl = `https://www.facebook.com/${fbStory[1]}/stories/${fbStory[2]}/`;
            } else {
            match = inputStr.match(fbRegex);
            if (match && match[1] && !['stories', 'watch', 'groups', 'events'].includes(match[1].toLowerCase())) {
                isStoryFetch = true;
                storyUsername = match[1];
                storyUrl = `https://www.facebook.com/${match[1]}/stories/`;
            platformName = 'facebook';
        } else if (inputStr.startsWith('@')) {
                isStoryFetch = true;
                const username = inputStr.substring(1);
                storyUsername = username;
                platformName = detectedPlatform?.toLowerCase() === 'facebook' ? 'facebook' : 'instagram';
                if (platformName === 'facebook') {
                    storyUrl = `https://www.facebook.com/${username}/stories/`;
                } else {
                    storyUrl = `https://instagram.com/stories/${username}/`;
                }
            } else if (!inputStr.includes('://') && !inputStr.includes(' ') && (detectedPlatform?.toLowerCase() === 'instagram' || detectedPlatform?.toLowerCase() === 'facebook')) {
                isStoryFetch = true;
                platformName = detectedPlatform.toLowerCase();
                const username = inputStr;
                storyUsername = username;
                if (platformName === 'facebook') {
                    storyUrl = `https://www.facebook.com/${username}/stories/`;
                } else {
                    storyUrl = `https://instagram.com/stories/${username}/`;
                }
            }
            }
        }

        if (isStoryFetch) {
            const platformLabel = platformName.charAt(0).toUpperCase() + platformName.slice(1);
            ToastAndroid.show(`Fetching ${platformName} stories...`, ToastAndroid.SHORT);
            setIsPlaylistLoading(true);
            setPlaylistModalVisible(true);
            try {
                if (StoryNative) {
                    // SnapSave path: works for public accounts without a login.
                    const stories = await StoryNative.fetchStories(platformName, storyUsername);

                    if (stories.length === 0) {
                        ToastAndroid.show('No stories found or account is private.', ToastAndroid.SHORT);
                        setPlaylistModalVisible(false);
                    } else {
                        setPlaylistTitle(`${platformLabel} Stories`);
                        setPlaylistImage(stories[0]?.thumbnail);

                        setPlaylistItems(
                            stories.map((story, index) => ({
                                id: story.id || `story-${index}`,
                                title: story.title || `Story ${index + 1}`,
                                author: story.username || storyUsername,
                                duration: undefined,
                                url: story.url,
                                thumbnail: story.thumbnail,
                                type: platformName,
                                storyType: story.type,
                                isReel: false,
                            }))
                        );
                    }
                } else if (YtDlpNative && YtDlpNative.getPlaylistInfo) {
                     const cookiesPath = await CookieManagerService.getCookiesForPlatform(platformName);
                     
                     // No longer using extractor args for highlights
                     const extractorArgs = undefined;

                     const playlistJson = await YtDlpNative.getPlaylistInfo(storyUrl, { 
                         cookies: cookiesPath || undefined,
                         extractorArgs,
                         args: ['--no-warnings']
                     });
                     
                     // Sanitize JSON in case there are warnings/logs prepended by yt-dlp/python
                     const jsonStart = playlistJson.indexOf('{');
                     if (jsonStart === -1) throw new Error('Invalid response from server (no JSON found)');
                     const sanitizedJson = playlistJson.substring(jsonStart);
                     
                     const data = JSON.parse(sanitizedJson);
                     setPlaylistTitle(data.title || `${platformLabel} Stories`);
                     setPlaylistImage(data.thumbnails?.[0]?.url || data.thumbnail);
                     
                     const storyUsername = match?.[1] || data.uploader_id || data.title || '';
                     const items = (data.entries || []).map((entry: any, index: number) => {
                         // yt-dlp flat-playlist may return partial/relative URLs — reconstruct absolute URLs
                         let entryUrl = entry.url || entry.webpage_url || '';
                         if (!entryUrl.startsWith('http')) {
                             // Build absolute URL from the known username + entry ID
                             const entryId = entry.id || '';
                             if (platformName === 'facebook') {
                                 entryUrl = entryId
                                     ? `https://www.facebook.com/stories/${entryId}/`
                                     : storyUrl;
                             } else {
                                 // Instagram
                                 if (entry.id) {
                                     entryUrl = (storyUsername && entry.id)
                                         ? `https://www.instagram.com/stories/${storyUsername}/${entry.id}/`
                                         : storyUrl;
                                 } else {
                                     entryUrl = storyUrl;
                                 }
                             }
                         }
                         return {
                             id: entry.id || `story-${index}`,
                             title: entry.title || `Story ${index + 1}`,
                             author: entry.uploader || data.title || storyUsername || 'Unknown',
                             duration: entry.duration ? `${Math.floor(entry.duration / 60)}:${(entry.duration % 60).toString().padStart(2, '0')}` : undefined,
                             url: entryUrl,
                             thumbnail: entry.thumbnail || entry.thumbnails?.[0]?.url,
                             type: platformName,
                             isReel: false,
                         };
                     });

                     if (items.length === 0) {
                          ToastAndroid.show('No stories found or account is private.', ToastAndroid.SHORT);
                          setPlaylistModalVisible(false);
                     } else {
                          setPlaylistItems(items);
                     }
                }
            } catch (error: any) {
                console.warn('Story fetch error:', error);
                let msg = error?.message || error?.userInfo?.message || 'Unknown error';
                
                // Clean up raw python/yt-dlp scraping errors
                if (msg.includes('SSL') || msg.includes('Unable to download webpage') || msg.toLowerCase().includes('login') || msg.includes('401') || msg.includes('403')) {
                     msg = `${platformLabel} requires login. Tap the ${platformLabel} icon and log in first.`;
                } else if (msg.length > 50) {
                    // Truncate other extremely long ugly python logs
                    msg = msg.substring(0, 50) + '...';
                }

                ToastAndroid.show(`Failed to fetch stories: ${msg}`, ToastAndroid.LONG);
                setPlaylistModalVisible(false); 
            } finally {
                setIsPlaylistLoading(false);
            }
            return;
        }

        // 2. Check YouTube Playlist
        if (text.includes('list=') || text.includes('playlist')) {
            setIsPlaylistLoading(true);
            setPlaylistModalVisible(true);
            try {
                const json = await YtDlpNative.getPlaylistInfo(text);
                const data = JSON.parse(json);
                setPlaylistTitle(data.title || 'Playlist');
                // setPlaylistImage... yt-dlp dump-single-json flat-playlist excludes thumbnails usually to be fast

                const items = (data.entries || []).map((entry: any) => ({
                    id: entry.id,
                    title: entry.title,
                    author: entry.uploader,
                    duration: entry.duration ? `${Math.floor(entry.duration / 60)}:${(entry.duration % 60).toString().padStart(2, '0')}` : undefined,
                    url: entry.url || `https://youtu.be/${entry.id}`,
                    type: 'youtube'
                }));

                setPlaylistItems(items);
            } catch (error: any) {
                console.error('Playlist fetch error:', error);
                ToastAndroid.show('Failed to fetch playlist info', ToastAndroid.SHORT);
                setPlaylistModalVisible(false); // Fallback to single?
                // If playlist fetch fails, maybe try single fetch?
                actions.fetchInfo(text);
            } finally {
                setIsPlaylistLoading(false);
            }
            return;
        }

        // 3. Normal Single Fetch
        try {
            const cookiesPath = detectedPlatform ? await CookieManagerService.getCookiesForPlatform(detectedPlatform) : null;
            await actions.fetchInfo(text, { cookies: cookiesPath || undefined, args: ['--no-warnings'] });
            Haptics.success();

            // If YT Music and album art arrived already, patch the thumbnail now.
            // If art is still loading it will be patched by the parallel promise above.
        } catch (error: any) {
            console.error('Fetch error:', error);
            ToastAndroid.show(
                error?.message || 'Failed to fetch video info',
                ToastAndroid.LONG
            );
        }
    }, [url, actions, detectedPlatform]);

    const checkShareIntent = useCallback(async () => {
        try {
            // Try getSharedData first for structured data with platform
            const sharedData = await actions.getSharedData();

            if (sharedData && sharedData.url) {
                const { url: sharedUrl, platform, autoFetch } = sharedData;

                // Set URL and platform
                setUrl(sharedUrl);
                if (platform) {
                    setDetectedPlatform(platform);
                }

                // Show toast about detected platform
                if (platform && platform !== 'Unknown') {
                    ToastAndroid.show(`📥 ${platform} link detected`, ToastAndroid.SHORT);
                }

                // Auto-fetch if specified
                if (autoFetch && consumedShareRef.current !== sharedUrl) {
                    consumedShareRef.current = sharedUrl;
                    // Delay fetch slightly to ensure UI is updated
                    setTimeout(() => handleFetch(sharedUrl), 400);
                }
                return;
            }

            // Fallback to legacy method
            const sharedText = await actions.checkSharedText();
            if (sharedText) {
                const urlMatch = sharedText.match(/(https?:\/\/[^\s]+)/);
                if (urlMatch && urlMatch[0]) {
                    const sharedUrl = urlMatch[0];
                    setUrl(sharedUrl);
                    // Auto-detect platform and fetch
                    const detected = detectPlatform(sharedUrl);
                    if (detected !== 'YouTube') setDetectedPlatform(detected);
                    if (consumedShareRef.current !== sharedUrl) {
                        consumedShareRef.current = sharedUrl;
                        setTimeout(() => handleFetch(sharedUrl), 500);
                    }
                }
                return;
            }

            // Auto-paste logic
            const autoClipPref = await LocalDB.getSetting('pref_autoclip', true);
            
            if (autoClipPref) {
                const clipText = await actions.getClipboardText();
                if (clipText) {
                    const match = clipText.match(/(https?:\/\/[^\s]+)/);
                    if (match && match[0]) {
                        const clipUrl = match[0];
                        if (clipUrl !== lastPastedUrlRef.current) {
                            lastPastedUrlRef.current = clipUrl;
                            setUrl(clipUrl);
                            const detected = detectPlatform(clipUrl);
                            if (detected !== 'YouTube') setDetectedPlatform(detected);
                            ToastAndroid.show('Pasted from clipboard', ToastAndroid.SHORT);
                        }
                    }
                }
            }
        } catch (error) {
            console.warn('Error checking shared text/clipboard:', error);
        }
    }, [actions, handleFetch]);

    const requestPermissions = async () => {
        if (Platform.OS !== 'android') return;

        try {
            const sdkInt = Platform.Version;

            if (sdkInt >= 33) {
                await PermissionsAndroid.requestMultiple([
                    PermissionsAndroid.PERMISSIONS.READ_MEDIA_VIDEO,
                    PermissionsAndroid.PERMISSIONS.READ_MEDIA_AUDIO,
                    PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES,
                    PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
                ]);
            } else {
                await PermissionsAndroid.request(
                    PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE
                );
            }
        } catch (err) {
            console.warn('Permission request error:', err);
        }
    };

    const handleSaveThumbnail = useCallback(async () => {
        if (!state.videoInfo) return;

        ToastAndroid.show('Saving thumbnail...', ToastAndroid.SHORT);
        try {
            await actions.saveThumbnail(state.videoInfo.thumbnail, state.videoInfo.title);
            ToastAndroid.show('Thumbnail saved to Gallery', ToastAndroid.SHORT);
        } catch (e: any) {
            console.error('Thumbnail save error:', e);
            ToastAndroid.show('Failed to save thumbnail', ToastAndroid.SHORT);
        }
    }, [state.videoInfo, actions]);

    // Whether the loaded item is a music track (YouTube Music, category Music, -Topic, or Spotify)
    const isMusicTrack = useMemo(() => {
        const info = state.videoInfo;
        if (!info) return false;
        return Boolean(
            info.isMusic ||
            detectedPlatform === 'spotify' ||
            detectedPlatform === 'soundcloud' ||
            isYouTubeMusicUrl(info.url || '') ||
            info.uploader?.endsWith('-Topic') ||
            (info.categories && info.categories.some((c: string) => String(c).toLowerCase() === 'music'))
        );
    }, [state.videoInfo?.isMusic, state.videoInfo?.url, state.videoInfo?.uploader, state.videoInfo?.categories, detectedPlatform]);

    // Lyrics lookup identity. Keyed on the track identity rather than re-running
    // on every render, and guarded by a cancel flag so a slow response cannot
    // overwrite the current one. Matches desktop Downloader.tsx lyricsTarget.
    const lyricsTarget = useMemo(() => {
        const info = state.videoInfo;
        // Only attempt for non-partial (full) info — partial info lacks categories/artist
        // which causes isMusicTrack to be false then flip to true, triggering a double lookup.
        if (!info || info.partial) return null;

        const title = String(info.track || info.title || '').trim();
        const artist = String(info.artist || info.uploader || '')
            .replace(/\s*[–—-]\s*Topic\s*$/i, '')
            .trim();

        if (!title) return null;
        // Use stable server-side isMusic field; fall back to dash/artist heuristic
        const isMusic = Boolean(info.isMusic);
        if (!isMusic && !artist && !title.includes(' - ') && !title.includes(' – ')) return null;

        const targetId = `${info.id || info.url}|${title}|${artist}`;
        return {
            id: targetId,
            title,
            artist: artist || title,
            uploader: info.uploader,
            duration: info.duration,
            platform: info.platform,
        };
    }, [
        state.videoInfo?.id,
        state.videoInfo?.url,
        state.videoInfo?.title,
        state.videoInfo?.track,
        state.videoInfo?.artist,
        state.videoInfo?.uploader,
        state.videoInfo?.isMusic,
        state.videoInfo?.partial,
    ]);

    // Reset per-track selections when video changes
    useEffect(() => {
        const info = state.videoInfo;
        if (!info) {
            setSelectedAudioFormatId(null);
            setDownloadedSubtitleKey(null);
            setDownloadingSubtitleKey(null);
            setAudioOnlyIntent(false);
            return;
        }

        const original = info.audioTracks?.find((t) => t.isOriginal);
        setSelectedAudioFormatId(original?.formatId ?? null);
        setDownloadingSubtitleKey(null);
        setDownloadedSubtitleKey(null);
        setAudioOnlyIntent(false);
    }, [state.videoInfo?.id]);

    // Lookup lyrics on lyricsTarget identity change
    useEffect(() => {
        if (!lyricsTarget) {
            setLyrics(null);
            setLyricsLoading(false);
            return;
        }

        let cancelled = false;
        setLyricsLoading(true);

        lookupLyrics({
            title: lyricsTarget.title,
            uploader: lyricsTarget.uploader || '',
            artist: lyricsTarget.artist,
            isMusic: true,
            duration: lyricsTarget.duration,
            platform: lyricsTarget.platform,
        })
            .then((result) => {
                if (cancelled) return;
                setLyricsLoading(false);
                if (result) {
                    setLyrics(result);
                }
            })
            .catch(() => {
                if (!cancelled) setLyricsLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [lyricsTarget?.id]);

    const handleSelectAudioTrack = useCallback((track: AudioTrack) => {
        setSelectedAudioFormatId((prev) => (prev === track.formatId ? null : track.formatId));
    }, []);

    const handleDownloadSubtitles = useCallback(
        async (track: SubtitleTrack, format: 'srt' | 'vtt') => {
            const info = state.videoInfo;
            if (!info || downloadingSubtitleKey) return;

            setDownloadingSubtitleKey(track.key);

            try {
                const resolvedPlatform = detectedPlatform || info.platform || null;
                const cookiesPath = resolvedPlatform
                    ? await CookieManagerService.getCookiesForPlatform(resolvedPlatform)
                    : null;

                const saved = await YtDlpNative.downloadSubtitles(info.url, {
                    lang: track.lang,
                    isAuto: track.isAuto,
                    format,
                    platform: resolvedPlatform || undefined,
                    cookies: cookiesPath || undefined,
                    title: info.title,
                });

                setDownloadedSubtitleKey(track.key);
                ToastAndroid.show(
                    `Saved ${track.langLabel} · ${format.toUpperCase()}`,
                    ToastAndroid.SHORT
                );
                console.log('[Subtitles] Saved:', saved.filePath);
            } catch (e: any) {
                console.error('Subtitle download error:', e);
                ToastAndroid.show(
                    e?.message || 'Subtitle download failed',
                    ToastAndroid.LONG
                );
            } finally {
                setDownloadingSubtitleKey(null);
            }
        },
        [state.videoInfo, detectedPlatform, downloadingSubtitleKey]
    );

    const handleCancelDownload = useCallback(async () => {
        Alert.alert(
            'Cancel Download',
            'Are you sure you want to cancel?',
            [
                { text: 'No', style: 'cancel' },
                {
                    text: 'Yes',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await actions.cancelDownload();
                            ToastAndroid.show('Cancelled', ToastAndroid.SHORT);
                        } catch (error) {
                            console.warn('Cancel error:', error);
                        }
                    },
                },
            ],
        );
    }, [actions]);

    const handlePaste = useCallback(async () => {
        try {
            const text = await actions.getClipboardText();
            if (text) {
                Haptics.selection();
                setUrl(text);
                // Optional: Auto-fetch on paste if it looks like a URL
                if (text.startsWith('http')) {
                    const detected = detectPlatform(text);
                    if (detected !== 'YouTube') {
                        setDetectedPlatform(detected);
                    }
                    handleFetch(text);
                }
            }
        } catch (error) {
            console.warn('Clipboard error:', error);
            ToastAndroid.show('Failed to paste from clipboard', ToastAndroid.SHORT);
        }
    }, [actions, handleFetch]);

    // ─────────────────────────────────────────────────────────────
    // Cookie cache version — bump this string whenever you push a new
    // debug build to force stale cookie metadata to be cleared.
    // This fixes the "works only after uninstall" bug: filesDir and
    // AsyncStorage both survive APK updates, so old session tokens would
    // linger even after re-login unless we explicitly invalidate them.
    // ─────────────────────────────────────────────────────────────
    const COOKIE_CACHE_VERSION = '4';

    // --- Effects ---

    useEffect(() => {
        // ── Cookie cache invalidation + session restore on every app start ──
        const invalidateStaleCookieCache = async () => {
            try {
                const ALL_PLATFORMS = ['instagram', 'facebook', 'youtube', 'tiktok', 'twitter', 'twitch'];

                // Check 1: version-based invalidation — only clear the OLD path-based
                // AsyncStorage keys (cookies_path_*, cookies_expiry_*). Do NOT wipe
                // LocalDB sessions: those contain the full cookie string and are needed
                // by restoreSessions() to recreate the file after an APK update.
                const savedVersion = await AsyncStorage.getItem('cookie_cache_version');
                if (savedVersion !== COOKIE_CACHE_VERSION) {
                    console.log(`[Cookie] Cache version mismatch (${savedVersion} → ${COOKIE_CACHE_VERSION}) — clearing stale path cache only`);
                    const keysToRemove = ALL_PLATFORMS.flatMap(p => [
                        `cookies_path_${p}`,
                        `cookies_expiry_${p}`,
                    ]);
                    await AsyncStorage.multiRemove(keysToRemove);
                    // ⚠️ Do NOT call LocalDB.clearAllSessions() here — that would
                    // destroy the cookie strings we need to restore the files.
                    await AsyncStorage.setItem('cookie_cache_version', COOKIE_CACHE_VERSION);
                }

                // Check 2: install_id guard (for true fresh install / uninstall+reinstall)
                const savedInstallId = await AsyncStorage.getItem('vibe_install_id');
                if (!savedInstallId) {
                    // AsyncStorage was completely wiped — this is a fresh install.
                    console.log('[Cookie] Fresh install detected — ensuring clean cookie state');
                    await LocalDB.clearAllSessions();
                    await AsyncStorage.setItem('vibe_install_id', Date.now().toString());
                    await AsyncStorage.setItem('cookie_cache_version', COOKIE_CACHE_VERSION);
                }
            } catch (e) {
                console.warn('[Cookie] Cache invalidation check failed (non-fatal):', e);
            }

            // MUST await this: restoreSessions() rewrites the physical cookie .txt files
            // from LocalDB. If we don't await it, the first getCookiesForPlatform() call
            // may run before the file is written and incorrectly report "not logged in".
            await LocalDB.restoreSessions();

            // Signal that cookie files are ready — checkLogins effect can now safely run.
            setSessionsRestored(true);
        };

        // Await the full restore chain before marking any login states.
        // Without this, checkLogins() (triggered by the effect below) races
        // against restoreSessions() and sees missing cookie files.
        invalidateStaleCookieCache();

        // Header entrance animation
        Animated.parallel([
            Animated.timing(headerFadeAnim, {
                toValue: 1,
                duration: 600,
                useNativeDriver: true,
            }),
            Animated.spring(headerSlideAnim, {
                toValue: 0,
                tension: 50,
                friction: 8,
                useNativeDriver: true,
            }),
        ]).start();


        // Check for updates on mount
        setTimeout(async () => {
            const info = await checkForUpdates();
            if (info.available) {
                setUpdateInfo(info);
                setUpdateModalVisible(true);
            }
        }, 1500);
    }, []);

    // Dynamic Theme State
    const currentTheme = useMemo(() => {
        if (detectedPlatform) {
            // Find matching theme case-insensitively
            const themeKey = Object.keys(PlatformThemes).find(
                key => key.toLowerCase() === detectedPlatform.toLowerCase()
            );

            if (themeKey && PlatformThemes[themeKey]) {
                return PlatformThemes[themeKey];
            }
        }
        return PlatformThemes.default;
    }, [detectedPlatform]);

    const platformColor = useMemo(() => {
        return getPlatformColor(detectedPlatform);
    }, [detectedPlatform]);

    // Validate URL and detect platform with error handling
    useEffect(() => {
        const validateAndDetect = async () => {
            if (url.trim().length > 5) {
                // Use JS-based detection first as it's faster and handles common cases
                const detected = detectPlatform(url);
                if (detected !== 'YouTube' && !userSelectedPlatform) {
                    setDetectedPlatform(detected);
                } else {
                    // Fallback to native validation if needed or just trust JS
                    try {
                        const result = await actions.validateUrl(url);
                        // Only auto-update platform if user didn't manually select
                        if (!userSelectedPlatform && result.platform && result.platform !== 'Unknown') {
                            setDetectedPlatform(result.platform);
                        }
                    } catch (error) {
                        console.warn('URL validation error:', error);
                    }
                }
            }
        };

        const timer = setTimeout(validateAndDetect, 500);
        return () => clearTimeout(timer);
    }, [url, actions, userSelectedPlatform]);

    // Permissions and intent handling
    useEffect(() => {
        requestPermissions();
        // Delay initial check to ensure bridge is ready
        const timer = setTimeout(() => checkShareIntent(), 300);

        // Listen for real-time share events (emitted from MainActivity)
        const shareSubscription = ytDlpEventEmitter.addListener('onShareReceived', (data: any) => {
            if (data && data.url) {
                const { url: sharedUrl, platform, autoFetch } = data;
                setUrl(sharedUrl);
                if (platform) {
                    setDetectedPlatform(platform);
                }
                if (platform && platform !== 'Unknown') {
                    ToastAndroid.show(`📥 ${platform} shared`, ToastAndroid.SHORT);
                }
                if (autoFetch && consumedShareRef.current !== sharedUrl) {
                    consumedShareRef.current = sharedUrl;
                    handleFetch(sharedUrl);
                }
            }
        });

        const appStateSubscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
            if (nextAppState === 'active') {
                checkShareIntent();
            }
        });

        return () => {
            clearTimeout(timer);
            shareSubscription.remove();
            appStateSubscription.remove();
        };
    }, [handleFetch, checkShareIntent]);

    
    const handlePlaylistItemPress = useCallback(async (item: any) => {
        if (!item.isReel) {
            // Normal behavior: toggle selection is handled by the component if onItemPress is NOT called, 
            // but we are passing onItemPress so we must handle toggle here too if we want selection.
            // Actually, we can just return and let the modal handle it? No, if onItemPress is provided, 
            // the modal expects us to handle everything.
            // Wait, I'll update the modal to handle toggle internally if onItemPress returns false or something? 
            // Better to just handle it here.
            return; 
        }

        // It's a reel! Fetch its contents.
        ToastAndroid.show(`Opening ${item.title}...`, ToastAndroid.SHORT);
        setIsPlaylistLoading(true);
        
        try {
            const platformName = item.type || 'instagram';
            const cookiesPath = await CookieManagerService.getCookiesForPlatform(platformName);
            
            if (YtDlpNative && YtDlpNative.getPlaylistInfo) {
                // Fetch the specific highlight reel URL
                const playlistJson = await YtDlpNative.getPlaylistInfo(item.url, { 
                    cookies: cookiesPath || undefined,
                    args: ['--no-warnings']
                });
                
                // Sanitize JSON
                const jsonStart = playlistJson.indexOf('{');
                if (jsonStart === -1) throw new Error('Invalid response from server');
                const sanitizedJson = playlistJson.substring(jsonStart);
                
                const data = JSON.parse(sanitizedJson);
                setPlaylistTitle(data.title || item.title);
                setPlaylistImage(data.thumbnails?.[0]?.url || data.thumbnail || item.thumbnail);
                
                const items = (data.entries || []).map((entry: any, index: number) => {
                    let entryUrl = entry.url || entry.webpage_url || '';
                    if (!entryUrl.startsWith('http')) {
                        // For highlights, the entries are stories
                        entryUrl = `https://www.instagram.com/stories/highlights/${data.id || item.id}/${entry.id}/`;
                    }
                    
                    return {
                        id: entry.id || `story-${index}`,
                        title: entry.title || `Story ${index + 1}`,
                        author: entry.uploader || data.title || item.author || 'Unknown',
                        duration: entry.duration ? `${Math.floor(entry.duration / 60)}:${(entry.duration % 60).toString().padStart(2, '0')}` : undefined,
                        url: entryUrl,
                        thumbnail: entry.thumbnail || entry.thumbnails?.[0]?.url,
                        type: platformName,
                        isReel: false, // These are the actual stories
                    };
                });

                if (items.length === 0) {
                    ToastAndroid.show('No stories found in this highlight.', ToastAndroid.SHORT);
                } else {
                    setPlaylistItems(items);
                }
            }
        } catch (error: any) {
            console.warn('Reel fetch error:', error);
            ToastAndroid.show(`Failed to open highlight: ${error.message || 'Unknown error'}`, ToastAndroid.SHORT);
        } finally {
            setIsPlaylistLoading(false);
        }
    }, [setPlaylistItems, setPlaylistTitle, setPlaylistImage, setIsPlaylistLoading]);

    const handleBatchDownload = useCallback(async (selectedItems: any[], formatId: string) => {
        // Close the playlist modal first — we MUST wait for its slide-down animation
        // to fully complete before opening the queue panel. Opening two Android Modals
        // in the same JS tick causes the UI thread to freeze or the second modal to
        // silently never render.
        setPlaylistModalVisible(false);

        const items = await Promise.all(selectedItems.map(async (item) => {
            const cookiesPath = item.type ? await CookieManagerService.getCookiesForPlatform(item.type) : null;
            return {
                title: item.title,
                author: item.author,
                thumbnail: item.thumbnail,
                url: item.url,
                type: item.type || 'youtube',
                searchQuery: item.searchQuery,
                formatId,
                cookies: cookiesPath || undefined,
                album: item.rawTrack?.album?.name || 'Unknown',
                storyType: item.storyType
            };
        }));
        addToQueue(items, formatId);

        // Delay opening queue panel until the playlist modal closing animation finishes
        // (Android slide animation duration is ~300ms, 380ms gives a safe buffer)
        setTimeout(() => setQueuePanelVisible(true), 380);
    }, [addToQueue]);

    /**
     * Batch paste: the sheet has already resolved titles and cookies for each
     * link, so this only has to hand them to the queue.
     */
    const handleStartBatch = useCallback((items: BatchResolvedItem[], formatId: string | null) => {
        const result = addToQueue(items as any, formatId);
        setBatchSheetVisible(false);
        setTimeout(() => setQueuePanelVisible(true), 380);
        if (result.duplicates > 0) {
            ToastAndroid.show(
                `Skipped ${result.duplicates} duplicate link${result.duplicates > 1 ? 's' : ''}`,
                ToastAndroid.SHORT
            );
        }
    }, [addToQueue]);

    const handleDownload = useCallback(async (format: VideoFormat | string, forceTitle?: string, platform?: string) => {
        if (!state.videoInfo) return;

        // Recorded so the audio-language selector can say what the choice will
        // affect: an extracted audio track, or a track merged into a video.
        setAudioOnlyIntent(
            typeof format === 'string' ? format.startsWith('audio') : format.vcodec === 'none'
        );

        ToastAndroid.show('Starting download...', ToastAndroid.SHORT);

        try {
            // Check if it's a Spotify track (we'll check platform field or custom field)
            if (state.videoInfo.platform === 'Spotify' && (state.videoInfo as any).searchQuery) {
                const info = state.videoInfo as any;
                await actions.downloadSpotifyTrack(
                    info.searchQuery,
                    info.title,
                    info.uploader, // stored artist here
                    info.rawMetadata?.album || 'Unknown',
                    info.thumbnail
                );
            } else {
                const resolvedPlatform = platform || detectedPlatform || state.videoInfo.platform || null;
                const cookiesPath = resolvedPlatform
                    ? await CookieManagerService.getCookiesForPlatform(resolvedPlatform)
                    : null;

                if (cookiesPath) {
                    console.log(`[handleDownload] Using cookies for ${resolvedPlatform}: ${cookiesPath}`);
                } else if (resolvedPlatform && ['instagram', 'facebook'].includes(resolvedPlatform.toLowerCase())) {
                    console.warn(`[handleDownload] No cookie file found for ${resolvedPlatform} — private content may fail.`);
                }

                // ── YouTube Music: pre-download high-res album art for embedding ──
                let thumbnailPath: string | undefined;
                const isYTMusic = isYouTubeMusicUrl(state.videoInfo.url);
                if (isYTMusic && ytMusicAlbumArtUrl) {
                    try {
                        console.log('[handleDownload] Downloading YT Music album art to cache…');
                        thumbnailPath = await YtDlpNative.downloadThumbnailToCache(ytMusicAlbumArtUrl);
                        console.log('[handleDownload] Album art cached at:', thumbnailPath);
                    } catch (thumbErr) {
                        console.warn('[handleDownload] Failed to cache album art (non-fatal):', thumbErr);
                    }
                }

const result = await actions.download(
                    state.videoInfo.url,
                    typeof format === 'string' ? format : format.formatId,
                    {
                        title:         forceTitle || state.videoInfo.title,
                        artist:        state.videoInfo.uploader || 'Unknown',
                        platform:      resolvedPlatform || 'Unknown',
                        cookies:       cookiesPath || undefined,
thumbnailPath: thumbnailPath,
      audioFormatId: selectedAudioFormatId ?? undefined,
playerClient:   state.videoInfo.playerClient ?? undefined,
      }
    );
            }
        } catch (error: any) {
            console.error('Download error:', error);
            ToastAndroid.show(error?.message || 'Download failed', ToastAndroid.LONG);
        }
    }, [state.videoInfo, actions, detectedPlatform, ytMusicAlbumArtUrl, selectedAudioFormatId]);

    /**
     * Starts a cut download for the range chosen in the Cut sheet.
     *
     * Reuses the normal download path and only adds the in/out seconds, so
     * cookies, platform detection and metadata naming all behave identically.
     * The native side trims after the file lands, and publishes only the clip.
     */
    const handleCutConfirm = useCallback(
        async (selection: { start: number; end: number; formatId: string }) => {
            if (!state.videoInfo) return;

            setCutSheetVisible(false);

            const resolvedPlatform = detectedPlatform || state.videoInfo.platform || null;
            const cookiesPath = resolvedPlatform
                ? await CookieManagerService.getCookiesForPlatform(resolvedPlatform)
                : null;

            // Reflect the chosen output type in the quality list behind the sheet.
            setAudioOnlyIntent(selection.formatId.startsWith('audio'));

try {
                await actions.download(state.videoInfo.url, selection.formatId, {
                    title: state.videoInfo.title,
                    artist: state.videoInfo.uploader || 'Unknown',
                    platform: resolvedPlatform || 'Unknown',
cookies: cookiesPath || undefined,
    audioFormatId: selectedAudioFormatId ?? undefined,
    playerClient: state.videoInfo.playerClient ?? undefined,
    cutStart: selection.start,
                    cutEnd: selection.end,
                });
            } catch (error: any) {
                console.error('Cut download error:', error);
                ToastAndroid.show(error?.message || 'Cut download failed', ToastAndroid.LONG);
            }
        },
        [state.videoInfo, actions, detectedPlatform, selectedAudioFormatId]
    );

    /**
     * Starts recording a live broadcast.
     *
     * `maxDurationSeconds` is optional: without it the recording follows the
     * stream until the user cancels, which is the honest behaviour for a live
     * feed. `isLive` tells the hook not to apply the normal download timeout,
     * since the stream is still running rather than slow.
     */
    const handleLiveRecord = useCallback(
        async (maxDurationSeconds: number | undefined) => {
            if (!state.videoInfo) return;

            const resolvedPlatform = detectedPlatform || state.videoInfo.platform || null;
            const cookiesPath = resolvedPlatform
                ? await CookieManagerService.getCookiesForPlatform(resolvedPlatform)
                : null;

            setLiveRecording(true);
            setAudioOnlyIntent(false);
            try {
                await actions.download(state.videoInfo.url, 'best', {
                    title: state.videoInfo.title,
                    artist: state.videoInfo.uploader || 'Unknown',
                    platform: resolvedPlatform || 'Unknown',
                    cookies: cookiesPath || undefined,
                    isLive: true,
                    maxDurationSeconds,
                });
            } catch (error: any) {
                console.error('Live recording error:', error);
                ToastAndroid.show(error?.message || 'Recording failed', ToastAndroid.LONG);
            } finally {
                setLiveRecording(false);
            }
        },
        [state.videoInfo, actions, detectedPlatform]
    );

    const handleOpenLogin = useCallback(async () => {
        if (!detectedPlatform) return;

        const platform = (detectedPlatform.toLowerCase() === 'x' ? 'twitter' : detectedPlatform.toLowerCase());

        try {
            const result = await WebViewLoginNative.openLogin(platform);

            if (result.success && result.cookiePath) {
                // The native WebViewLoginActivity wrote the cookie file and
                // the WebView cookies are still live in Android's CookieManager.
                // Call extractAndSaveCookies() to:
                //   1. Re-extract those cookies from the CookieManager
                //   2. Save a fresh Netscape file via YtDlpNative.saveCookiesToFile()
                //   3. Persist the full cookie string to LocalDB
                // This is the critical fix: without step 3, after any APK update
                // the file path changes and there is nothing to restore from.
                try {
                    const platformUrl = {
                        instagram: 'https://www.instagram.com',
                        facebook:  'https://www.facebook.com',
                        youtube:   'https://www.youtube.com',
                        tiktok:    'https://www.tiktok.com',
                        twitter:   'https://twitter.com',
                        twitch:    'https://www.twitch.tv',
                    }[platform] ?? `https://www.${platform}.com`;
                    await CookieManagerService.extractAndSaveCookies(platform, platformUrl);
                    console.log(`[handleOpenLogin] Cookie string persisted to LocalDB for ${platform}`);
                } catch (extractErr) {
                    // Non-fatal: the file from the native activity still works right now.
                    // Legacy AsyncStorage keys below will act as fallback.
                    console.warn(`[handleOpenLogin] extractAndSaveCookies failed (non-fatal):`, extractErr);
                }

                // Keep the legacy AsyncStorage path key as a fallback for old code paths
                await AsyncStorage.setItem(`cookies_path_${platform}`, result.cookiePath);
                await AsyncStorage.setItem(
                    `cookies_expiry_${platform}`,
                    (Date.now() + 7 * 24 * 60 * 60 * 1000).toString()
                );

                ToastAndroid.show(`✅ ${detectedPlatform} login successful!`, ToastAndroid.SHORT);

                // Refresh login states
                const platforms = ['instagram', 'facebook', 'youtube', 'tiktok', 'twitter', 'x', 'twitch'];
                const states: Record<string, boolean> = {};
                for (const p of platforms) {
                    const cookie = await CookieManagerService.getCookiesForPlatform(p === 'x' ? 'twitter' : p);
                    states[p] = !!cookie;
                }
                setLoggedInPlatforms(states);
            }
        } catch (error: any) {
            if (error.code !== 'LOGIN_CANCELLED') {
                Alert.alert('Login Error', error.message || 'Failed to complete login');
            }
        }
    }, [detectedPlatform]);

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: currentTheme.background }]} edges={['top']}>
            <OfflineBanner onActionPress={onNavigateToLibrary} />
            <StatusBar barStyle="light-content" backgroundColor={currentTheme.background} animated />
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                {/* Modern Header */}
                <Animated.View
                    style={[
                        styles.header,
                        { opacity: headerFadeAnim, transform: [{ translateY: headerSlideAnim }] }
                    ]}
                >
                    <View style={styles.headerTop}>
                        <View style={styles.headerBrand}>
                            <View pointerEvents="none" style={styles.brandGlow} />
                            <Text style={styles.logo} allowFontScaling={false}>Vibe</Text>
                            <Text style={styles.logoAccent} allowFontScaling={false}>Downloader</Text>
                        </View>

                        {/* Header Actions */}
                        <View style={styles.headerActions}>
                            <DiscordButton compact />
                            <TouchableOpacity
                                onPress={() => setSettingsVisible(true)}
                                style={styles.headerBtn}
                            >
                                <SettingsIcon size={18} color={Colors.textSecondary} />
                            </TouchableOpacity>

                            {queue.length > 0 && (
                                <TouchableOpacity
                                    onPress={() => setQueuePanelVisible(true)}
                                    style={[styles.headerBtn, { borderColor: isQueueRunning ? platformColor : Colors.border }]}
                                >
                                    <View>
                                        <DownloadIcon size={18} color={isQueueRunning ? platformColor : Colors.textSecondary} />
                                        {queue.length > 0 && (
                                            <View style={[styles.queueBadge, { backgroundColor: isQueueRunning ? platformColor : Colors.textMuted }]}>
                                                <Text style={styles.queueBadgeText}>
                                                    {queue.length > 9 ? '9+' : queue.length}
                                                </Text>
                                            </View>
                                        )}
                                    </View>
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>
                    <View style={styles.taglineRow}>
                        <View style={[styles.taglineDotRing, { backgroundColor: platformColor + '26' }]}>
                            <View style={[styles.taglineDot, { backgroundColor: platformColor }]} />
                        </View>
                        <Text style={styles.tagline}>
                            Download from any platform, instantly
                        </Text>
                    </View>
                </Animated.View>

                {/* Platform Selector */}
                <PlatformSelector
                    selectedPlatform={detectedPlatform}
                    onSelectPlatform={(id) => {
                        setDetectedPlatform(id);
                        setUserSelectedPlatform(true); // Mark as manual selection
                        actions.reset();
                    }}
                    disabled={state.isLoading || state.isDownloading}
                />

                {/* Offline Mode Indicator */}
                {isOffline && (
                    <View style={styles.offlineContainer}>
                        <View style={styles.offlineHero}>
                            <View style={styles.offlineGlow} />
                            <Text style={styles.offlineIcon}>🌩️</Text>
                            <Text style={styles.offlineTitle}>Network Interrupted</Text>
                            <Text style={styles.offlineSubtitle}>
                                You are currently offline. Premium downloads are paused, but your Library remains fully accessible.
                            </Text>
                            {onNavigateToLibrary && (
                                <TouchableOpacity
                                    style={[styles.offlineBtn, { backgroundColor: Colors.primary }]}
                                    onPress={onNavigateToLibrary}
                                >
                                    <LibraryIcon size={18} color="#FFF" />
                                    <Text style={styles.offlineBtnText}>OPEN LIBRARY</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>
                )}

                {/* URL Input */}
                {!isOffline && (
                    <View style={styles.inputSection}>
                        <View style={styles.inputRow}>
                            <URLInput
                                value={url}
                                onChangeText={(text) => {
                                    setUrl(text);
                                    if (text.trim().length === 0) {
                                        setUserSelectedPlatform(false);
                                        setDetectedPlatform(null);
                                        actions.reset();
                                    }
                                }}
                                onSubmit={() => handleFetch(url)}
                                isLoading={state.isLoading}
                                onPaste={handlePaste}
                                platformColor={platformColor}
                                placeholder={
                                    ['instagram', 'facebook'].includes(detectedPlatform || '') 
                                        ? "Paste video link or @username for stories..." 
                                        : "Paste any video link..."
                                }
                            />
                        </View>

                        {/* Batch download: a labelled action next to the field it
                            relates to. As a bare header icon it was invisible. */}
                        <TouchableOpacity
                            style={styles.batchRow}
                            activeOpacity={0.7}
                            onPress={() => setBatchSheetVisible(true)}
                        >
                            <View style={[styles.batchIconWrap, { backgroundColor: `${platformColor}1F` }]}>
                                <LayersIcon size={18} color={platformColor} />
                            </View>
                            <View style={styles.batchTextWrap}>
                                <Text style={styles.batchTitle}>Batch Download</Text>
                                <Text style={styles.batchSubtitle} numberOfLines={1}>
                                    {queue.length > 0
                                        ? `${queue.length} in queue${isQueueRunning ? ' · downloading' : isPaused ? ' · paused' : ''}`
                                        : 'Queue several links at once'}
                                </Text>
                            </View>
                            <View style={styles.batchCta}>
                                <Text style={[styles.batchCtaText, { color: platformColor }]}>
                                    {queue.length > 0 ? 'OPEN' : 'START'}
                                </Text>
                                <ChevronRightIcon size={14} color={platformColor} />
                            </View>
                        </TouchableOpacity>

                        {detectedPlatform && ['instagram', 'facebook', 'youtube', 'tiktok', 'twitter', 'x', 'twitch'].includes(detectedPlatform.toLowerCase()) && (
                            <TouchableOpacity 
                                style={[
                                    styles.loginBanner, 
                                    { borderColor: loggedInPlatforms[detectedPlatform.toLowerCase()] ? 'rgba(76, 175, 80, 0.3)' : 'rgba(255, 255, 255, 0.1)' }
                                ]}
                                activeOpacity={0.8}
                                onPress={handleOpenLogin}
                            >
                                <View style={styles.loginBannerContent}>
                                    <View style={[
                                        styles.statusIndicator, 
                                        { backgroundColor: loggedInPlatforms[detectedPlatform] ? '#4CAF50' : Colors.textMuted }
                                    ]}>
                                        {loggedInPlatforms[detectedPlatform] && <View style={styles.statusPing} />}
                                    </View>
                                    <View style={styles.loginTextContainer}>
                                        <Text style={[
                                            styles.loginTitle,
                                            { color: loggedInPlatforms[detectedPlatform] ? '#4CAF50' : Colors.textPrimary }
                                        ]}>
                                            {loggedInPlatforms[detectedPlatform] 
                                                ? `${detectedPlatform.charAt(0).toUpperCase() + detectedPlatform.slice(1)} Session Active`
                                                : `Access Restricted Content`}
                                        </Text>
                                        <Text style={styles.loginSubtitle}>
                                            {(() => {
                                                const pName = detectedPlatform.charAt(0).toUpperCase() + detectedPlatform.slice(1);
                                                const isStory = ['instagram', 'facebook'].includes(detectedPlatform);
                                                
                                                if (loggedInPlatforms[detectedPlatform]) {
                                                    return isStory ? 'Ready to download stories and private posts.' : 'Private and age-restricted access enabled.';
                                                } else {
                                                    return isStory
                                                        ? `Login to ${pName} to download stories.`
                                                        : `Login to ${pName} for private content.`;
                                                }
                                            })()}
                                        </Text>
                                    </View>
                                </View>
                                <View style={[
                                    styles.loginActionBtn,
                                    { backgroundColor: loggedInPlatforms[detectedPlatform] ? 'rgba(76, 175, 80, 0.1)' : 'rgba(255, 255, 255, 0.05)' }
                                ]}>
                                    <Text style={[
                                        styles.loginActionText,
                                        { color: loggedInPlatforms[detectedPlatform] ? '#4CAF50' : Colors.textSecondary }
                                    ]}>
                                        {loggedInPlatforms[detectedPlatform] ? 'MANAGE' : 'LOGIN'}
                                    </Text>
                                </View>
                            </TouchableOpacity>
                        )}

                        {/* Removed Instagram Mode Toggle */}
                    </View>
                )}


                {/* Error Message */}
                {state.fetchError && (
                    <View style={styles.errorContainer}>
                        <Text style={styles.errorTitle}>⚠️ Unable to fetch</Text>
                        <Text style={styles.errorText}>{state.fetchError}</Text>
                    </View>
                )}

                {/* Download Progress */}
                {state.isDownloading && (
                    <View style={styles.progressSection}>
                        <DownloadProgress
                            progress={state.downloadProgress}
                            eta={state.downloadEta}
                            onCancel={handleCancelDownload}
                            title={state.videoInfo?.title}
                            platformColor={platformColor}
                            statusLine={state.downloadLine}
                        />
                    </View>
                )}

                {/* New Queue-based Batch Download is handled via handleBatchDownload -> addToQueue */}

                {/* Skeleton Loading - only while nothing at all is known yet */}
                {state.isLoading && !state.videoInfo && (
                    <View style={styles.videoSection}>
                        <SkeletonCard />
                    </View>
                )}

                {/* Video Info & Downloads */}
                {state.videoInfo && !state.isDownloading && (
                    <>
                        {/* ... Info Card ... */}
                        <View style={styles.videoSection}>
                            <VideoInfoCard
                                videoInfo={
                                    // If we have high-res YT Music album art, override the thumbnail
                                    // so the preview card shows the real album cover.
                                    ytMusicAlbumArtUrl
                                        ? { ...state.videoInfo, thumbnail: ytMusicAlbumArtUrl }
                                        : state.videoInfo
                                }
                                onSaveThumbnail={handleSaveThumbnail}
                                isMusic={isMusicTrack}
                            />
                            {/* A live broadcast replaces the ordinary download
                                controls: it has no duration and no end, so the
                                quality list would be misleading. */}
                            {state.videoInfo.isLive && (
                                <>
                                    <View style={styles.liveBadgeRow}>
                                        <LiveBadge platformColor={platformColor} />
                                        <Text style={styles.liveBadgeHint}>
                                            This channel is live right now
                                        </Text>
                                    </View>
                                    <LiveRecordBar
                                        platformColor={platformColor}
                                        onStart={handleLiveRecord}
                                        recording={liveRecording || state.isDownloading}
                                    />
                                </>
                            )}
                            {ytMusicAlbumArtUrl && (
                                <View style={styles.albumArtBadge}>
                                    <Text style={styles.albumArtBadgeText}>
                                        🎵 Real album art loaded
                                    </Text>
                                </View>
                            )}
                        </View>

                        {/* Lyrics — loading shimmer while the lookup is in-flight, matching desktop Downloader */}
                        {lyricsLoading ? (
                            <View style={styles.lyricsLoadingCard}>
                                <View style={styles.lyricsLoadingIconWrap}>
                                    <ActivityIndicator size="small" color="#A78BFA" />
                                </View>
                                <View style={styles.lyricsLoadingContent}>
                                    <Text style={styles.lyricsLoadingTitle}>Finding synchronized lyrics…</Text>
                                    <Text style={styles.lyricsLoadingSubtitle}>Looking up LRCLIB & NetEase</Text>
                                </View>
                            </View>
                        ) : null}

                        {/* Lyrics - rendered once a provider returned something */}
                        {lyrics ? (
                            <LyricsPanel
                                lyrics={lyrics}
                                defaultCollapsed={true}
                                metadata={{
                                    title: state.videoInfo.title,
                                    uploader: state.videoInfo.uploader || '',
                                    artist: state.videoInfo.artist || state.videoInfo.uploader || undefined,
                                    isMusic: isMusicTrack,
                                    duration: state.videoInfo.duration,
                                    platform: state.videoInfo.platform ?? undefined,
                                }}
                            />
                        ) : null}

                        {/* Subtitles — shown at top above formats, matching desktop Downloader */}
                        <SubtitlePicker
                            tracks={state.videoInfo.subtitles ?? []}
                            onDownload={handleDownloadSubtitles}
                            downloadingKey={downloadingSubtitleKey}
                            downloadedKey={downloadedSubtitleKey}
                        />

                        {/* Animated Skeleton Loading while formats are being resolved */}
                        {state.videoInfo.partial ? (
                            <FormatsSkeleton />
                        ) : state.videoInfo.isLive ? (
                            // Live streams are recorded through LiveRecordBar above;
                            // a quality list and a one-tap download would both
                            // misrepresent an unbounded stream.
                            null
                        ) : (
                            <>

                                {/* Quick Action - Platform Auto-Detect */}
                                <View style={styles.quickActionContainer}>
                                    <TouchableOpacity
                                        style={[styles.quickDownloadBtn, { backgroundColor: platformColor }]}
                                        onPress={() => {
                                            // YouTube Music and other audio platforms default to MP3
                                            const isAudioPlatform =
                                                detectedPlatform === 'spotify' ||
                                                detectedPlatform === 'soundcloud' ||
                                                isYouTubeMusicUrl(state.videoInfo?.url ?? '');
                                            handleDownload(isAudioPlatform ? 'audio_mp3' : 'best');
                                        }}
                                    >
                                        <DownloadIcon size={20} color="#FFF" />
                                        <Text style={styles.quickDownloadText}>
                                            Quick Download
                                        </Text>
                                    </TouchableOpacity>

                                    {/* Cut & Download — needs a known duration to
                                        pick a range, so it waits for the full
                                        metadata instead of the oEmbed preview. */}
                                    {state.videoInfo.duration > 0 && (
                                        <TouchableOpacity
                                            style={[styles.cutBtn, { borderColor: platformColor }]}
                                            onPress={() => setCutSheetVisible(true)}
                                            activeOpacity={0.75}
                                            accessibilityLabel="Cut and download a clip"
                                        >
                                            <ScissorsIcon size={18} color={platformColor} />
                                            <View style={styles.cutBtnTextWrap}>
                                                <Text style={styles.cutBtnText}>Cut &amp; Download</Text>
                                                <Text style={styles.cutBtnHint}>
                                                    Save only part of this {formatDuration(state.videoInfo.duration)}
                                                </Text>
                                            </View>
                                            <ChevronRightIcon size={16} color={Colors.textMuted} />
                                        </TouchableOpacity>
                                    )}
                                </View>

                                <AudioTrackSelector
                                    tracks={state.videoInfo.audioTracks ?? []}
                                    selectedId={selectedAudioFormatId}
                                    onSelect={handleSelectAudioTrack}
                                    isAudioOnly={audioOnlyIntent}
                                />

                                <FormatList
formats={state.videoInfo.formats}
    onSelectFormat={handleDownload}
    platformColor={platformColor}
    platform={detectedPlatform ?? state.videoInfo.platform}
    />
                            </>
                        )}
                    </>
                )}

                {/* Animated Empty State */}
                {!state.videoInfo && !state.isLoading && !state.fetchError && !url && (
                    <EmptyState 
                        platform={detectedPlatform} 
                        isOffline={isOffline} 
                        isLoggedIn={!!(detectedPlatform && loggedInPlatforms[detectedPlatform.toLowerCase() || ''])}
                    />
                )}

                {/* Playlist Modal */}
                <PlaylistSelectionModal
                    visible={playlistModalVisible}
                    onClose={() => setPlaylistModalVisible(false)}
                    onDownload={handleBatchDownload}
                    playlistTitle={playlistTitle}
                    playlistImage={playlistImage}
                    items={playlistItems}
                    platformColor={platformColor}
                    isLoading={isPlaylistLoading}
                    onItemPress={handlePlaylistItemPress}
                />

                {/* Update Modal */}
                {updateInfo && (
                    <UpdateModal
                        visible={updateModalVisible}
                        onClose={() => setUpdateModalVisible(false)}
                        version={updateInfo.version}
                        releaseUrl={updateInfo.releaseUrl}
                        downloadUrl={updateInfo.downloadUrl}
                        features={updateInfo.features}
                    />
                )}

                {/* Settings Modal */}
                <SettingsModal
                    visible={settingsVisible}
                    onClose={() => setSettingsVisible(false)}
                    appVersion={require('../../package.json').version}
                />

                {/* Login Webview Modal */}

                <View style={{ height: 100 }} />
            </ScrollView>
            <DownloadQueuePanel
                visible={queuePanelVisible}
                onClose={() => setQueuePanelVisible(false)}
                queue={queue}
                isRunning={isQueueRunning}
                isPaused={isPaused}
                totalDone={totalDone}
                totalFailed={totalFailed}
                overallPercent={stats.overallPercent}
                platformColor={platformColor}
                onCancelItem={cancelItem}
                onCancelAll={cancelAll}
                onClearQueue={clearQueue}
                onRetryItem={retryItem}
                onRetryFailed={retryFailed}
                onPause={pause}
                onResume={resume}
            />

            {/* The hook sets this when a requested trim fails but a usable
                full-length file was still saved, so surface it instead of
                leaving it in state where nobody can see it. */}
            {state.cutWarning && (
                <View style={styles.cutWarningBanner}>
                    <WarningIcon size={16} color={Colors.warning} />
                    <Text style={styles.cutWarningText}>{state.cutWarning}</Text>
                </View>
            )}

            <BatchDownloadSheet
                visible={batchSheetVisible}
                onClose={() => setBatchSheetVisible(false)}
                onStart={handleStartBatch}
            />

            <CutDownloadSheet
                visible={cutSheetVisible}
                videoInfo={state.videoInfo}
                initialFormatId={selectedAudioFormatId}
                onClose={() => setCutSheetVisible(false)}
                onConfirm={handleCutConfirm}
            />
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        // extra room so content isn't hidden under the floating bottom nav
        paddingBottom: 120,
    },
    // ── Modern Header ──
    header: {
        paddingTop: Spacing.lg,
        paddingBottom: Spacing.md,
        paddingHorizontal: Spacing.lg,
    },
    headerTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        width: '100%',
    },
    headerBrand: {
        flexDirection: 'row',
        alignItems: 'center',
        position: 'relative',
    },
    // soft brand-colored halo behind the wordmark
    brandGlow: {
        position: 'absolute',
        left: -18,
        top: -10,
        width: 120,
        height: 56,
        borderRadius: 60,
        backgroundColor: Colors.primary,
        opacity: 0.1,
    },
    logo: {
        fontSize: 28,
        lineHeight: 34,
        fontWeight: '900',
        color: Colors.textPrimary,
        letterSpacing: -1.4,
        includeFontPadding: false,
    },
    // contrast in weight + tint gives the wordmark a refined two-tone feel
    logoAccent: {
        fontSize: 28,
        lineHeight: 34,
        fontWeight: '300',
        color: Colors.primaryLight,
        letterSpacing: -1.1,
        includeFontPadding: false,
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    headerBtn: {
        width: 42,
        height: 42,
        borderRadius: 14,
        backgroundColor: 'rgba(255, 255, 255, 0.045)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: StyleSheet.hairlineWidth * 2,
        borderColor: 'rgba(255, 255, 255, 0.10)',
    },
    batchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginTop: 10,
        paddingVertical: 11,
        paddingHorizontal: 12,
        borderRadius: 16,
        backgroundColor: '#161618',
        borderWidth: 1,
        borderColor: '#252528',
    },
    batchRowPressed: {
        opacity: 0.7,
        transform: [{ scale: 0.995 }],
    },
    batchIconWrap: {
        width: 34,
        height: 34,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
    },
    batchTextWrap: { flex: 1 },
    batchTitle: {
        color: Colors.textPrimary,
        fontSize: 14,
        fontWeight: '700',
        letterSpacing: -0.1,
    },
    batchSubtitle: {
        color: Colors.textMuted,
        fontSize: 11.5,
        marginTop: 1,
    },
    batchCta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        paddingLeft: 8,
    },
    batchCtaText: {
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 0.6,
    },
    taglineRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 8,
    },
    taglineDotRing: {
        width: 12,
        height: 12,
        borderRadius: 6,
        alignItems: 'center',
        justifyContent: 'center',
    },
    taglineDot: {
        width: 5,
        height: 5,
        borderRadius: 3,
    },
    tagline: {
        color: '#7C7C88',
        fontSize: 12.5,
        lineHeight: 16,
        fontWeight: '500',
        letterSpacing: 0.25,
        includeFontPadding: false,
    },
    // ── Input Section ──
    inputSection: {
        marginTop: Spacing.md,
        paddingHorizontal: Spacing.md,
    },
    inputRow: {
        marginBottom: Spacing.sm,
    },
    // ── Quick Action ──
    quickActionContainer: {
        marginHorizontal: Spacing.md,
        marginTop: Spacing.md,
    },
    quickDownloadBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        borderRadius: 16,
        gap: Spacing.sm,
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 8,
    },
quickDownloadText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
    },
    cutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: 16,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    },
    cutBtnTextWrap: { flex: 1 },
    cutBtnText: {
    color: Colors.textPrimary,
    fontSize: Typography.sizes.sm,
    fontWeight: '700',
    },
    cutBtnHint: {
    color: Colors.textMuted,
    fontSize: Typography.sizes.xxs,
    marginTop: 2,
    },
    // ── Error ──
    errorContainer: {
        marginHorizontal: Spacing.md,
        marginTop: Spacing.md,
        backgroundColor: `${Colors.error}08`,
        borderRadius: 16,
        padding: Spacing.md,
        borderWidth: 1,
        borderColor: `${Colors.error}25`,
    },
    errorTitle: {
        color: Colors.error,
        fontSize: 14,
        fontWeight: '700',
        marginBottom: 4,
    },
    errorText: {
        color: Colors.errorLight,
        fontSize: 13,
        lineHeight: 18,
    },
    // ── Progress ──
    progressSection: {
        marginTop: Spacing.lg,
    },
videoSection: {
marginTop: Spacing.xl,
marginHorizontal: Spacing.md,
    },
    liveBadgeRow: {
flexDirection: 'row',
alignItems: 'center',
gap: Spacing.sm,
marginHorizontal: Spacing.md,
marginTop: Spacing.sm,
    },
    liveBadgeHint: {
fontSize: Typography.sizes.xs,
color: Colors.textMuted,
    },
    cutWarningBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        marginHorizontal: Spacing.md,
        marginTop: Spacing.sm,
        padding: Spacing.sm,
        borderRadius: BorderRadius.md,
        backgroundColor: `${Colors.warning}1A`,
        borderWidth: 1,
        borderColor: `${Colors.warning}44`,
    },
    cutWarningText: {
        flex: 1,
        fontSize: Typography.sizes.xs,
        color: Colors.textSecondary,
        lineHeight: 17,
    },
    lyricsLoadingCard: {
        marginHorizontal: Spacing.md,
        marginTop: Spacing.md,
        padding: Spacing.md,
        borderRadius: BorderRadius.xl,
        backgroundColor: 'rgba(139, 92, 246, 0.10)',
        borderWidth: 1,
        borderColor: 'rgba(167, 139, 250, 0.28)',
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
    },
    lyricsLoadingIconWrap: {
        width: 34,
        height: 34,
        borderRadius: BorderRadius.lg,
        backgroundColor: 'rgba(167, 139, 250, 0.18)',
        borderWidth: 1,
        borderColor: 'rgba(167, 139, 250, 0.35)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    lyricsLoadingContent: {
        flex: 1,
        gap: 2,
    },
    lyricsLoadingTitle: {
        color: '#E9D5FF',
        fontSize: 13,
        fontWeight: '700',
    },
    lyricsLoadingSubtitle: {
        color: 'rgba(233, 213, 255, 0.6)',
        fontSize: 11,
    },
    // ── Downloads ──
    downloadHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        marginTop: Spacing.xl,
        marginBottom: Spacing.md,
        marginHorizontal: Spacing.md,
        paddingHorizontal: Spacing.sm,
    },
    downloadHeaderText: {
        color: Colors.textMuted,
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 1.5,
    },
    // ── Offline ──
    offlineContainer: {
        marginHorizontal: Spacing.md,
        marginTop: Spacing.xl,
        backgroundColor: `${Colors.surfaceElevated}`,
        borderRadius: BorderRadius.xl,
        borderWidth: 1,
        borderColor: Colors.border,
        padding: Spacing.xl,
        alignItems: 'center',
        ...Shadows.lg,
    },
    offlineHero: {
        alignItems: 'center',
        gap: Spacing.md,
    },
    offlineIcon: {
        fontSize: 48,
        marginBottom: Spacing.sm,
    },
    offlineTitle: {
        color: Colors.textPrimary,
        fontSize: 22,
        fontWeight: '800',
        textAlign: 'center',
    },
    offlineSubtitle: {
        color: Colors.textMuted,
        fontSize: 14,
        textAlign: 'center',
        lineHeight: 22,
        maxWidth: 280,
    },
    offlineWarning: {
        color: Colors.error,
        fontSize: 10,
        fontWeight: '900',
        letterSpacing: 2,
        marginTop: 20,
    },
    offlineActionRow: {
        marginTop: 24,
    },
    offlineGlow: {
        position: 'absolute',
        width: 200,
        height: 200,
        borderRadius: 100,
        backgroundColor: Colors.error,
        opacity: 0.05,
    },
    offlineBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 12,
        marginTop: 12,
        gap: 8,
        ...Shadows.md,
    },
    offlineBtnText: {
        color: '#FFF',
        fontSize: 14,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    queueBadge: {
        position: 'absolute',
        top: -6,
        right: -6,
        width: 16,
        height: 16,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    queueBadgeText: {
        color: '#FFF',
        fontSize: 9,
        fontWeight: '800',
    },
    loginBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: Colors.surfaceElevated,
        marginHorizontal: 0,
        marginTop: Spacing.md,
        padding: 12,
        borderRadius: 16,
        borderWidth: 1,
        ...Shadows.sm,
    },
    loginBannerContent: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    statusIndicator: {
        width: 10,
        height: 10,
        borderRadius: 5,
        marginRight: 14,
        position: 'relative',
    },
    statusPing: {
        position: 'absolute',
        top: -2,
        left: -2,
        right: -2,
        bottom: -2,
        borderRadius: 10,
        backgroundColor: '#4CAF50',
        opacity: 0.3,
    },
    loginTextContainer: {
        flex: 1,
    },
    loginTitle: {
        fontSize: 13,
        fontWeight: '800',
        letterSpacing: 0.2,
        marginBottom: 1,
    },
    loginSubtitle: {
        fontSize: 11,
        color: Colors.textMuted,
        fontWeight: '500',
    },
    loginActionBtn: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    loginActionText: {
        fontSize: 11,
        fontWeight: '900',
        letterSpacing: 0.5,
    },
    // YouTube Music album art badge shown below the VideoInfoCard
    albumArtBadge: {
        alignSelf: 'center',
        marginTop: 6,
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 20,
        backgroundColor: 'rgba(255, 87, 34, 0.12)',
        borderWidth: 1,
        borderColor: 'rgba(255, 87, 34, 0.3)',
    },
    albumArtBadgeText: {
        color: '#FF5722',
        fontSize: 11,
        fontWeight: '600' as const,
        letterSpacing: 0.3,
    },
    modeToggleContainer: {
        flexDirection: 'row',
        backgroundColor: 'rgba(0,0,0,0.15)',
        borderRadius: 14,
        padding: 4,
        marginTop: Spacing.md,
        alignSelf: 'center',
        width: '100%',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    modeBtn: {
        flex: 1,
        paddingVertical: 10,
        alignItems: 'center',
        borderRadius: 11,
    },
    modeBtnActive: {
        backgroundColor: Colors.surfaceElevated,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        ...Shadows.sm,
    },
    modeBtnText: {
        color: Colors.textMuted,
        fontSize: 13,
        fontWeight: '700',
    },
    modeBtnTextActive: {
        color: Colors.textPrimary,
    },
});

export default HomeScreen;
