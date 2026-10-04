import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors, Spacing, Typography, BorderRadius } from '../theme';
import { WarningIcon } from './Icons';

interface LiveRecordBarProps {
    /** Twitch brand purple unless the caller supplies the detected platform color. */
    platformColor?: string;
    /** Fired with the chosen cap in seconds, or undefined to record until cancelled. */
    onStart: (maxDurationSeconds: number | undefined) => void;
    disabled?: boolean;
    recording?: boolean;
}

/** Preset recording lengths, in minutes. Short enough for a clip, long enough for a session. */
const LENGTHS = [
    { label: '15m', minutes: 15 },
    { label: '30m', minutes: 30 },
    { label: '1h', minutes: 60 },
    { label: '3h', minutes: 180 },
];

export const LiveBadge: React.FC<{ platformColor?: string }> = ({ platformColor }) => (
    <View style={[styles.badge, { backgroundColor: `${platformColor ?? Colors.twitch}22`, borderColor: platformColor ?? Colors.twitch }]}>
        <View style={[styles.badgeDot, { backgroundColor: platformColor ?? Colors.twitch }]} />
        <Text style={[styles.badgeText, { color: platformColor ?? Colors.twitch }]}>LIVE</Text>
    </View>
);

/**
 * Record controls for a live broadcast.
 *
 * A live stream has no end, so the recording runs until the user cancels. The
 * length presets are optional and only bound how long it keeps running; without
 * one, nothing is capped. Choosing "Until I stop" is the default because an
 * unbounded cap would silently eat storage and mobile data.
 */
export const LiveRecordBar: React.FC<LiveRecordBarProps> = ({
    platformColor,
    onStart,
    disabled,
    recording,
}) => {
    const [minutes, setMinutes] = useState<number | null>(null);

    const color = platformColor ?? Colors.twitch;

    return (
        <View style={[styles.container, { borderColor: `${color}55` }]}>
            <View style={styles.headerRow}>
                <LiveBadge platformColor={color} />
                <Text style={styles.title}>Record this live stream</Text>
            </View>

            <Text style={styles.hint}>
                A live stream never ends on its own, so it records until you stop it. Pick a length to bound it.
            </Text>

            <View style={styles.lengthRow}>
                {LENGTHS.map((option) => {
                    const active = minutes === option.minutes;
                    return (
                        <TouchableOpacity
                            key={option.label}
                            style={[
                                styles.lengthBtn,
                                active && { backgroundColor: `${color}26`, borderColor: color },
                            ]}
                            onPress={() => setMinutes(active ? null : option.minutes)}
                            accessibilityRole="radio"
                            accessibilityState={{ checked: active }}
                        >
                            <Text style={[styles.lengthText, active && { color }]}>{option.label}</Text>
                        </TouchableOpacity>
                    );
                })}
            </View>

            <TouchableOpacity
                style={[styles.startBtn, { backgroundColor: color }, disabled && styles.disabled]}
                onPress={() => onStart(minutes ? minutes * 60 : undefined)}
                disabled={disabled || recording}
                activeOpacity={0.85}
            >
                <Text style={styles.startText}>
                    {recording ? 'Recording...' : minutes ? `Record ${minutes} minutes` : 'Record until I stop'}
                </Text>
            </TouchableOpacity>

            {!minutes && (
                <View style={styles.noteRow}>
                    <WarningIcon size={13} color={Colors.warning} />
                    <Text style={styles.noteText}>
                        Unbounded recordings keep using data and storage until you cancel.
                    </Text>
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: BorderRadius.sm,
        borderWidth: 1,
    },
    badgeDot: { width: 6, height: 6, borderRadius: 3 },
    badgeText: { fontSize: Typography.sizes.xxs, fontWeight: Typography.weights.black, letterSpacing: 0.6 },
    container: {
        marginHorizontal: Spacing.md,
        marginTop: Spacing.md,
        padding: Spacing.md,
        borderRadius: BorderRadius.lg,
        backgroundColor: Colors.surfaceElevated,
        borderWidth: 1,
        gap: Spacing.sm,
    },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    title: { fontSize: Typography.sizes.sm, fontWeight: Typography.weights.semibold, color: Colors.textPrimary },
    hint: { fontSize: Typography.sizes.xs, color: Colors.textMuted, lineHeight: 17 },
    lengthRow: { flexDirection: 'row', gap: Spacing.xs },
    lengthBtn: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: Spacing.sm,
        borderRadius: BorderRadius.sm,
        backgroundColor: Colors.surface,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    lengthText: {
        fontSize: Typography.sizes.xs,
        fontWeight: Typography.weights.semibold,
        color: Colors.textPrimary,
    },
    startBtn: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: Spacing.md,
        borderRadius: BorderRadius.md,
        marginTop: Spacing.xs,
    },
    disabled: { opacity: 0.45 },
    startText: { color: '#fff', fontSize: Typography.sizes.sm, fontWeight: Typography.weights.bold },
    noteRow: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
    noteText: { flex: 1, fontSize: Typography.sizes.xxs, color: Colors.textMuted, lineHeight: 15 },
});