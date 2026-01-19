/**
 * AnimatedLogo Component
 *
 * Displays the KanDu logo with SVG path tracing animation.
 * The house/bubble outline traces first, then the checkmark draws in from left to right.
 * On completion, particles burst outward in a celebratory explosion.
 * Requires native build with react-native-svg.
 */

import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Animated, Easing, View } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop, Circle } from 'react-native-svg';

// Create animated versions
const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// Particle colors matching our logo gradient
const PARTICLE_COLORS = [
  '#3B82F6', // Blue
  '#06B6D4', // Cyan
  '#10B981', // Green
  '#A855F7', // Purple
  '#EC4899', // Pink
  '#EF4444', // Red
  '#F97316', // Orange
  '#FBBF24', // Yellow
];

// Generate random particles
const generateParticles = (count: number) => {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    angle: (i / count) * 360 + Math.random() * 30, // Spread evenly with some randomness
    distance: 80 + Math.random() * 60, // How far they travel
    size: 4 + Math.random() * 8, // Particle size
    color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
    delay: Math.random() * 100, // Staggered start
  }));
};

interface AnimatedLogoProps {
  size?: number;
  isLoading?: boolean;
  onAnimationComplete?: () => void;
  /** If true, fires onAnimationComplete after trace completes (for startup splash).
   *  If false (default), fires after burst completes (for loading overlays). */
  completeOnTrace?: boolean;
  /** Total duration for the trace animation in ms (default: 4600ms = 3000 outline + 300 delay + 1300 checkmark).
   *  If specified, adjusts both outline and checkmark proportionally. */
  traceDuration?: number;
}

export default function AnimatedLogo({
  size = 120,
  isLoading = true,
  onAnimationComplete,
  completeOnTrace = false,
  traceDuration,
}: AnimatedLogoProps) {
  // Animation values for stroke dash offset (tracing effect)
  const outlineProgress = useRef(new Animated.Value(0)).current;
  const checkmarkProgress = useRef(new Animated.Value(0)).current;

  // Scale and opacity can use native driver
  const pulseScale = useRef(new Animated.Value(1)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;

  // Particle burst animation
  const [showParticles, setShowParticles] = useState(false);
  const [particles] = useState(() => generateParticles(24));
  const particleProgress = useRef(new Animated.Value(0)).current;
  const logoExplodeScale = useRef(new Animated.Value(1)).current;
  const logoExplodeOpacity = useRef(new Animated.Value(1)).current;

  // Path lengths
  const OUTLINE_LENGTH = 380;
  const CHECKMARK_LENGTH = 100;

  // Default durations: 3000ms outline + 300ms delay + 1300ms checkmark = 4600ms total
  // If traceDuration is provided, scale proportionally
  const DEFAULT_TOTAL = 4600;
  const scaleFactor = traceDuration ? traceDuration / DEFAULT_TOTAL : 1;
  const outlineDuration = Math.round(3000 * scaleFactor);
  const delayDuration = Math.round(300 * scaleFactor);
  const checkmarkDuration = Math.round(1300 * scaleFactor);

  useEffect(() => {
    if (isLoading) {
      // Reset all values
      outlineProgress.setValue(0);
      checkmarkProgress.setValue(0);
      pulseScale.setValue(1);
      fadeIn.setValue(0);
      particleProgress.setValue(0);
      logoExplodeScale.setValue(1);
      logoExplodeOpacity.setValue(1);
      setShowParticles(false);

      // Fade in container
      Animated.timing(fadeIn, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();

      // Sequence: trace outline, then trace checkmark
      Animated.sequence([
        Animated.timing(outlineProgress, {
          toValue: 1,
          duration: outlineDuration,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.delay(delayDuration),
        Animated.timing(checkmarkProgress, {
          toValue: 1,
          duration: checkmarkDuration,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
      ]).start(() => {
        // Fire callback when trace completes (for startup splash only)
        if (completeOnTrace && onAnimationComplete) {
          onAnimationComplete();
        }

        // After tracing is complete, start gentle pulse (for loading overlays)
        Animated.loop(
          Animated.sequence([
            Animated.timing(pulseScale, {
              toValue: 1.05,
              duration: 1000,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(pulseScale, {
              toValue: 1,
              duration: 1000,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
          ])
        ).start();
      });
    } else {
      // DIAGNOSIS COMPLETE - PARTICLE BURST!
      // Stop any pulsing animation first
      pulseScale.stopAnimation();
      pulseScale.setValue(1);

      outlineProgress.setValue(1);
      checkmarkProgress.setValue(1);
      setShowParticles(true);

      // Tighter timing - all timing-based for predictability (no springs)
      const BURST_DURATION = 500;

      Animated.parallel([
        // Logo quickly scales up and fades out completely
        Animated.timing(logoExplodeScale, {
          toValue: 1.6,
          duration: BURST_DURATION * 0.4,
          easing: Easing.out(Easing.back(2)),
          useNativeDriver: true,
        }),
        Animated.timing(logoExplodeOpacity, {
          toValue: 0,
          duration: BURST_DURATION * 0.35,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        // Particles explode outward
        Animated.timing(particleProgress, {
          toValue: 1,
          duration: BURST_DURATION,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(() => {
        // Fire callback immediately - no extra delay
        if (onAnimationComplete) {
          onAnimationComplete();
        }
      });
    }
  }, [isLoading]);

  // Interpolate stroke dash offset for tracing effect
  const outlineStrokeDashoffset = outlineProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [OUTLINE_LENGTH, 0],
  });

  const checkmarkStrokeDashoffset = checkmarkProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [CHECKMARK_LENGTH, 0],
  });

  return (
    <View style={[styles.container, { width: size * 2.5, height: size * 2.5 }]}>
      {/* Particle layer (behind logo) */}
      {showParticles && particles.map((particle) => {
        const translateX = particleProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [0, Math.cos((particle.angle * Math.PI) / 180) * particle.distance],
        });
        const translateY = particleProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [0, Math.sin((particle.angle * Math.PI) / 180) * particle.distance],
        });
        const particleOpacity = particleProgress.interpolate({
          inputRange: [0, 0.2, 0.8, 1],
          outputRange: [0, 1, 1, 0],
        });
        const particleScale = particleProgress.interpolate({
          inputRange: [0, 0.3, 1],
          outputRange: [0, 1.5, 0.5],
        });

        return (
          <Animated.View
            key={particle.id}
            style={[
              styles.particle,
              {
                width: particle.size,
                height: particle.size,
                borderRadius: particle.size / 2,
                backgroundColor: particle.color,
                opacity: particleOpacity,
                transform: [
                  { translateX },
                  { translateY },
                  { scale: particleScale },
                ],
              },
            ]}
          />
        );
      })}

      {/* Logo */}
      <Animated.View
        style={[
          styles.logoContainer,
          {
            width: size,
            height: size,
            opacity: Animated.multiply(fadeIn, logoExplodeOpacity),
            transform: [
              { scale: Animated.multiply(pulseScale, logoExplodeScale) },
            ],
          },
        ]}
      >
        <Svg
          width={size}
          height={size}
          viewBox="0 0 100 100"
        >
          <Defs>
            <LinearGradient id="outlineGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor="#3B82F6" />
              <Stop offset="50%" stopColor="#06B6D4" />
              <Stop offset="100%" stopColor="#10B981" />
            </LinearGradient>

            <LinearGradient id="checkGradient" x1="38" y1="46" x2="62" y2="38" gradientUnits="userSpaceOnUse">
              <Stop offset="0%" stopColor="#3B82F6" />
              <Stop offset="30%" stopColor="#A855F7" />
              <Stop offset="50%" stopColor="#EF4444" />
              <Stop offset="75%" stopColor="#F97316" />
              <Stop offset="100%" stopColor="#FCD34D" />
            </LinearGradient>
          </Defs>

          <AnimatedPath
            d="M50 10
               L80 32
               Q85 35 85 42
               L85 64
               Q85 70 80 72
               L72 72
               L62 86
               L62 72
               L20 72
               Q15 70 15 64
               L15 42
               Q15 35 20 32
               L50 10
               Z"
            fill="none"
            stroke="url(#outlineGradient)"
            strokeWidth={6}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={OUTLINE_LENGTH}
            strokeDashoffset={outlineStrokeDashoffset}
          />

          <AnimatedPath
            d="M38 46 L46 54 L62 38"
            fill="none"
            stroke="url(#checkGradient)"
            strokeWidth={10}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={CHECKMARK_LENGTH}
            strokeDashoffset={checkmarkStrokeDashoffset}
          />
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  logoContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
  },
  particle: {
    position: 'absolute',
  },
});
