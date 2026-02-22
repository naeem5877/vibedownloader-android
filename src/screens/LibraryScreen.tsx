/**
 * LibraryScreen - Modern File Management for Downloaded Media
 * Displays all downloaded files organized by platform with actions like play, share, delete
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
    View,
    Text,
    FlatList,
    StyleSheet,
    TouchableOpacity,
    Image,
    Alert,
    ToastAndroid,
    StatusBar,
    Animated,
    Dimensions,
    RefreshControl,
    Modal,
    Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, BorderRadius, Spacing, Typography, Shadows, getPlatformColor } from '../theme';
import {
    FolderIcon,
    PlayIcon,
    ShareIcon,
    TrashIcon,
    DownloadIcon,
    ChevronRightIcon,
    InfoIcon,
    RefreshIcon,
    CloseIcon,
    VideoIcon,
    MusicIcon,
    ImageIcon,
} from '../components/Icons';
import { EmptyState } from '../components/EmptyState';
import { YtDlpNative, formatFileSize } from '../native/YtDlpModule';
import { Haptics } from '../utils/haptics';

const { width } = Dimensions.get('window');

// Types
interface DownloadedFile {
    name: string;
    path: string;
    size: number;
    modified: number;
    platform: string;
    contentType: string;
    extension: string;
    thumbnail?: string;
}

interface PlatformFolder {
    platform: string;
    contentTypes: {
        type: string;
        files: DownloadedFile[];
        count: number;
    }[];
    totalCount: number;
    totalSize: number;
}

interface PlatformStorageUsage {
    platform: string;
    size: number;
    color: string;
}

// Storage Info Component
const StorageInfoCard: React.FC<{ basePath: string; onPress: () => void }> = ({ basePath, onPress }) => {
    return (
        <TouchableOpacity style={styles.storageCard} onPress={onPress} activeOpacity={0.8}>
            <View style={styles.storageIconContainer}>
                <View style={[styles.storageIconGlow, { backgroundColor: Colors.primary }]} />
                <FolderIcon size={20} color={Colors.primary} />
            </View>
            <View style={styles.storageInfo}>
                <Text style={styles.storageTitle}>STORAGE SYSTEM</Text>
                <Text style={styles.storagePath} numberOfLines={1}>
                    {basePath || 'Internal Storage'}
                </Text>
            </View>
            <View style={styles.storageAction}>
                <ChevronRightIcon size={16} color={Colors.textMuted} />
            </View>
        </TouchableOpacity>
    );
};

// Individual storage item component for proper hooks usage
const PlatformStorageItem: React.FC<{
    platform: PlatformStorageUsage;
    maxSize: number;
    index: number;
}> = ({ platform, maxSize, index }) => {
    const percentage = (platform.size / maxSize) * 100;
    const widthAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.spring(widthAnim, {
            toValue: percentage,
            tension: 50,
            friction: 10,
            delay: index * 80,
            useNativeDriver: false, // width is not supported by native driver
        }).start();
    }, [percentage, index]);

    return (
        <View style={styles.platformStorageItem}>
            <View style={styles.platformStorageItemHeader}>
                <View style={styles.platformStorageItemLeft}>
                    <View style={[styles.platformDot, { backgroundColor: platform.color }]} />
                    <Text style={styles.platformStorageItemName}>{platform.platform}</Text>
                </View>
                <Text style={styles.platformStorageItemSize}>
                    {formatFileSize(platform.size)}
                </Text>
            </View>
            <View style={styles.platformStorageBar}>
                <Animated.View
                    style={[
                        styles.platformStorageBarFill,
                        {
                            backgroundColor: platform.color,
                            width: widthAnim.interpolate({
                                inputRange: [0, 100],
                                outputRange: ['0%', '100%']
                            })
                        }
                    ]}
                />
            </View>
        </View>
    );
};

const PlatformStorageUsageCard: React.FC<{ folders: PlatformFolder[] }> = ({ folders }) => {
    const totalSize = folders.reduce((sum, f) => sum + f.totalSize, 0);

    if (totalSize === 0) return null;

    // Sort by size descending
    const sortedPlatforms: PlatformStorageUsage[] = folders
        .map(f => ({
            platform: f.platform,
            size: f.totalSize,
            color: getPlatformColor(f.platform)
        }))
        .sort((a, b) => b.size - a.size);

    const maxSize = sortedPlatforms[0]?.size || 1;

    return (
        <View style={styles.platformStorageCard}>
            <View style={styles.platformStorageHeader}>
                <View style={styles.platformStorageHeaderLeft}>
                    <Text style={styles.platformStorageTitle}>DISTRIBUTION</Text>
                </View>
                <Text style={styles.platformStorageTotal}>{formatFileSize(totalSize)}</Text>
            </View>

            <View style={styles.platformStorageList}>
                {sortedPlatforms.slice(0, 4).map((platform, index) => (
                    <PlatformStorageItem
                        key={platform.platform}
                        platform={platform}
                        maxSize={maxSize}
                        index={index}
                    />
                ))}
            </View>
        </View>
    );
};


// Platform Folder Card Component
const PlatformFolderCard: React.FC<{
    folder: PlatformFolder;
    onPress: () => void;
    expanded: boolean;
}> = ({ folder, onPress, expanded }) => {
    const platformColor = getPlatformColor(folder.platform);
    const rotateAnim = useRef(new Animated.Value(expanded ? 1 : 0)).current;

    useEffect(() => {
        Animated.spring(rotateAnim, {
            toValue: expanded ? 1 : 0,
            tension: 50,
            friction: 8,
            useNativeDriver: true,
        }).start();
    }, [expanded]);

    const rotation = rotateAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '90deg'],
    });

    return (
        <TouchableOpacity
            style={[styles.folderCard, expanded && { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }]}
            onPress={onPress}
            activeOpacity={0.8}
        >
            <View style={[styles.folderIconBg, { backgroundColor: `${platformColor}15` }]}>
                <FolderIcon size={20} color={platformColor} />
            </View>

            <View style={styles.folderInfo}>
                <Text style={styles.folderName}>{folder.platform.toUpperCase()}</Text>
                <Text style={styles.folderMeta}>
                    {folder.totalCount} ITEMS • {formatFileSize(folder.totalSize)}
                </Text>
            </View>

            <Animated.View style={{ transform: [{ rotate: rotation }] }}>
                <ChevronRightIcon size={18} color={Colors.textMuted} />
            </Animated.View>
        </TouchableOpacity>
    );
};

// Content Type Row Component
const ContentTypeRow: React.FC<{
    type: string;
    files: DownloadedFile[];
    platformColor: string;
    onFilePress: (file: DownloadedFile) => void;
}> = ({ type, files, platformColor, onFilePress }) => {
    return (
        <View style={styles.contentTypeContainer}>
            <View style={styles.contentTypeHeader}>
                <View style={styles.contentTypeLine} />
                <Text style={[styles.contentTypeText, { color: platformColor }]}>
                    {type.toUpperCase()}
                </Text>
                <View style={styles.contentTypeLine} />
            </View>

            <FlatList
                data={files}
                horizontal
                showsHorizontalScrollIndicator={false}
                keyExtractor={(item) => item.path}
                renderItem={({ item }) => (
                    <FileCard file={item} onPress={() => onFilePress(item)} />
                )}
                contentContainerStyle={styles.horizontalFileList}
            />
        </View>
    );
};

// File Card Component
const FileCard: React.FC<{
    file: DownloadedFile;
    onPress: () => void;
}> = ({ file, onPress }) => {
    const isVideo = ['mp4', 'webm', 'mkv'].includes(file.extension.toLowerCase());
    const isAudio = ['mp3', 'm4a', 'wav', 'aac', 'flac'].includes(file.extension.toLowerCase());
    const isImage = ['jpg', 'jpeg', 'png', 'webp'].includes(file.extension.toLowerCase());
    const isLossless = file.extension.toLowerCase() === 'flac';

    const getIcon = () => {
        if (isVideo) return <VideoIcon size={20} color={Colors.textSecondary} />;
        if (isAudio) return <MusicIcon size={20} color={Colors.textSecondary} />;
        if (isImage) return <ImageIcon size={20} color={Colors.textSecondary} />;
        return <DownloadIcon size={20} color={Colors.textSecondary} />;
    };

    return (
        <TouchableOpacity
            style={[
                styles.fileCard,
                isLossless && { borderColor: Colors.lossless, borderWidth: 1 }
            ]}
            onPress={onPress}
            activeOpacity={0.8}
        >
            <View style={styles.fileThumbnail}>
                {file.thumbnail ? (
                    <Image source={{ uri: file.thumbnail }} style={styles.thumbnailImage} />
                ) : (
                    <View style={[styles.filePlaceholder, isLossless && { backgroundColor: `${Colors.lossless}10` }]}>
                        {isLossless ? <MusicIcon size={22} color={Colors.lossless} /> : getIcon()}
                    </View>
                )}
                <View style={styles.fileCardOverlay} />
                {isVideo && (
                    <View style={styles.playOverlaySmall}>
                        <PlayIcon size={14} color={Colors.textPrimary} />
                    </View>
                )}
                {isLossless && (
                    <View style={styles.losslessBadgeSmall}>
                        <Text style={styles.losslessBadgeTextSmall}>FLAC</Text>
                    </View>
                )}
            </View>
            <View style={styles.fileCardInfo}>
                <Text style={styles.fileName} numberOfLines={1}>{file.name}</Text>
                <Text style={styles.fileSize}>{formatFileSize(file.size)}</Text>
            </View>
        </TouchableOpacity>
    );
};

// File Detail Modal
const FileDetailModal: React.FC<{
    visible: boolean;
    file: DownloadedFile | null;
    onClose: () => void;
    onPlay: () => void;
    onShare: () => void;
    onDelete: () => void;
}> = ({ visible, file, onClose, onPlay, onShare, onDelete }) => {
    if (!file) return null;

    const platformColor = getPlatformColor(file.platform);
    const isVideo = ['mp4', 'webm', 'mkv'].includes(file.extension.toLowerCase());
    const isAudio = ['mp3', 'm4a', 'wav', 'aac', 'flac'].includes(file.extension.toLowerCase());
    const isLossless = file.extension.toLowerCase() === 'flac';

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
        >
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle} numberOfLines={2}>{file.name}</Text>
                        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                            <CloseIcon size={24} color={Colors.textMuted} />
                        </TouchableOpacity>
                    </View>

                    {/* File Preview */}
                    <View style={[
                        styles.modalPreview,
                        { borderColor: isLossless ? Colors.lossless : platformColor },
                        isLossless && { backgroundColor: `${Colors.lossless}05` }
                    ]}>
                        {file.thumbnail ? (
                            <Image source={{ uri: file.thumbnail }} style={styles.modalThumbnail} />
                        ) : (
                            <View style={styles.modalPlaceholder}>
                                {isVideo ? (
                                    <VideoIcon size={48} color={platformColor} />
                                ) : isAudio ? (
                                    <MusicIcon size={48} color={isLossless ? Colors.lossless : platformColor} />
                                ) : (
                                    <DownloadIcon size={48} color={platformColor} />
                                )}
                            </View>
                        )}
                        {isLossless && (
                            <View style={styles.losslessBadgeLarge}>
                                <Text style={styles.losslessBadgeTextLarge}>LOSSLESS AUDIO • FLAC</Text>
                            </View>
                        )}
                    </View>

                    {/* File Info */}
                    <View style={styles.fileInfoSection}>
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Platform</Text>
                            <View style={[styles.platformBadge, { backgroundColor: `${platformColor}20` }]}>
                                <Text style={[styles.platformBadgeText, { color: platformColor }]}>
                                    {file.platform}
                                </Text>
                            </View>
                        </View>
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Type</Text>
                            <Text style={styles.infoValue}>{file.contentType}</Text>
                        </View>
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Size</Text>
                            <Text style={styles.infoValue}>{formatFileSize(file.size)}</Text>
                        </View>
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Format</Text>
                            <Text style={styles.infoValue}>{file.extension.toUpperCase()}</Text>
                        </View>
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Location</Text>
                            <Text style={[styles.infoValue, styles.pathText]} numberOfLines={2}>
                                {file.path}
                            </Text>
                        </View>
                    </View>

                    {/* Actions */}
                    <View style={styles.modalActions}>
                        {(isVideo || isAudio) && (
                            <TouchableOpacity
                                style={[styles.actionButton, { backgroundColor: platformColor }]}
                                onPress={onPlay}
                            >
                                <PlayIcon size={20} color={Colors.textPrimary} />
                                <Text style={styles.actionButtonText}>Play</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity
                            style={[styles.actionButton, styles.shareButton]}
                            onPress={onShare}
                        >
                            <ShareIcon size={20} color={Colors.textPrimary} />
                            <Text style={styles.actionButtonText}>Share</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.actionButton, styles.deleteButton]}
                            onPress={onDelete}
                        >
                            <TrashIcon size={20} color={Colors.textPrimary} />
                            <Text style={styles.actionButtonText}>Delete</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

// Storage Info Modal
const StorageInfoModal: React.FC<{
    visible: boolean;
    basePath: string;
    onClose: () => void;
}> = ({ visible, basePath, onClose }) => {
    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <TouchableOpacity
                style={styles.modalOverlay}
                activeOpacity={1}
                onPress={onClose}
            >
                <View style={styles.infoModalContent}>
                    <View style={styles.infoModalHeader}>
                        <InfoIcon size={24} color={Colors.primary} />
                        <Text style={styles.infoModalTitle}>Storage Information</Text>
                    </View>

                    <View style={styles.infoSection}>
                        <Text style={styles.infoSectionTitle}>📁 Where are files saved?</Text>
                        <Text style={styles.infoSectionText}>
                            On Android 11+, files are saved to app-specific storage for better compatibility:
                        </Text>
                        <View style={styles.pathBox}>
                            <Text style={styles.pathBoxText}>{basePath || '/Android/data/com.vibedownloadermobile/files/vibedownloader'}</Text>
                        </View>
                    </View>

                    <View style={styles.infoSection}>
                        <Text style={styles.infoSectionTitle}>📱 Folder Structure</Text>
                        <Text style={styles.infoSectionText}>
                            Files are organized by platform and content type:
                        </Text>
                        <View style={styles.folderStructure}>
                            <Text style={styles.structureItem}>📂 vibedownloader/</Text>
                            <Text style={styles.structureItem}>   📂 YouTube/</Text>
                            <Text style={styles.structureItem}>      📂 Videos/</Text>
                            <Text style={styles.structureItem}>      📂 Shorts/</Text>
                            <Text style={styles.structureItem}>      📂 Music/</Text>
                            <Text style={styles.structureItem}>   📂 Instagram/</Text>
                            <Text style={styles.structureItem}>      📂 Reels/</Text>
                            <Text style={styles.structureItem}>      📂 Posts/</Text>
                            <Text style={styles.structureItem}>   📂 TikTok/</Text>
                            <Text style={styles.structureItem}>   ...</Text>
                        </View>
                    </View>

                    <View style={styles.infoSection}>
                        <Text style={styles.infoSectionTitle}>🖼️ Gallery Access</Text>
                        <Text style={styles.infoSectionText}>
                            Videos and images are also added to your Gallery app for easy access!
                        </Text>
                    </View>

                    <TouchableOpacity style={styles.gotItButton} onPress={onClose}>
                        <Text style={styles.gotItText}>Got it!</Text>
                    </TouchableOpacity>
                </View>
            </TouchableOpacity>
        </Modal>
    );
};

// Main Library Screen
export interface LibraryScreenProps {
    isFocused?: boolean;
}

export const LibraryScreen: React.FC<LibraryScreenProps> = ({ isFocused = false }) => {
    const [folders, setFolders] = useState<PlatformFolder[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({}); // Changed from expandedPlatform
    const [basePath, setBasePath] = useState<string>('');
    const [selectedFile, setSelectedFile] = useState<DownloadedFile | null>(null);
    const [showFileModal, setShowFileModal] = useState(false);
    const [showStorageInfo, setShowStorageInfo] = useState(false);
    // Keeping isEmpty as it was not explicitly removed in the instruction's state list,
    // but the instruction's `loadFiles` was a placeholder.
    const [isEmpty, setIsEmpty] = useState(false);

    const headerFadeAnim = useRef(new Animated.Value(0)).current;
    const headerSlideAnim = useRef(new Animated.Value(-20)).current;

    useEffect(() => {
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

        loadFiles();
        loadBasePath();
    }, []);

    // Auto-refresh when focused
    useEffect(() => {
        if (isFocused) {
            loadFiles();
        }
    }, [isFocused]);

    const loadBasePath = async () => {
        try {
            const path = await YtDlpNative.getOutputDirectory();
            setBasePath(path);
        } catch (error) {
            console.warn('Failed to get output directory:', error);
        }
    };

    const loadFiles = async () => {
        try {
            setRefreshing(true);
            const files = await YtDlpNative.listDownloadedFiles();

            if (!files || files.length === 0) {
                setIsEmpty(true);
                setFolders([]);
                return;
            }

            setIsEmpty(false);

            // Group files by platform and content type
            const platformMap = new Map<string, Map<string, DownloadedFile[]>>();

            files.forEach((file: any) => {
                const platform = file.platform || 'Unknown';
                const contentType = file.contentType || 'Downloads';

                if (!platformMap.has(platform)) {
                    platformMap.set(platform, new Map());
                }
                const typeMap = platformMap.get(platform)!;
                if (!typeMap.has(contentType)) {
                    typeMap.set(contentType, []);
                }
                typeMap.get(contentType)!.push({
                    ...file,
                    extension: file.name.split('.').pop() || 'unknown',
                });
            });

            // Convert to folder structure
            const folderData: PlatformFolder[] = [];
            platformMap.forEach((typeMap, platform) => {
                const contentTypes: { type: string; files: DownloadedFile[]; count: number }[] = [];
                let totalCount = 0;
                let totalSize = 0;

                typeMap.forEach((files, type) => {
                    contentTypes.push({
                        type,
                        files: files.sort((a, b) => b.modified - a.modified),
                        count: files.length,
                    });
                    totalCount += files.length;
                    totalSize += files.reduce((sum, f) => sum + f.size, 0);
                });

                folderData.push({
                    platform,
                    contentTypes,
                    totalCount,
                    totalSize,
                });
            });

            // Sort by total count descending
            folderData.sort((a, b) => b.totalCount - a.totalCount);
            setFolders(folderData);

        } catch (error) {
            console.error('Failed to load files:', error);
            setIsEmpty(true);
        } finally {
            setRefreshing(false);
        }
    };

    const handleRefresh = useCallback(() => {
        loadFiles();
    }, []);

    const togglePlatformExpand = (platform: string) => {
        setExpandedFolders(prev => ({
            ...prev,
            [platform]: !prev[platform]
        }));
    };

    const handleFilePress = (file: DownloadedFile) => {
        setSelectedFile(file);
        setShowFileModal(true);
    };

    const handlePlay = async () => {
        if (!selectedFile) return;
        try {
            await YtDlpNative.openFile?.(selectedFile.path);
        } catch (error) {
            ToastAndroid.show('Unable to play file', ToastAndroid.SHORT);
        }
        setShowFileModal(false);
    };

    const handleShare = async () => {
        if (!selectedFile) return;
        try {
            await YtDlpNative.shareFile?.(selectedFile.path);
        } catch (error) {
            ToastAndroid.show('Unable to share file', ToastAndroid.SHORT);
        }
        setShowFileModal(false);
    };

    const handleDelete = () => {
        if (!selectedFile) return;
        Haptics.impact();

        Alert.alert(
            'Delete File',
            `Are you sure you want to delete "${selectedFile.name}"?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const deleted = await YtDlpNative.deleteFile(selectedFile.path);
                            if (deleted) {
                                Haptics.success();
                                ToastAndroid.show('File deleted', ToastAndroid.SHORT);
                                loadFiles();
                            } else {
                                Haptics.error();
                                ToastAndroid.show('Failed to delete file', ToastAndroid.SHORT);
                            }
                        } catch (error) {
                            Haptics.error();
                            ToastAndroid.show('Error deleting file', ToastAndroid.SHORT);
                        }
                        setShowFileModal(false);
                    },
                },
            ]
        );
    };

    const renderFolder = (folder: PlatformFolder) => {
        const isExpanded = !!expandedFolders[folder.platform];
        const platformColor = getPlatformColor(folder.platform);

        return (
            <View key={folder.platform}>
                <PlatformFolderCard
                    folder={folder}
                    onPress={() => togglePlatformExpand(folder.platform)}
                    expanded={isExpanded}
                />

                {isExpanded && (
                    <View style={styles.expandedContent}>
                        {folder.contentTypes.map((ct) => (
                            <ContentTypeRow
                                key={ct.type}
                                type={ct.type}
                                files={ct.files}
                                platformColor={platformColor}
                                onFilePress={handleFilePress}
                            />
                        ))}
                    </View>
                )}
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <StatusBar barStyle="light-content" backgroundColor={Colors.background} animated />

            {/* Header */}
            <Animated.View
                style={[
                    styles.header,
                    {
                        opacity: headerFadeAnim,
                        transform: [{ translateY: headerSlideAnim }],
                    }
                ]}
            >
                <View style={styles.headerContent}>
                    <View>
                        <Text style={styles.headerTitle}>Library</Text>
                        <Text style={styles.headerSubtitle}>Your downloaded media</Text>
                    </View>
                    <TouchableOpacity onPress={handleRefresh} style={styles.refreshButton}>
                        <RefreshIcon size={20} color={Colors.textSecondary} />
                    </TouchableOpacity>
                </View>
            </Animated.View>

            <FlatList
                data={[]}
                renderItem={() => null}
                ListHeaderComponent={
                    <>
                        {/* Storage Info Card */}
                        <StorageInfoCard
                            basePath={basePath}
                            onPress={() => setShowStorageInfo(true)}
                        />

                        {/* Platform Storage Usage Card */}
                        <PlatformStorageUsageCard folders={folders} />

                        {/* Empty State */}
                        {isEmpty && (
                            <EmptyState
                                title="No Downloads Yet"
                                subtitle="Downloaded videos and music from any platform will appear here for easy access and offline playback."
                                support="MP4 • MP3 • FLAC • WEBM • JPG"
                                features={['🎬 Watch Offline', '🎵 Lossless Audio', '📂 Organized', '🚀 Fast Access']}
                                icon={<FolderIcon size={44} color={Colors.primary} />}
                            />
                        )}

                        {/* Platform Folders */}
                        {folders.map(renderFolder)}
                    </>
                }
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={handleRefresh}
                        tintColor={Colors.primary}
                        colors={[Colors.primary]}
                    />
                }
            />

            {/* File Detail Modal */}
            <FileDetailModal
                visible={showFileModal}
                file={selectedFile}
                onClose={() => setShowFileModal(false)}
                onPlay={handlePlay}
                onShare={handleShare}
                onDelete={handleDelete}
            />

            {/* Storage Info Modal */}
            <StorageInfoModal
                visible={showStorageInfo}
                basePath={basePath}
                onClose={() => setShowStorageInfo(false)}
            />
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    header: {
        paddingHorizontal: Spacing.md,
        paddingTop: Spacing.lg,
        paddingBottom: Spacing.sm,
    },
    headerContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: Spacing.md,
    },
    headerTitle: {
        fontSize: Typography.sizes['3xl'],
        fontWeight: Typography.weights.black,
        color: Colors.textPrimary,
        letterSpacing: Typography.letterSpacing.tight,
    },
    headerSubtitle: {
        fontSize: Typography.sizes.xs,
        color: Colors.textMuted,
        fontWeight: Typography.weights.medium,
        letterSpacing: 1,
        textTransform: 'uppercase',
        marginTop: 2,
    },
    refreshButton: {
        width: 44,
        height: 44,
        borderRadius: 12,
        backgroundColor: Colors.surfaceMedium,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: Colors.innerBorder,
    },
    listContent: {
        paddingBottom: 120,
    },
    // Storage Card
    storageCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.surfaceMedium,
        marginHorizontal: Spacing.md,
        borderRadius: 16,
        padding: 14,
        marginBottom: Spacing.md,
        borderWidth: 1,
        borderColor: Colors.innerBorder,
    },
    storageIconContainer: {
        width: 40,
        height: 40,
        borderRadius: 10,
        backgroundColor: `${Colors.primary}10`,
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
    },
    storageIconGlow: {
        position: 'absolute',
        width: '100%',
        height: '100%',
        borderRadius: 10,
        opacity: 0.1,
    },
    storageInfo: {
        flex: 1,
        marginLeft: Spacing.md,
    },
    storageTitle: {
        fontSize: 10,
        fontWeight: Typography.weights.bold,
        color: Colors.textMuted,
        letterSpacing: 1,
    },
    storagePath: {
        fontSize: Typography.sizes.sm,
        color: Colors.textPrimary,
        fontWeight: Typography.weights.medium,
        marginTop: 2,
    },
    storageAction: {
        padding: Spacing.xs,
    },
    // Platform Storage Usage Card
    platformStorageCard: {
        backgroundColor: Colors.surfaceMedium,
        marginHorizontal: Spacing.md,
        borderRadius: 16,
        padding: 16,
        marginBottom: Spacing.lg,
        borderWidth: 1,
        borderColor: Colors.innerBorder,
    },
    platformStorageHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    platformStorageHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
    },
    platformStorageTitle: {
        fontSize: 10,
        fontWeight: Typography.weights.bold,
        color: Colors.textMuted,
        letterSpacing: 1,
    },
    platformStorageTotal: {
        fontSize: Typography.sizes.sm,
        fontWeight: Typography.weights.bold,
        color: Colors.primary,
    },
    platformStorageList: {
        gap: 14,
    },
    platformStorageItem: {
        gap: 8,
    },
    platformStorageItemHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    platformStorageItemLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
    },
    platformDot: {
        width: 8,
        height: 8,
        borderRadius: 2,
    },
    platformStorageItemName: {
        fontSize: Typography.sizes.xs,
        color: Colors.textSecondary,
        fontWeight: Typography.weights.semibold,
        textTransform: 'uppercase',
    },
    platformStorageItemSize: {
        fontSize: Typography.sizes.xxs,
        color: Colors.textMuted,
        fontWeight: Typography.weights.medium,
    },
    platformStorageBar: {
        height: 4,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: 2,
        overflow: 'hidden',
    },
    platformStorageBarFill: {
        height: '100%',
        borderRadius: 2,
    },
    // Folder Card
    folderCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.surfaceMedium,
        padding: 16,
        marginHorizontal: Spacing.md,
        marginBottom: 2,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: Colors.innerBorder,
    },
    folderIconBg: {
        width: 40,
        height: 40,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
    },
    folderInfo: {
        flex: 1,
        marginLeft: Spacing.md,
    },
    folderName: {
        fontSize: Typography.sizes.base,
        fontWeight: Typography.weights.bold,
        color: Colors.textPrimary,
        letterSpacing: Typography.letterSpacing.normal,
    },
    folderMeta: {
        fontSize: 10,
        color: Colors.textMuted,
        fontWeight: Typography.weights.medium,
        marginTop: 2,
        letterSpacing: 0.5,
    },
    // Expanded Content
    expandedContent: {
        marginBottom: Spacing.md,
        marginTop: 4,
        marginHorizontal: Spacing.md,
        backgroundColor: 'rgba(255, 255, 255, 0.02)',
        borderBottomLeftRadius: 16,
        borderBottomRightRadius: 16,
        borderWidth: 1,
        borderColor: Colors.innerBorder,
        borderTopWidth: 0,
        paddingBottom: Spacing.md,
    },
    // Content Type
    contentTypeContainer: {
        marginTop: Spacing.md,
    },
    contentTypeHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
        paddingHorizontal: Spacing.md,
    },
    contentTypeLine: {
        flex: 1,
        height: 1,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
    },
    contentTypeText: {
        fontSize: 9,
        fontWeight: Typography.weights.black,
        marginHorizontal: Spacing.sm,
        letterSpacing: 1.5,
    },
    horizontalFileList: {
        paddingLeft: Spacing.md,
    },
    // File Card
    fileCard: {
        width: 140,
        marginRight: Spacing.sm,
        backgroundColor: Colors.surfaceHigh,
        borderRadius: 12,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: Colors.innerBorder,
    },
    fileThumbnail: {
        width: '100%',
        height: 85,
        backgroundColor: Colors.surfaceLow,
        position: 'relative',
    },
    thumbnailImage: {
        width: '100%',
        height: '100%',
        resizeMode: 'cover',
    },
    filePlaceholder: {
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: Colors.surfaceLow,
    },
    fileCardOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.1)',
    },
    playOverlaySmall: {
        position: 'absolute',
        top: '50%',
        left: '50%',
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: -14,
        marginLeft: -14,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    fileCardInfo: {
        padding: 8,
    },
    fileName: {
        fontSize: Typography.sizes.xxs,
        fontWeight: Typography.weights.semibold,
        color: Colors.textPrimary,
        marginBottom: 2,
    },
    fileSize: {
        fontSize: 9,
        color: Colors.textMuted,
        fontWeight: Typography.weights.medium,
    },
    // Modal
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.85)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: Colors.surfaceHigh,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: Spacing.lg,
        paddingBottom: 40,
        borderWidth: 1,
        borderColor: Colors.innerBorderLight,
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        marginBottom: Spacing.lg,
    },
    modalTitle: {
        flex: 1,
        fontSize: Typography.sizes.lg,
        fontWeight: Typography.weights.bold,
        color: Colors.textPrimary,
        marginRight: Spacing.md,
        letterSpacing: Typography.letterSpacing.normal,
    },
    closeButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.05)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalPreview: {
        width: '100%',
        height: 200,
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: Colors.surfaceLow,
        marginBottom: Spacing.lg,
        borderWidth: 1,
        borderColor: Colors.innerBorder,
    },
    modalThumbnail: {
        width: '100%',
        height: '100%',
        resizeMode: 'cover',
    },
    modalPlaceholder: {
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
    },
    // File Info Section
    fileInfoSection: {
        marginBottom: Spacing.xl,
        backgroundColor: 'rgba(255,255,255,0.02)',
        borderRadius: 12,
        padding: 4,
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12,
        paddingHorizontal: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.03)',
    },
    infoLabel: {
        fontSize: 10,
        fontWeight: Typography.weights.bold,
        color: Colors.textMuted,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
    },
    infoValue: {
        flex: 1,
        fontSize: Typography.sizes.sm,
        color: Colors.textPrimary,
        textAlign: 'right',
        fontWeight: Typography.weights.medium,
    },
    pathText: {
        fontSize: 10,
        opacity: 0.7,
    },
    platformBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 6,
    },
    platformBadgeText: {
        fontSize: 10,
        fontWeight: Typography.weights.bold,
        textTransform: 'uppercase',
    },
    // Modal Actions
    modalActions: {
        flexDirection: 'row',
        gap: 12,
    },
    actionButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 16,
        borderRadius: 12,
    },
    actionButtonText: {
        fontSize: Typography.sizes.sm,
        fontWeight: Typography.weights.bold,
        color: Colors.textPrimary,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    shareButton: {
        backgroundColor: Colors.surfaceMedium,
        borderWidth: 1,
        borderColor: Colors.innerBorder,
    },
    deleteButton: {
        backgroundColor: 'rgba(239, 68, 68, 0.15)',
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.2)',
    },
    // Info Modal
    infoModalContent: {
        backgroundColor: Colors.surfaceHigh,
        marginHorizontal: Spacing.lg,
        borderRadius: 20,
        padding: Spacing.xl,
        maxWidth: 400,
        alignSelf: 'center',
        borderWidth: 1,
        borderColor: Colors.innerBorderLight,
    },
    infoModalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 20,
    },
    infoModalTitle: {
        fontSize: Typography.sizes.lg,
        fontWeight: Typography.weights.black,
        color: Colors.textPrimary,
        letterSpacing: Typography.letterSpacing.tight,
    },
    infoSection: {
        marginBottom: 20,
    },
    infoSectionTitle: {
        fontSize: 11,
        fontWeight: Typography.weights.bold,
        color: Colors.primary,
        marginBottom: 6,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
    },
    infoSectionText: {
        fontSize: Typography.sizes.sm,
        color: Colors.textSecondary,
        lineHeight: 20,
    },
    pathBox: {
        backgroundColor: Colors.surfaceLow,
        padding: 12,
        borderRadius: 8,
        marginTop: 8,
        borderWidth: 1,
        borderColor: Colors.innerBorder,
    },
    pathBoxText: {
        fontSize: 10,
        color: Colors.textMuted,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    folderStructure: {
        backgroundColor: Colors.surfaceLow,
        padding: 12,
        borderRadius: 8,
        marginTop: 8,
        borderWidth: 1,
        borderColor: Colors.innerBorder,
    },
    structureItem: {
        fontSize: 10,
        color: Colors.textSecondary,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
        lineHeight: 18,
    },
    gotItButton: {
        backgroundColor: Colors.primary,
        paddingVertical: 14,
        borderRadius: 10,
        alignItems: 'center',
        marginTop: 10,
    },
    gotItText: {
        fontSize: Typography.sizes.base,
        fontWeight: Typography.weights.bold,
        color: Colors.textPrimary,
        letterSpacing: 0.5,
    },
    fileCardOverlaySmall: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.1)',
    },
    losslessBadgeSmall: {
        position: 'absolute',
        top: 6,
        right: 6,
        backgroundColor: Colors.lossless,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    losslessBadgeTextSmall: {
        color: '#000',
        fontSize: 8,
        fontWeight: Typography.weights.black,
        letterSpacing: 0.5,
    },
    losslessBadgeLarge: {
        position: 'absolute',
        bottom: 12,
        backgroundColor: Colors.lossless,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.1)',
    },
    losslessBadgeTextLarge: {
        color: '#000',
        fontSize: 10,
        fontWeight: Typography.weights.black,
        letterSpacing: 1,
    },
});

export default LibraryScreen;
