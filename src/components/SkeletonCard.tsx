/**
 * SkeletonCard - the desktop loading state: a 16:9 box that says what the app
 * is doing ("Fetching your link" + a step timeline + elapsed time), and pulsing
 * placeholder lines for the title and meta underneath.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  ActivityIndicator,
} from 'react-native';
import { Colors } from '../theme';
import { ShinyText } from './ShinyText';

type StepState = 'done' | 'active' | 'pending';

// Time since mount, ticking twice a second.
function useElapsed(): number {
  const [ms, setMs] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => setMs(Date.now() - start), 500);
    return () => clearInterval(id);
  }, []);
  return ms;
}

const formatElapsed = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const StepIcon: React.FC<{ state: StepState; color: string }> = ({
  state,
  color,
}) => {
  if (state === 'done') {
    return (
      <View style={styles.iconDone}>
        <Text style={styles.check}>✓</Text>
      </View>
    );
  }
  if (state === 'active') {
    return (
      <View style={styles.iconSlot}>
        <ActivityIndicator size="small" color={color} />
      </View>
    );
  }
  return <View style={styles.iconPending} />;
};

const StepList: React.FC<{
  steps: { title: string; state: StepState }[];
  color: string;
}> = ({ steps, color }) => (
  <View>
    {steps.map((s, i) => (
      <View key={s.title} style={styles.stepRow}>
        {i < steps.length - 1 && (
          <View
            style={[
              styles.connector,
              {
                backgroundColor:
                  s.state === 'done'
                    ? 'rgba(255,255,255,0.4)'
                    : 'rgba(255,255,255,0.1)',
              },
            ]}
          />
        )}
        <StepIcon state={s.state} color={color} />
        <Text
          style={[
            styles.stepTitle,
            { color: s.state === 'pending' ? 'rgba(255,255,255,0.3)' : '#fff' },
          ]}
        >
          {s.title}
        </Text>
      </View>
    ))}
  </View>
);

interface SkeletonCardProps {
  platform?: string;
  color?: string;
}

export const SkeletonCard: React.FC<SkeletonCardProps> = ({
  platform = 'the site',
  color = Colors.primary,
}) => {
  const elapsed = useElapsed();
  const pulse = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.4,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  // The lookup reports no stages of its own, so the timeline advances with time.
  const current = elapsed < 1500 ? 0 : elapsed < 4000 ? 1 : 2;
  const titles = [
    `Connecting to ${platform}`,
    'Reading media details',
    'Checking available qualities',
  ];
  const steps = titles.map((title, i) => ({
    title,
    state: (i < current ? 'done' : i === current ? 'active' : 'pending') as StepState,
  }));

  return (
    <View>
      <View style={styles.box}>
        <View style={styles.inner}>
          <View style={styles.headRow}>
            <ShinyText
              text="FETCHING YOUR LINK"
              speed={3}
              fontSize={13}
              fontWeight="700"
              letterSpacing={1.6}
            />
            <Text style={styles.elapsed}>{formatElapsed(elapsed)}</Text>
          </View>
          <StepList steps={steps} color={color} />
          {elapsed > 9000 && (
            <Text style={styles.slow}>
              Taking longer than usual. Some links need extra steps to resolve,
              so hang tight.
            </Text>
          )}
        </View>
      </View>

      <View style={styles.lines}>
        <Animated.View style={[styles.lineTitle, { opacity: pulse }]} />
        <View style={styles.lineRow}>
          <Animated.View style={[styles.lineMeta, { width: 96, opacity: pulse }]} />
          <Animated.View style={[styles.lineMeta, { width: 64, opacity: pulse }]} />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  box: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    marginBottom: 20,
  },
  inner: { width: '100%', maxWidth: 320 },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  elapsed: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    fontVariant: ['tabular-nums'],
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 14,
  },
  connector: {
    position: 'absolute',
    left: 8.5,
    top: 22,
    bottom: 0,
    width: 1,
  },
  iconSlot: { width: 18, height: 18, alignItems: 'center', justifyContent: 'center' },
  iconDone: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  check: { fontSize: 11, fontWeight: '900', color: '#000', marginTop: -1 },
  iconPending: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  stepTitle: { fontSize: 13, fontWeight: '600', lineHeight: 18 },
  slow: {
    marginTop: 6,
    fontSize: 11,
    lineHeight: 16,
    color: 'rgba(255,255,255,0.45)',
  },
  lines: { paddingHorizontal: 8, gap: 12, marginBottom: 24 },
  lineTitle: {
    height: 24,
    width: '75%',
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  lineRow: { flexDirection: 'row', gap: 16 },
  lineMeta: {
    height: 12,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
});

export default SkeletonCard;
