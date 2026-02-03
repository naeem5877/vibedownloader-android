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
}

interface PlaylistSelectionModalProps {
    visible: boolean;
    onClose: () => void;
    onDownload: (selectedItems: PlaylistItem[], mode: 'video' | 'audio') => void;
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
    const [mode, setMode] = useState<'video' | 'audio'>('audio'); // Default to Audio for playlists (usually music)

    // Auto-select all on load
    useEffect(() => {
        if (items.length > 0) {
            const allIds = new Set(items.map(i => i.id));
            setSelectedIds(allIds);
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

    const handleDownload = () => {
        const selectedItems = items.filter(i => selectedIds.has(i.id));
        onDownload(selectedItems, mode);
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
                                <Text style={styles.trackCount}>{items.length} Tracks</Text>
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

                        {/* Mode Toggle */}
                        <View style={styles.modeToggle}>
                            <TouchableOpacity
                                style={[styles.modeBtn, mode === 'video' && { backgroundColor: `${platformColor}20` }]}
                                onPress={() => setMode('video')}
                            >
                                <VideoIcon size={16} color={mode === 'video' ? platformColor : Colors.textMuted} />
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.modeBtn, mode === 'audio' && { backgroundColor: `${platformColor}20` }]}
                                onPress={() => setMode('audio')}
                            >
                                <MusicIcon size={16} color={mode === 'audio' ? platformColor : Colors.textMuted} />
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* List */}
                    {isLoading ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator color={platformColor} size="large" />
                            <Text style={styles.loadingText}>Loading tracks...</Text>
                        </View>
                    ) : (
                        <FlatList
                            data={items}
                            renderItem={renderItem}
                            keyExtractor={item => item.id}
                            contentContainerStyle={styles.listContent}
                            showsVerticalScrollIndicator={false}
                        />
                    )}

                    {/* Footer Action */}
                    <View style={styles.footer}>
                        <TouchableOpacity
                            style={[
                                styles.downloadButton,
                                { backgroundColor: selectedIds.size > 0 ? platformColor : Colors.surfaceElevated }
                            ]}
                            disabled={selectedIds.size === 0}
                            onPress={handleDownload}
                        >
                            <DownloadIcon size={20} color={selectedIds.size > 0 ? '#FFF' : Colors.textMuted} />
                            <Text style={[styles.downloadText, selectedIds.size === 0 && { color: Colors.textMuted }]}>
                                Download {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
                            </Text>
                        </TouchableOpacity>
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
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: Colors.surface,
        padding: Spacing.lg,
        borderTopWidth: 1,
        borderTopColor: Colors.border,
        ...Shadows.lg,
    },
    downloadButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: Spacing.md,
        borderRadius: BorderRadius.lg,
        gap: Spacing.sm,
    },
    downloadText: {
        fontSize: Typography.sizes.base,
        fontWeight: Typography.weights.bold,
        color: '#FFF',
    },
});
