/**
 * Renders structured GitHub release notes (see GitHubUpdateService).
 * Headings stay headings, bullets stay bullets, links open in the browser.
 */
import React from 'react';
import { View, Text, StyleSheet, Linking } from 'react-native';
import { Colors, Typography } from '../theme';
import { NoteBlock, NoteSpan } from '../services/GitHubUpdateService';

const openLink = (url: string) => {
    Linking.openURL(url).catch(() => { /* no browser available */ });
};

const Spans: React.FC<{ spans: NoteSpan[]; base?: object }> = ({ spans, base }) => (
    <Text style={base}>
        {spans.map((span, i) => {
            switch (span.type) {
                case 'bold':
                    return <Text key={i} style={styles.bold}>{span.text}</Text>;
                case 'code':
                    return <Text key={i} style={styles.code}>{span.text}</Text>;
                case 'link':
                    return (
                        <Text key={i} style={styles.link} onPress={() => openLink(span.url)}>
                            {span.text}
                        </Text>
                    );
                default:
                    return <Text key={i}>{span.text}</Text>;
            }
        })}
    </Text>
);

export const ReleaseNotesView: React.FC<{ notes: NoteBlock[]; emptyText?: string }> = ({
    notes,
    emptyText = 'Performance and stability improvements.',
}) => {
    if (notes.length === 0) {
        return <Text style={styles.empty}>{emptyText}</Text>;
    }

    return (
        <View>
            {notes.map((block, i) => {
                if (block.type === 'heading') {
                    return (
                        <View key={i} style={[styles.headingWrap, i === 0 && styles.headingFirst]}>
                            <Spans
                                spans={block.spans}
                                base={block.level <= 2 ? styles.heading : styles.subheading}
                            />
                        </View>
                    );
                }
                if (block.type === 'bullet') {
                    return (
                        <View key={i} style={[styles.bulletRow, { marginLeft: block.depth * 14 }]}>
                            <View style={[styles.bulletDot, block.depth > 0 && styles.bulletDotNested]} />
                            <View style={styles.bulletText}>
                                <Spans spans={block.spans} base={styles.body} />
                            </View>
                        </View>
                    );
                }
                return (
                    <View key={i} style={styles.paragraph}>
                        <Spans spans={block.spans} base={styles.body} />
                    </View>
                );
            })}
        </View>
    );
};

const styles = StyleSheet.create({
    headingWrap: { marginTop: 18, marginBottom: 8 },
    headingFirst: { marginTop: 0 },
    heading: {
        fontSize: 16,
        fontWeight: Typography.weights.bold,
        color: Colors.textPrimary,
        letterSpacing: -0.2,
    },
    subheading: {
        fontSize: 12,
        fontWeight: Typography.weights.bold,
        color: Colors.textMuted,
        letterSpacing: 0.6,
        textTransform: 'uppercase',
    },
    paragraph: { marginBottom: 8 },
    body: {
        fontSize: 14,
        lineHeight: 21,
        color: Colors.textSecondary,
    },
    bold: { fontWeight: Typography.weights.bold, color: Colors.textPrimary },
    code: {
        fontFamily: 'monospace',
        fontSize: 12.5,
        color: Colors.textPrimary,
        backgroundColor: 'rgba(255,255,255,0.08)',
    },
    link: { color: Colors.primaryLight, textDecorationLine: 'underline' },
    bulletRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
    bulletDot: {
        width: 5,
        height: 5,
        borderRadius: 3,
        backgroundColor: Colors.primary,
        marginTop: 8.5,
        marginRight: 10,
    },
    bulletDotNested: { backgroundColor: Colors.textMuted },
    bulletText: { flex: 1 },
    empty: { fontSize: 14, color: Colors.textMuted, lineHeight: 21 },
});

export default ReleaseNotesView;
