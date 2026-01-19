/**
 * RepairPlanLoadingScreen Component
 *
 * Full-screen loading display for repair plan generation.
 * Features:
 * - Animated house logo with SVG path tracing (6 second duration)
 * - KAnDu Together logo at top
 * - Animated pulsing dots
 * - Subtle glow effect around the house
 * - Cycling loading messages
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Image, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import AnimatedLogo from './AnimatedLogo';

// Static import for logo
const KanDuTogetherLogo = require('../assets/kandu-together.png');

// Loading messages that cycle through
const LOADING_MESSAGES = [
  'Analyzing your issue...',
  'Identifying the problem...',
  'Building step-by-step instructions...',
  'Gathering tool recommendations...',
  'Creating your repair plan...',
];

interface RepairPlanLoadingScreenProps {
  visible?: boolean;
}

export default function RepairPlanLoadingScreen({ visible = true }: RepairPlanLoadingScreenProps) {
  const [messageIndex, setMessageIndex] = useState(0);

  // Animated values for effects
  const glowPulse = useRef(new Animated.Value(0.3)).current;
  const dot1Opacity = useRef(new Animated.Value(0.3)).current;
  const dot2Opacity = useRef(new Animated.Value(0.3)).current;
  const dot3Opacity = useRef(new Animated.Value(0.3)).current;
  const textFadeAnim = useRef(new Animated.Value(1)).current;

  // Cycle through messages
  useEffect(() => {
    if (!visible) return;

    const interval = setInterval(() => {
      // Fade out
      Animated.timing(textFadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        setMessageIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
        // Fade in
        Animated.timing(textFadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }).start();
      });
    }, 3000);

    return () => clearInterval(interval);
  }, [visible]);

  // Pulsing glow animation
  useEffect(() => {
    if (!visible) return;

    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(glowPulse, {
          toValue: 0.6,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(glowPulse, {
          toValue: 0.3,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    pulseAnimation.start();

    return () => pulseAnimation.stop();
  }, [visible]);

  // Animated dots - staggered wave effect
  useEffect(() => {
    if (!visible) return;

    const animateDots = () => {
      // Reset
      dot1Opacity.setValue(0.3);
      dot2Opacity.setValue(0.3);
      dot3Opacity.setValue(0.3);

      Animated.stagger(200, [
        Animated.sequence([
          Animated.timing(dot1Opacity, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(dot1Opacity, {
            toValue: 0.3,
            duration: 400,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(dot2Opacity, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(dot2Opacity, {
            toValue: 0.3,
            duration: 400,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(dot3Opacity, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(dot3Opacity, {
            toValue: 0.3,
            duration: 400,
            useNativeDriver: true,
          }),
        ]),
      ]).start(() => {
        // Loop after all dots complete
        setTimeout(animateDots, 200);
      });
    };

    animateDots();
  }, [visible]);

  if (!visible) return null;

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['rgba(15, 23, 42, 0.98)', 'rgba(30, 41, 59, 0.98)']}
        style={styles.gradient}
      >
        {/* KAnDu Together Logo at top */}
        <View style={styles.logoContainer}>
          <Image
            source={KanDuTogetherLogo}
            style={styles.kanduLogo}
            resizeMode="contain"
          />
        </View>

        {/* House logo centered in glow circle */}
        <View style={styles.houseWrapper}>
          {/* Glow effect behind house */}
          <Animated.View
            style={[
              styles.glowContainer,
              { opacity: glowPulse }
            ]}
          >
            <LinearGradient
              colors={['transparent', 'rgba(59, 130, 246, 0.2)', 'rgba(16, 185, 129, 0.15)', 'transparent']}
              style={styles.glowGradient}
            />
          </Animated.View>

          {/* Animated House Logo - slower 6 second trace for calming effect */}
          <View style={styles.animationContainer}>
            <AnimatedLogo
              size={160}
              isLoading={true}
              traceDuration={6000}
            />
          </View>
        </View>

        {/* Bottom text container */}
        <View style={styles.bottomContainer}>
          {/* Loading Title */}
          <Text style={styles.title}>Creating Your Repair Plan</Text>

          {/* Animated subtitle */}
          <Animated.Text style={[styles.subtitle, { opacity: textFadeAnim }]}>
            {LOADING_MESSAGES[messageIndex]}
          </Animated.Text>

          {/* Animated progress dots */}
          <View style={styles.dotsContainer}>
            <Animated.View style={[styles.dot, { opacity: dot1Opacity, backgroundColor: '#3B82F6' }]} />
            <Animated.View style={[styles.dot, { opacity: dot2Opacity, backgroundColor: '#06B6D4' }]} />
            <Animated.View style={[styles.dot, { opacity: dot3Opacity, backgroundColor: '#10B981' }]} />
          </View>
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  gradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  logoContainer: {
    position: 'absolute',
    top: 60,
    alignItems: 'center',
    width: '100%',
  },
  kanduLogo: {
    width: 600,
    height: 210,
  },
  houseWrapper: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    marginTop: -150,
    justifyContent: 'center',
    alignItems: 'center',
    height: 300,
  },
  glowContainer: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  glowGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 150,
  },
  animationContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomContainer: {
    position: 'absolute',
    bottom: 120,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 16,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
    marginBottom: 40,
    minHeight: 24,
  },
  dotsContainer: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
});
