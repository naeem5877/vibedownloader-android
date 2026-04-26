import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, Modal, TouchableOpacity, Image, StyleSheet, ActivityIndicator } from 'react-native';
import { Colors, Spacing, Typography, BorderRadius, Shadows } from '../theme';
import { DownloadIcon, CloseIcon, CheckIcon, VideoIcon, MusicIcon } from './Icons';

interface PlaylistItem {
    id: string;
    title: string; // Video title or track name
    author: string; // Artist or channel
    duration?: string;
    thumbnail?: string;
    url: string; // Actual URL to download (e.g. YouTube video URL or search query)
    originalUrl?: string; // Original Spotify/YT URL
    type?: string; // platform type like 'instagram', 'facebook', 'youtube'
}

interface PlaylistSelectionModalProps {
    visible: boolean;
    onClose: () => void;
    onDownload: (selectedItems: PlaylistItem[], formatId: string) => void;
    playlistTitle: string;
    playlistImage?: string;
    items: PlaylistItem[];
    platformColor: string;
    isLoading?: boolean;
}

export const PlaylistSelectionModal: React.FC<PlaylistSelectionModalProps> = ({
    visible,
    onClose,
    onDownload,
    playlistTitle,
    playlistImage,
    items,
    platformColor,
    isLoading,
}) => {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // Auto-select all on load
    useEffect(() => {
        if (items.length > 0) {
            const allIds = new Set(items.map(i => i.id));
            setSelectedIds(allIds);
        } else {
            setSelectedIds(new Set());
        }
    }, [items]);

    const toggleSelection = (id: string) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setSelectedIds(newSet);
    };

    const selectAll = () => {
        const allIds = new Set(items.map(i => i.id));
        setSelectedIds(allIds);
    };

    const deselectAll = () => {
        setSelectedIds(new Set());
    };

    const handleDownload = (formatId: string) => {
        const selectedItems = items.filter(i => selectedIds.has(i.id));
        onDownload(selectedItems, formatId);
    };

    const renderItem = ({ item }: { item: PlaylistItem }) => {
        const isSelected = selectedIds.has(item.id);
        return (
            <TouchableOpacity
                style={[styles.itemRow, isSelected && { backgroundColor: `${platformColor}10` }]}
                onPress={() => toggleSelection(item.id)}
                activeOpacity={0.7}
            >
                <View style={[styles.checkbox, isSelected && { backgroundColor: platformColor, borderColor: platformColor }]}>
                    {isSelected && <CheckIcon size={12} color="#FFF" />}
                </View>
                <View style={styles.itemInfo}>
                    <Text style={[styles.itemTitle, isSelected && { color: platformColor }]} numberOfLines={1}>
                        {item.title}
                    </Text>
                    <Text style={styles.itemAuthor} numberOfLines={1}>{item.author}</Text>
                </View>
                {item.duration && <Text style={styles.itemDuration}>{item.duration}</Text>}
            </TouchableOpacity>
        );
    };

    const renderStoryItem = ({ item }: { item: PlaylistItem }) => {
        const isSelected = selectedIds.has(item.id);
        return (
            <TouchableOpacity
                style={[styles.storyGridItem, isSelected && { borderColor: platformColor, borderWidth: 2 }]}
                onPress={() => toggleSelection(item.id)}
                activeOpacity={0.8}
            >
                {item.thumbnail ? (
                    <Image source={{ uri: item.thumbnail }} style={styles.storyThumbnail} />
                ) : (
                    <View style={[styles.storyThumbnail, { backgroundColor: Colors.surfaceElevated }]} />
                )}
                <View style={styles.storyGradient} />
                
                <View style={[styles.storyCheckbox, isSelected ? { backgroundColor: platformColor, borderColor: platformColor } : { backgroundColor: 'rgba(0,0,0,0.5)', borderColor: '#FFF' }]}>
                    {isSelected && <CheckIcon size={12} color="#FFF" />}
                </View>

                {item.duration && (
                    <View style={styles.storyDurationContainer}>
                        <Text style={styles.storyDurationText}>{item.duration}</Text>
                    </View>
                )}
            </TouchableOpacity>
        );
    };

    const isStoryMode = items.length > 0 && ['instagram', 'facebook'].includes(items[0].type || '');

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={styles.overlay}>
                <View style={styles.container}>
                    {/* Header */}
                    <View style={styles.header}>
                        <View style={styles.headerInfo}>
                            {playlistImage && <Image source={{ uri: playlistImage }} style={styles.playlistThumb} />}
                            <View>
                                <Text style={styles.playlistTitle} numberOfLines={1}>{playlistTitle}</Text>
                                <Text style={styles.trackCount}>
                                    {items.length} {isStoryMode ? 'Stories' : 'Tracks'}
                                </Text>
                            </View>
                        </View>
                        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                            <CloseIcon size={24} color={Colors.textMuted} />
                        </TouchableOpacity>
                    </View>

                    {/* Controls */}
                    <View style={styles.controls}>
                        <View style={styles.selectionControls}>
                            <TouchableOpacity onPress={selectAll}>
                                <Text style={[styles.controlText, { color: platformColor }]}>Select All</Text>
                            </TouchableOpacity>
                            <Text style={styles.divider}>•</Text>
                            <TouchableOpacity onPress={deselectAll}>
                                <Text style={styles.controlText}>None</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Mode Toggle removed in favor of explicit buttons */}
                    </View>

                    {/* List */}
                    {isLoading ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator color={platformColor} size="large" />
                            <Text style={styles.loadingText}>Loading tracks...</Text>
                        </View>
                    ) : (
                        <FlatList
                            key={isStoryMode ? 'grid-3' : 'list-1'}
                            data={items}
                            renderItem={isStoryMode ? renderStoryItem : renderItem}
                            keyExtractor={item => item.id}
                            contentContainerStyle={[styles.listContent, isStoryMode && styles.gridContent]}
                            showsVerticalScrollIndicator={false}
                            numColumns={isStoryMode ? 3 : 1}
                            columnWrapperStyle={isStoryMode ? styles.gridRow : undefined}
                        />
                    )}

                    {/* Footer Action */}
                    <View style={styles.footer}>
                        {(() => {
                            const isStoryMode = items.length > 0 && ['instagram', 'facebook'].includes(items[0].type || '');
                            if (isStoryMode) {
                                return (
                                    <TouchableOpacity
                                        style={[
                                            styles.videoBatchBtn,
                                            { backgroundColor: selectedIds.size > 0 ? platformColor : Colors.surfaceElevated },
                                            selectedIds.size === 0 && { opacity: 0.4 },
                                        ]}
                                        disabled={selectedIds.size === 0}
                                        onPress={() => handleDownload('best')}
                                    >
                                        <DownloadIcon size={18} color="#FFF" />
                                        <Text style={styles.videoBatchBtnText}>
                                            Download Stories {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            }

                            return (
                                <>
                                    <View style={styles.footerRow}>
                                        <TouchableOpacity
                                            style={[styles.batchBtn, { backgroundColor: `${platformColor}15`, borderColor: `${platformColor}30` }]}
                                            disabled={selectedIds.size === 0}
                                            onPress={() => handleDownload('audio_best')}
                                        >
                                            <MusicIcon size={16} color={platformColor} />
                                            <Text style={[styles.batchBtnText, { color: platformColor }]}>Best</Text>
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            style={[styles.batchBtn, { backgroundColor: `${platformColor}15`, borderColor: `${platformColor}30` }]}
                                            disabled={selectedIds.size === 0}
                                            onPress={() => handleDownload('audio_standard')}
                                        >
                                            <MusicIcon size={16} color={platformColor} />
                                            <Text style={[styles.batchBtnText, { color: platformColor }]}>Std</Text>
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            style={[styles.batchBtn, { backgroundColor: `${platformColor}15`, borderColor: `${platformColor}30` }]}
                                            disabled={selectedIds.size === 0}
                                            onPress={() => handleDownload('audio_low')}
                                        >
                                            <MusicIcon size={16} color={platformColor} />
                                            <Text style={[styles.batchBtnText, { color: platformColor }]}>Low</Text>
                                        </TouchableOpacity>
                                    </View>

                                    {platformColor !== '#1DB954' && ( // Don't show video for Spotify (Green color used here as proxy)
                                        <TouchableOpacity
                                            style={[
                                                styles.videoBatchBtn,
                                                { backgroundColor: selectedIds.size > 0 ? platformColor : Colors.surfaceElevated }
                                            ]}
                                            disabled={selectedIds.size === 0}
                                            onPress={() => handleDownload('best')}
                                        >
                                            <VideoIcon size={18} color="#FFF" />
                                            <Text style={styles.videoBatchBtnText}>
                                                Download Video {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
                                            </Text>
                                        </TouchableOpacity>
                                    )}
                                </>
                            );
                        })()}
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'flex-end',
    },
    container: {
        backgroundColor: Colors.surface,
        borderTopLeftRadius: BorderRadius.xxl,
        borderTopRightRadius: BorderRadius.xxl,
        height: '80%',
        paddingTop: Spacing.lg,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: Spacing.lg,
        paddingBottom: Spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    headerInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        flex: 1,
    },
    playlistThumb: {
        width: 48,
        height: 48,
        borderRadius: BorderRadius.md,
        backgroundColor: Colors.surfaceElevated,
    },
    playlistTitle: {
        fontSize: Typography.sizes.lg,
        fontWeight: Typography.weights.bold,
        color: Colors.textPrimary,
        marginBottom: 2,
    },
    trackCount: {
        fontSize: Typography.sizes.sm,
        color: Colors.textMuted,
    },
    closeButton: {
        padding: Spacing.sm,
    },
    controls: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    selectionControls: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
    },
    controlText: {
        fontSize: Typography.sizes.sm,
        color: Colors.textSecondary,
        fontWeight: Typography.weights.medium,
    },
    divider: {
        color: Colors.textMuted,
    },
    modeToggle: {
        flexDirection: 'row',
        backgroundColor: Colors.surfaceElevated,
        borderRadius: BorderRadius.round,
        padding: 2,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    modeBtn: {
        padding: 6,
        borderRadius: BorderRadius.round,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: Spacing.md,
        color: Colors.textMuted,
    },
    listContent: {
        paddingHorizontal: Spacing.lg,
        paddingBottom: 100,
    },
    itemRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: Spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
        paddingHorizontal: Spacing.sm,
        borderRadius: BorderRadius.md,
        marginBottom: 2,
    },
    checkbox: {
        width: 20,
        height: 20,
        borderRadius: 6,
        borderWidth: 1.5,
        borderColor: Colors.textMuted,
        marginRight: Spacing.md,
        justifyContent: 'center',
        alignItems: 'center',
    },
    itemInfo: {
        flex: 1,
    },
    itemTitle: {
        fontSize: Typography.sizes.sm,
        fontWeight: Typography.weights.semibold,
        color: Colors.textPrimary,
        marginBottom: 2,
    },
    itemAuthor: {
        fontSize: Typography.sizes.xs,
        color: Colors.textMuted,
    },
    itemDuration: {
        fontSize: Typography.sizes.xs,
        color: Colors.textMuted,
        marginLeft: Spacing.sm,
    },
    footer: {
        backgroundColor: Colors.surface,
        padding: Spacing.lg,
        // Extra bottom padding so the button clears the Android navigation bar
        paddingBottom: Spacing.xl,
        borderTopWidth: 1,
        borderTopColor: Colors.border,
        ...Shadows.lg,
        gap: Spacing.sm,
    },
    footerRow: {
        flexDirection: 'row',
        gap: Spacing.sm,
    },
    batchBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        borderRadius: BorderRadius.lg,
        borderWidth: 1,
        gap: 6,
    },
    batchBtnText: {
        fontSize: 12,
        fontWeight: Typography.weights.bold,
    },
    videoBatchBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        borderRadius: BorderRadius.lg,
        gap: Spacing.sm,
        marginTop: 4,
    },
    videoBatchBtnText: {
        fontSize: Typography.sizes.base,
        fontWeight: Typography.weights.bold,
        color: '#FFF',
    },
    gridContent: {
        paddingHorizontal: Spacing.md,
        paddingBottom: 100,
    },
    gridRow: {
        justifyContent: 'flex-start',
        gap: 8,
        marginBottom: 8,
    },
    storyGridItem: {
        width: '32%', // Approximate 1/3 of the width minus gap
        aspectRatio: 9 / 16,
        borderRadius: BorderRadius.md,
        overflow: 'hidden',
        borderWidth: 2,
        borderColor: 'transparent',
        position: 'relative',
        backgroundColor: Colors.surfaceElevated,
    },
    storyThumbnail: {
        width: '100%',
        height: '100%',
        resizeMode: 'cover',
    },
    storyGradient: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: '40%',
        backgroundColor: 'rgba(0,0,0,0.3)',
    },
    storyCheckbox: {
        position: 'absolute',
        top: 6,
        right: 6,
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 1.5,
        justifyContent: 'center',
        alignItems: 'center',
    },
    storyDurationContainer: {
        position: 'absolute',
        bottom: 6,
        left: 6,
        backgroundColor: 'rgba(0,0,0,0.6)',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    storyDurationText: {
        color: '#FFF',
        fontSize: Typography.sizes.xs,
        fontWeight: Typography.weights.bold,
    }
});
