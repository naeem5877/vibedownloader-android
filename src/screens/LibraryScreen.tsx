/**
 * LibraryScreen - File Management for Downloaded Media
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
import { YtDlpNative, formatFileSize } from '../native/YtDlpModule';

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

// Storage Info Component
const StorageInfoCard: React.FC<{ basePath: string; onPress: () => void }> = ({ basePath, onPress }) => {
    return (
        <TouchableOpacity style={styles.storageCard} onPress={onPress} activeOpacity={0.7}>
            <View style={styles.storageIconContainer}>
                <FolderIcon size={24} color={Colors.primary} />
            </View>
            <View style={styles.storageInfo}>
                <Text style={styles.storageTitle}>Storage Location</Text>
                <Text style={styles.storagePath} numberOfLines={2}>
                    {basePath || '/Android/data/app/files/vibedownloader'}
                </Text>
            </View>
            <View style={styles.storageAction}>
                <InfoIcon size={18} color={Colors.textMuted} />
            </View>
        </TouchableOpacity>
    );
};

// Platform Storage Usage Card - Shows storage per platform like YouTube, Instagram etc.
interface PlatformStorageUsage {
    platform: string;
    size: number;
    color: string;
}

// Individual storage item component for proper hooks usage
const PlatformStorageItem: React.FC<{
    platform: PlatformStorageUsage;
    maxSize: number;
    index: number;
}> = ({ platform, maxSize, index }) => {
    const percentage = (platform.size / maxSize) * 100;
    const widthAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(widthAnim, {
            toValue: percentage,
            duration: 800,
            delay: index * 100,
            useNativeDriver: false,
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
                    <FolderIcon size={20} color={Colors.primary} />
                    <Text style={styles.platformStorageTitle}>Storage by Platform</Text>
                </View>
                <Text style={styles.platformStorageTotal}>{formatFileSize(totalSize)}</Text>
            </View>

            <View style={styles.platformStorageList}>
                {sortedPlatforms.slice(0, 5).map((platform, index) => (
                    <PlatformStorageItem
                        key={platform.platform}
                        platform={platform}
                        maxSize={maxSize}
                        index={index}
                    />
                ))}
            </View>

            {sortedPlatforms.length > 5 && (
                <Text style={styles.platformStorageMore}>
                    +{sortedPlatforms.length - 5} more platforms
                </Text>
            )}
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
        Animated.timing(rotateAnim, {
            toValue: expanded ? 1 : 0,
            duration: 200,
            useNativeDriver: true,
        }).start();
    }, [expanded]);

    const rotation = rotateAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '90deg'],
    });

    return (
        <TouchableOpacity
            style={[styles.folderCard, { borderLeftColor: platformColor }]}
            onPress={onPress}
            activeOpacity={0.7}
        >
            <View style={[styles.folderIconBg, { backgroundColor: `${platformColor}20` }]}>
                <FolderIcon size={22} color={platformColor} />
            </View>

            <View style={styles.folderInfo}>
                <Text style={styles.folderName}>{folder.platform}</Text>
                <Text style={styles.folderMeta}>
                    {folder.totalCount} file{folder.totalCount !== 1 ? 's' : ''} • {formatFileSize(folder.totalSize)}
                </Text>
            </View>

            <Animated.View style={{ transform: [{ rotate: rotation }] }}>
                <ChevronRightIcon size={20} color={Colors.textMuted} />
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
                <View style={[styles.contentTypeBadge, { backgroundColor: `${platformColor}30` }]}>
                    <Text style={[styles.contentTypeText, { color: platformColor }]}>{type}</Text>
                </View>
                <Text style={styles.contentTypeCount}>{files.length} files</Text>
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
    const isAudio = ['mp3', 'm4a', 'wav', 'aac'].includes(file.extension.toLowerCase());
    const isImage = ['jpg', 'jpeg', 'png', 'webp'].includes(file.extension.toLowerCase());

    const getIcon = () => {
        if (isVideo) return <VideoIcon size={24} color={Colors.textSecondary} />;
        if (isAudio) return <MusicIcon size={24} color={Colors.textSecondary} />;
        if (isImage) return <ImageIcon size={24} color={Colors.textSecondary} />;
        return <DownloadIcon size={24} color={Colors.textSecondary} />;
    };

    return (
        <TouchableOpacity style={styles.fileCard} onPress={onPress} activeOpacity={0.7}>
            <View style={styles.fileThumbnail}>
                {file.thumbnail ? (
                    <Image source={{ uri: file.thumbnail }} style={styles.thumbnailImage} />
                ) : (
                    <View style={styles.filePlaceholder}>
                        {getIcon()}
                    </View>
                )}
                {isVideo && (
                    <View style={styles.playOverlay}>
                        <PlayIcon size={18} color={Colors.textPrimary} />
                    </View>
                )}
            </View>
            <Text style={styles.fileName} numberOfLines={2}>{file.name}</Text>
            <Text style={styles.fileSize}>{formatFileSize(file.size)}</Text>
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
    const isAudio = ['mp3', 'm4a', 'wav', 'aac'].includes(file.extension.toLowerCase());

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
                    <View style={[styles.modalPreview, { borderColor: platformColor }]}>
                        {file.thumbnail ? (
                            <Image source={{ uri: file.thumbnail }} style={styles.modalThumbnail} />
                        ) : (
                            <View style={styles.modalPlaceholder}>
                                {isVideo ? (
                                    <VideoIcon size={48} color={platformColor} />
                                ) : isAudio ? (
                                    <MusicIcon size={48} color={platformColor} />
                                ) : (
                                    <DownloadIcon size={48} color={platformColor} />
                                )}
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
                                ToastAndroid.show('File deleted', ToastAndroid.SHORT);
                                loadFiles();
                            } else {
                                ToastAndroid.show('Failed to delete file', ToastAndroid.SHORT);
                            }
                        } catch (error) {
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
                    <Text style={styles.headerTitle}>Library</Text>
                    <TouchableOpacity onPress={handleRefresh} style={styles.refreshButton}>
                        <RefreshIcon size={22} color={Colors.textSecondary} />
                    </TouchableOpacity>
                </View>
                <Text style={styles.headerSubtitle}>Your downloaded media</Text>
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
                            <View style={styles.emptyState}>
                                <View style={styles.emptyIconContainer}>
                                    <FolderIcon size={48} color={Colors.textMuted} />
                                </View>
                                <Text style={styles.emptyTitle}>No Downloads Yet</Text>
                                <Text style={styles.emptySubtitle}>
                                    Downloaded videos and music will appear here for easy access.
                                </Text>
                            </View>
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
        paddingBottom: Spacing.md,
    },
    headerContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    headerTitle: {
        fontSize: Typography.sizes['3xl'],
        fontWeight: Typography.weights.bold,
        color: Colors.textPrimary,
    },
    refreshButton: {
        padding: Spacing.sm,
    },
    headerSubtitle: {
        fontSize: Typography.sizes.sm,
        color: Colors.textMuted,
        marginTop: Spacing.xs,
    },
    listContent: {
        paddingHorizontal: Spacing.md,
        paddingBottom: 120,
    },
    // Storage Card
    storageCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.surface,
        borderRadius: BorderRadius.lg,
        padding: Spacing.md,
        marginBottom: Spacing.lg,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    storageIconContainer: {
        width: 44,
        height: 44,
        borderRadius: BorderRadius.md,
        backgroundColor: `${Colors.primary}15`,
        justifyContent: 'center',
        alignItems: 'center',
    },
    storageInfo: {
        flex: 1,
        marginLeft: Spacing.md,
    },
    storageTitle: {
        fontSize: Typography.sizes.base,
        fontWeight: Typography.weights.semibold,
        color: Colors.textPrimary,
    },
    storagePath: {
        fontSize: Typography.sizes.xs,
        color: Colors.textMuted,
        marginTop: 2,
    },
    storageAction: {
        padding: Spacing.sm,
    },
    // Platform Storage Usage Card
    platformStorageCard: {
        backgroundColor: Colors.surface,
        borderRadius: BorderRadius.lg,
        padding: Spacing.md,
        marginBottom: Spacing.lg,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    platformStorageHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: Spacing.md,
    },
    platformStorageHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
    },
    platformStorageTitle: {
        fontSize: Typography.sizes.base,
        fontWeight: Typography.weights.semibold,
        color: Colors.textPrimary,
    },
    platformStorageTotal: {
        fontSize: Typography.sizes.sm,
        fontWeight: Typography.weights.bold,
        color: Colors.primary,
    },
    platformStorageList: {
        gap: Spacing.md,
    },
    platformStorageItem: {
        gap: 6,
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
        width: 10,
        height: 10,
        borderRadius: 5,
    },
    platformStorageItemName: {
        fontSize: Typography.sizes.sm,
        color: Colors.textSecondary,
        fontWeight: Typography.weights.medium,
    },
    platformStorageItemSize: {
        fontSize: Typography.sizes.xs,
        color: Colors.textMuted,
        fontWeight: Typography.weights.medium,
    },
    platformStorageBar: {
        height: 6,
        backgroundColor: Colors.border,
        borderRadius: 3,
        overflow: 'hidden',
    },
    platformStorageBarFill: {
        height: '100%',
        borderRadius: 3,
    },
    platformStorageMore: {
        fontSize: Typography.sizes.xs,
        color: Colors.textMuted,
        textAlign: 'center',
        marginTop: Spacing.md,
    },
    // Folder Card
    folderCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.surface,
        borderRadius: BorderRadius.lg,
        padding: Spacing.md,
        marginBottom: Spacing.sm,
        borderLeftWidth: 3,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    folderIconBg: {
        width: 44,
        height: 44,
        borderRadius: BorderRadius.md,
        justifyContent: 'center',
        alignItems: 'center',
    },
    folderInfo: {
        flex: 1,
        marginLeft: Spacing.md,
    },
    folderName: {
        fontSize: Typography.sizes.base,
        fontWeight: Typography.weights.semibold,
        color: Colors.textPrimary,
    },
    folderMeta: {
        fontSize: Typography.sizes.xs,
        color: Colors.textMuted,
        marginTop: 2,
    },
    // Expanded Content
    expandedContent: {
        marginBottom: Spacing.md,
        marginTop: Spacing.xs,
    },
    // Content Type
    contentTypeContainer: {
        marginBottom: Spacing.md,
    },
    contentTypeHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: Spacing.sm,
        paddingHorizontal: Spacing.sm,
    },
    contentTypeBadge: {
        paddingHorizontal: Spacing.sm,
        paddingVertical: 4,
        borderRadius: BorderRadius.round,
    },
    contentTypeText: {
        fontSize: Typography.sizes.xs,
        fontWeight: Typography.weights.semibold,
    },
    contentTypeCount: {
        fontSize: Typography.sizes.xs,
        color: Colors.textMuted,
    },
    horizontalFileList: {
        paddingLeft: Spacing.sm,
    },
    // File Card
    fileCard: {
        width: 130,
        marginRight: Spacing.sm,
        backgroundColor: Colors.surfaceElevated,
        borderRadius: BorderRadius.md,
        overflow: 'hidden',
    },
    fileThumbnail: {
        width: '100%',
        height: 90,
        backgroundColor: Colors.surface,
        justifyContent: 'center',
        alignItems: 'center',
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
        backgroundColor: Colors.surface,
    },
    playOverlay: {
        position: 'absolute',
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    fileName: {
        fontSize: Typography.sizes.xs,
        color: Colors.textPrimary,
        padding: Spacing.sm,
        paddingBottom: 4,
    },
    fileSize: {
        fontSize: Typography.sizes.xxs,
        color: Colors.textMuted,
        paddingHorizontal: Spacing.sm,
        paddingBottom: Spacing.sm,
    },
    // Empty State
    emptyState: {
        alignItems: 'center',
        paddingVertical: Spacing.xxxl,
        paddingHorizontal: Spacing.xl,
    },
    emptyIconContainer: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: Colors.surface,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: Spacing.lg,
    },
    emptyTitle: {
        fontSize: Typography.sizes.xl,
        fontWeight: Typography.weights.bold,
        color: Colors.textPrimary,
        marginBottom: Spacing.sm,
    },
    emptySubtitle: {
        fontSize: Typography.sizes.sm,
        color: Colors.textMuted,
        textAlign: 'center',
        lineHeight: 22,
    },
    // Modal
    modalOverlay: {
        flex: 1,
        backgroundColor: Colors.overlay,
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: Colors.surface,
        borderTopLeftRadius: BorderRadius.xxl,
        borderTopRightRadius: BorderRadius.xxl,
        padding: Spacing.lg,
        maxHeight: '85%',
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        marginBottom: Spacing.md,
    },
    modalTitle: {
        flex: 1,
        fontSize: Typography.sizes.lg,
        fontWeight: Typography.weights.bold,
        color: Colors.textPrimary,
        marginRight: Spacing.md,
    },
    closeButton: {
        padding: Spacing.xs,
    },
    modalPreview: {
        width: '100%',
        height: 180,
        borderRadius: BorderRadius.lg,
        overflow: 'hidden',
        backgroundColor: Colors.surfaceElevated,
        marginBottom: Spacing.lg,
        borderWidth: 2,
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
        marginBottom: Spacing.lg,
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        paddingVertical: Spacing.sm,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    infoLabel: {
        fontSize: Typography.sizes.sm,
        color: Colors.textMuted,
        width: 80,
    },
    infoValue: {
        flex: 1,
        fontSize: Typography.sizes.sm,
        color: Colors.textPrimary,
        textAlign: 'right',
    },
    pathText: {
        fontSize: Typography.sizes.xs,
    },
    platformBadge: {
        paddingHorizontal: Spacing.sm,
        paddingVertical: 4,
        borderRadius: BorderRadius.round,
    },
    platformBadgeText: {
        fontSize: Typography.sizes.xs,
        fontWeight: Typography.weights.semibold,
    },
    // Modal Actions
    modalActions: {
        flexDirection: 'row',
        gap: Spacing.sm,
    },
    actionButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.xs,
        paddingVertical: Spacing.md,
        borderRadius: BorderRadius.md,
    },
    actionButtonText: {
        fontSize: Typography.sizes.sm,
        fontWeight: Typography.weights.semibold,
        color: Colors.textPrimary,
    },
    shareButton: {
        backgroundColor: Colors.info,
    },
    deleteButton: {
        backgroundColor: Colors.error,
    },
    // Info Modal
    infoModalContent: {
        backgroundColor: Colors.surface,
        marginHorizontal: Spacing.md,
        borderRadius: BorderRadius.xl,
        padding: Spacing.lg,
        maxWidth: 400,
        alignSelf: 'center',
    },
    infoModalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        marginBottom: Spacing.lg,
    },
    infoModalTitle: {
        fontSize: Typography.sizes.lg,
        fontWeight: Typography.weights.bold,
        color: Colors.textPrimary,
    },
    infoSection: {
        marginBottom: Spacing.lg,
    },
    infoSectionTitle: {
        fontSize: Typography.sizes.sm,
        fontWeight: Typography.weights.semibold,
        color: Colors.textPrimary,
        marginBottom: Spacing.xs,
    },
    infoSectionText: {
        fontSize: Typography.sizes.sm,
        color: Colors.textSecondary,
        lineHeight: 20,
    },
    pathBox: {
        backgroundColor: Colors.surfaceElevated,
        padding: Spacing.sm,
        borderRadius: BorderRadius.sm,
        marginTop: Spacing.sm,
    },
    pathBoxText: {
        fontSize: Typography.sizes.xs,
        color: Colors.textMuted,
        fontFamily: 'monospace',
    },
    folderStructure: {
        backgroundColor: Colors.surfaceElevated,
        padding: Spacing.md,
        borderRadius: BorderRadius.sm,
        marginTop: Spacing.sm,
    },
    structureItem: {
        fontSize: Typography.sizes.xs,
        color: Colors.textSecondary,
        fontFamily: 'monospace',
        lineHeight: 18,
    },
    gotItButton: {
        backgroundColor: Colors.primary,
        paddingVertical: Spacing.md,
        borderRadius: BorderRadius.md,
        alignItems: 'center',
    },
    gotItText: {
        fontSize: Typography.sizes.base,
        fontWeight: Typography.weights.semibold,
        color: Colors.textPrimary,
    },
});

export default LibraryScreen;
