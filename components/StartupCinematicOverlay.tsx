/**
 * StartupCinematicOverlay Component
 *
 * A cinematic splash sequence for KanDu:
 * 1. Screen appears "cracked" with animated cracks spreading
 * 2. KanDu logo appears crooked/tilted
 * 3. Hammer swings down and "knocks" the logo into place
 * 4. Impact causes color to radiate outward through cracks
 * 5. Cracks fade away as they're healed, app loads
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Dimensions,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import AnimatedLogo from './AnimatedLogo';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Animated SVG components
const AnimatedPath = Animated.createAnimatedComponent(Path);

interface StartupCinematicOverlayProps {
  visible: boolean;
  onComplete: () => void;
}

// Generate crack data with distance from center for radial animation
interface CrackData {
  path: string;
  endX: number;
  endY: number;
  angle: number;
  distance: number; // Distance from center to end
}

// Generate crack paths that spread from center
const generateCrackPaths = (): CrackData[] => {
  const centerX = SCREEN_WIDTH / 2;
  const centerY = SCREEN_HEIGHT / 2;
  const cracks: CrackData[] = [];

  // Calculate max reach to edges/corners
  const maxReachX = Math.max(centerX, SCREEN_WIDTH - centerX);
  const maxReachY = Math.max(centerY, SCREEN_HEIGHT - centerY);
  const maxDiagonal = Math.sqrt(maxReachX * maxReachX + maxReachY * maxReachY);

  // Main cracks radiating from center - more cracks, longer reach
  const numCracks = 12;
  for (let i = 0; i < numCracks; i++) {
    const angle = (i / numCracks) * Math.PI * 2 + Math.random() * 0.2;
    // Cracks reach 60-95% toward edges
    const length = maxDiagonal * (0.6 + Math.random() * 0.35);

    // Create jagged crack path
    let path = `M ${centerX} ${centerY}`;
    let currentX = centerX;
    let currentY = centerY;

    const segments = 8 + Math.floor(Math.random() * 5);
    for (let j = 0; j < segments; j++) {
      const segLength = length / segments;
      const jitter = 20 + Math.random() * 25;
      const angleJitter = (Math.random() - 0.5) * 0.5;

      currentX += Math.cos(angle + angleJitter) * segLength + (Math.random() - 0.5) * jitter;
      currentY += Math.sin(angle + angleJitter) * segLength + (Math.random() - 0.5) * jitter;

      path += ` L ${currentX} ${currentY}`;
    }

    const distance = Math.sqrt(Math.pow(currentX - centerX, 2) + Math.pow(currentY - centerY, 2));
    cracks.push({ path, endX: currentX, endY: currentY, angle, distance });

    // Add branch cracks - more frequent and longer
    if (Math.random() > 0.3) {
      const branchAngle = angle + (Math.random() > 0.5 ? 0.6 : -0.6);
      const branchStartX = centerX + Math.cos(angle) * (length * 0.4);
      const branchStartY = centerY + Math.sin(angle) * (length * 0.4);
      let branchPath = `M ${branchStartX} ${branchStartY}`;
      let bx = branchStartX;
      let by = branchStartY;

      // Longer branch cracks with more segments
      const branchSegments = 4 + Math.floor(Math.random() * 3);
      for (let k = 0; k < branchSegments; k++) {
        bx += Math.cos(branchAngle) * 50 + (Math.random() - 0.5) * 15;
        by += Math.sin(branchAngle) * 50 + (Math.random() - 0.5) * 15;
        branchPath += ` L ${bx} ${by}`;
      }
      const branchDistance = Math.sqrt(Math.pow(bx - centerX, 2) + Math.pow(by - centerY, 2));
      cracks.push({ path: branchPath, endX: bx, endY: by, angle: branchAngle, distance: branchDistance });
    }

    // Add a second branch crack on longer cracks
    if (length > maxDiagonal * 0.7 && Math.random() > 0.5) {
      const branchAngle2 = angle + (Math.random() > 0.5 ? 0.4 : -0.4);
      const branchStartX2 = centerX + Math.cos(angle) * (length * 0.65);
      const branchStartY2 = centerY + Math.sin(angle) * (length * 0.65);
      let branchPath2 = `M ${branchStartX2} ${branchStartY2}`;
      let bx2 = branchStartX2;
      let by2 = branchStartY2;

      for (let k = 0; k < 3; k++) {
        bx2 += Math.cos(branchAngle2) * 40 + (Math.random() - 0.5) * 12;
        by2 += Math.sin(branchAngle2) * 40 + (Math.random() - 0.5) * 12;
        branchPath2 += ` L ${bx2} ${by2}`;
      }
      const branchDistance2 = Math.sqrt(Math.pow(bx2 - centerX, 2) + Math.pow(by2 - centerY, 2));
      cracks.push({ path: branchPath2, endX: bx2, endY: by2, angle: branchAngle2, distance: branchDistance2 });
    }
  }

  return cracks;
};

export default function StartupCinematicOverlay({
  visible,
  onComplete,
}: StartupCinematicOverlayProps) {
  const [phase, setPhase] = useState<'crack' | 'logo' | 'hammer' | 'heal' | 'done'>('crack');
  const [crackData] = useState(() => generateCrackPaths());

  // Measured logo position for precise hammer targeting
  const [logoLayout, setLogoLayout] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  // Animation values
  const overlayOpacity = useRef(new Animated.Value(1)).current;
  const crackProgress = useRef(new Animated.Value(0)).current;
  const crackOpacity = useRef(new Animated.Value(1)).current;
  const shakeX = useRef(new Animated.Value(0)).current;
  const shakeY = useRef(new Animated.Value(0)).current;

  // Logo animations
  const logoScale = useRef(new Animated.Value(0)).current;
  const logoRotation = useRef(new Animated.Value(-15)).current; // Start crooked
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;

  // Hammer animations - measured approach
  // Hammer mirrored (head faces left), positioned at impact point
  // Positive rotation swings handle right, so start at +65 and swing to 0
  const hammerRotation = useRef(new Animated.Value(65)).current; // Start raised back (opposite direction)
  const hammerOpacity = useRef(new Animated.Value(0)).current;

  // Logo impact effect
  const logoImpactScale = useRef(new Animated.Value(1)).current;

  // Healing/color wave animations
  const colorWaveProgress = useRef(new Animated.Value(0)).current; // 0 to 1, radiates outward
  const impactScale = useRef(new Animated.Value(0)).current;
  const impactOpacity = useRef(new Animated.Value(0)).current;

  // Wordmark
  const wordmarkOpacity = useRef(new Animated.Value(0)).current;
  const wordmarkTranslateY = useRef(new Animated.Value(20)).current;

  // Crack path lengths for stroke animation
  const CRACK_LENGTH = 500;
  const centerX = SCREEN_WIDTH / 2;
  const centerY = SCREEN_HEIGHT / 2;

  // Max distance for normalizing color wave
  const maxDistance = Math.max(...crackData.map(c => c.distance), 300);

  useEffect(() => {
    if (!visible) return;

    // Reset all animations
    overlayOpacity.setValue(1);
    crackProgress.setValue(0);
    crackOpacity.setValue(1);
    shakeX.setValue(0);
    shakeY.setValue(0);
    logoScale.setValue(0);
    logoRotation.setValue(-15);
    logoOpacity.setValue(0);
    glowOpacity.setValue(0);
    hammerRotation.setValue(65);
    hammerOpacity.setValue(0);
    logoImpactScale.setValue(1);
    colorWaveProgress.setValue(0);
    impactScale.setValue(0);
    impactOpacity.setValue(0);
    wordmarkOpacity.setValue(0);
    wordmarkTranslateY.setValue(20);
    setPhase('crack');

    // PHASE 1: Crack animation with shake (0-1200ms)
    const crackSequence = Animated.parallel([
      Animated.timing(crackProgress, {
        toValue: 1,
        duration: 1200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.sequence([
        Animated.delay(100),
        Animated.parallel([
          Animated.sequence([
            Animated.timing(shakeX, { toValue: 8, duration: 50, useNativeDriver: true }),
            Animated.timing(shakeX, { toValue: -8, duration: 50, useNativeDriver: true }),
            Animated.timing(shakeX, { toValue: 6, duration: 50, useNativeDriver: true }),
            Animated.timing(shakeX, { toValue: -6, duration: 50, useNativeDriver: true }),
            Animated.timing(shakeX, { toValue: 4, duration: 50, useNativeDriver: true }),
            Animated.timing(shakeX, { toValue: -4, duration: 50, useNativeDriver: true }),
            Animated.timing(shakeX, { toValue: 0, duration: 50, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.timing(shakeY, { toValue: 5, duration: 50, useNativeDriver: true }),
            Animated.timing(shakeY, { toValue: -5, duration: 50, useNativeDriver: true }),
            Animated.timing(shakeY, { toValue: 4, duration: 50, useNativeDriver: true }),
            Animated.timing(shakeY, { toValue: -4, duration: 50, useNativeDriver: true }),
            Animated.timing(shakeY, { toValue: 2, duration: 50, useNativeDriver: true }),
            Animated.timing(shakeY, { toValue: -2, duration: 50, useNativeDriver: true }),
            Animated.timing(shakeY, { toValue: 0, duration: 50, useNativeDriver: true }),
          ]),
        ]),
      ]),
    ]);

    crackSequence.start(() => {
      // PHASE 2: Logo appears CROOKED
      setPhase('logo');

      Animated.parallel([
        Animated.spring(logoScale, {
          toValue: 1,
          friction: 8,
          tension: 100,
          useNativeDriver: true,
        }),
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        // Wordmark appears with logo
        Animated.timing(wordmarkOpacity, {
          toValue: 1,
          duration: 400,
          delay: 200,
          useNativeDriver: true,
        }),
        Animated.timing(wordmarkTranslateY, {
          toValue: 0,
          duration: 400,
          delay: 200,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(() => {
        // PHASE 3: Hammer appears and swings down
        setPhase('hammer');

        // Show hammer
        Animated.timing(hammerOpacity, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }).start();

        // Hammer swings DOWN onto logo - rotation only, head is pre-positioned at impact point
        setTimeout(() => {
          Animated.timing(hammerRotation, {
            toValue: 0, // Swing to impact - 0deg means head is at the impact point
            duration: 180,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }).start(() => {
            // IMPACT! Logo snaps into place
            setPhase('heal');

            Animated.parallel([
              // Logo straightens
              Animated.spring(logoRotation, {
                toValue: 0,
                friction: 5,
                tension: 300,
                useNativeDriver: true,
              }),
              // Logo impact squash effect: 1 -> 0.96 -> 1.04 -> 1
              Animated.sequence([
                Animated.timing(logoImpactScale, {
                  toValue: 0.96,
                  duration: 50,
                  useNativeDriver: true,
                }),
                Animated.timing(logoImpactScale, {
                  toValue: 1.04,
                  duration: 80,
                  useNativeDriver: true,
                }),
                Animated.timing(logoImpactScale, {
                  toValue: 1,
                  duration: 100,
                  useNativeDriver: true,
                }),
              ]),
              // Impact shake
              Animated.sequence([
                Animated.timing(shakeX, { toValue: 5, duration: 30, useNativeDriver: true }),
                Animated.timing(shakeX, { toValue: -5, duration: 30, useNativeDriver: true }),
                Animated.timing(shakeX, { toValue: 3, duration: 30, useNativeDriver: true }),
                Animated.timing(shakeX, { toValue: -3, duration: 30, useNativeDriver: true }),
                Animated.timing(shakeX, { toValue: 0, duration: 30, useNativeDriver: true }),
              ]),
              // Impact ring
              Animated.sequence([
                Animated.parallel([
                  Animated.timing(impactOpacity, {
                    toValue: 0.8,
                    duration: 100,
                    useNativeDriver: true,
                  }),
                  Animated.timing(impactScale, {
                    toValue: 1.5,
                    duration: 100,
                    useNativeDriver: true,
                  }),
                ]),
                Animated.parallel([
                  Animated.timing(impactOpacity, {
                    toValue: 0,
                    duration: 400,
                    useNativeDriver: true,
                  }),
                  Animated.timing(impactScale, {
                    toValue: 3,
                    duration: 400,
                    useNativeDriver: true,
                  }),
                ]),
              ]),
              // Glow appears
              Animated.timing(glowOpacity, {
                toValue: 1,
                duration: 300,
                useNativeDriver: true,
              }),
              // Hammer small recoil and fade - stays near impact point
              Animated.sequence([
                Animated.timing(hammerRotation, {
                  toValue: 15, // Small recoil back (positive for mirrored hammer)
                  duration: 100,
                  easing: Easing.out(Easing.cubic),
                  useNativeDriver: true,
                }),
                Animated.timing(hammerOpacity, {
                  toValue: 0,
                  duration: 200,
                  useNativeDriver: true,
                }),
              ]),
              // Color wave radiates outward through cracks
              Animated.timing(colorWaveProgress, {
                toValue: 1,
                duration: 800,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: false,
              }),
            ]).start();

            // Cracks fade out slowly as color wave passes - slower so healing effect is obvious
            setTimeout(() => {
              Animated.timing(crackOpacity, {
                toValue: 0,
                duration: 1400, // Much slower fade for dramatic effect
                easing: Easing.out(Easing.quad),
                useNativeDriver: true,
              }).start();
            }, 600); // Wait for color wave to spread more
          });
        }, 300);
      });
    });
  }, [visible]);

  // Called when AnimatedLogo completes its trace
  const handleLogoComplete = () => {
    setPhase('done');

    setTimeout(() => {
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        onComplete();
      });
    }, 300);
  };

  if (!visible) return null;

  // Interpolate crack stroke dash offset
  const crackStrokeDashoffset = crackProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [CRACK_LENGTH, 0],
  });

  // Logo rotation interpolation
  const logoRotateStyle = logoRotation.interpolate({
    inputRange: [-15, 0, 15],
    outputRange: ['-15deg', '0deg', '15deg'],
  });

  // Hammer rotation interpolation - swings from raised (65) to impact (0)
  // Mirrored hammer: positive rotation swings handle to the right (hammer head swings down-left)
  const hammerRotateStyle = hammerRotation.interpolate({
    inputRange: [0, 65],
    outputRange: ['0deg', '65deg'],
  });

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: overlayOpacity,
          transform: [{ translateX: shakeX }, { translateY: shakeY }],
        },
      ]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      <StatusBar hidden />

      {/* Dark background */}
      <LinearGradient
        colors={['#0f172a', '#1e293b', '#0f172a']}
        style={styles.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      {/* Crack layer */}
      <Animated.View style={[styles.crackLayer, { opacity: crackOpacity }]}>
        <Svg width={SCREEN_WIDTH} height={SCREEN_HEIGHT} style={styles.crackSvg}>
          <Defs>
            <SvgGradient id="crackGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor="#94a3b8" />
              <Stop offset="50%" stopColor="#cbd5e1" />
              <Stop offset="100%" stopColor="#64748b" />
            </SvgGradient>
          </Defs>

          {crackData.map((crack, index) => {
            // Color changes based on wave progress and distance from center
            // Cracks closer to center change color first
            const normalizedDistance = crack.distance / maxDistance;
            const colors = ['#3B82F6', '#06B6D4', '#10B981'];
            const targetColor = colors[index % 3];

            // Interpolate color based on wave progress
            const crackColor = colorWaveProgress.interpolate({
              inputRange: [0, normalizedDistance * 0.8, normalizedDistance, 1],
              outputRange: ['#94a3b8', '#94a3b8', targetColor, targetColor],
              extrapolate: 'clamp',
            });

            return (
              <AnimatedPath
                key={index}
                d={crack.path}
                stroke={crackColor}
                strokeWidth={2 + Math.random()}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                strokeDasharray={CRACK_LENGTH}
                strokeDashoffset={crackStrokeDashoffset}
              />
            );
          })}
        </Svg>

        {/* Glass shards / highlights */}
        <View style={styles.glassHighlights}>
          {[...Array(6)].map((_, i) => (
            <Animated.View
              key={i}
              style={[
                styles.glassShard,
                {
                  left: SCREEN_WIDTH / 2 + Math.cos((i / 6) * Math.PI * 2) * 80,
                  top: SCREEN_HEIGHT / 2 + Math.sin((i / 6) * Math.PI * 2) * 80,
                  opacity: crackProgress.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [0, 0.6, 0.3],
                  }),
                  transform: [
                    { rotate: `${i * 60}deg` },
                    {
                      scale: crackProgress.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, 1],
                      }),
                    },
                  ],
                },
              ]}
            />
          ))}
        </View>
      </Animated.View>

      {/* Impact ring effect */}
      <Animated.View
        style={[
          styles.impactRing,
          {
            opacity: impactOpacity,
            transform: [{ scale: impactScale }],
          },
        ]}
      />

      {/* Logo glow */}
      {phase !== 'crack' && (
        <Animated.View
          style={[
            styles.logoGlow,
            {
              opacity: glowOpacity,
              transform: [{ scale: logoScale }],
            },
          ]}
        >
          <LinearGradient
            colors={['rgba(59, 130, 246, 0.4)', 'rgba(16, 185, 129, 0.2)', 'transparent']}
            style={styles.glowGradient}
            start={{ x: 0.5, y: 0.5 }}
            end={{ x: 1, y: 1 }}
          />
        </Animated.View>
      )}

      {/* KanDu Logo - appears CROOKED, then straightens on hammer hit */}
      {phase !== 'crack' && (
        <Animated.View
          onLayout={(event) => {
            const { x, y, width, height } = event.nativeEvent.layout;
            setLogoLayout({ x, y, width, height });
          }}
          style={[
            styles.logoContainer,
            {
              opacity: logoOpacity,
              transform: [
                { scale: Animated.multiply(logoScale, logoImpactScale) },
                { rotate: logoRotateStyle },
              ],
            },
          ]}
        >
          <AnimatedLogo
            size={160}
            isLoading={phase === 'logo' || phase === 'hammer' || phase === 'heal'}
            onAnimationComplete={handleLogoComplete}
            completeOnTrace={true}
          />
        </Animated.View>
      )}

      {/* Hammer - mirrored so head faces LEFT, positioned at impact point on logo */}
      {(phase === 'hammer' || phase === 'heal') && logoLayout && (() => {
        // Impact point: top-right area of logo (hammer comes from the right)
        const impactX = logoLayout.x + logoLayout.width * 0.75;
        const impactY = logoLayout.y + logoLayout.height * 0.35;

        // Hammer container size and head position within it
        // After mirroring (scaleX: -1), head is at bottom-RIGHT of container
        // Container is 100x100, head is approximately at (80, 80) from top-left after mirror
        const containerSize = 100;
        const headLocalX = 80;
        const headLocalY = 80;

        // Position container so head aligns with impact point at 0deg rotation
        const hammerLeft = impactX - headLocalX;
        const hammerTop = impactY - headLocalY;

        return (
          <Animated.View
            style={[
              {
                position: 'absolute',
                width: containerSize,
                height: containerSize,
                left: hammerLeft,
                top: hammerTop,
                // Pivot at the head position so rotation swings handle, not head
                transformOrigin: `${headLocalX}px ${headLocalY}px`,
              },
              {
                opacity: hammerOpacity,
                transform: [
                  { rotate: hammerRotateStyle },
                ],
              },
            ]}
          >
            {/* Mirror hammer horizontally so head faces LEFT */}
            <View style={{ transform: [{ scaleX: -1 }] }}>
              <Ionicons name="hammer" size={90} color="#F97316" />
            </View>
          </Animated.View>
        );
      })()}

      {/* KanDu Wordmark - appears with logo */}
      {phase !== 'crack' && (
        <Animated.View
          style={[
            styles.wordmarkContainer,
            {
              opacity: wordmarkOpacity,
              transform: [{ translateY: wordmarkTranslateY }],
            },
          ]}
        >
          <View style={styles.wordmarkTextWrapper}>
            <Text style={styles.wordmarkText}>KanDu</Text>
            <Text style={styles.wordmarkTM}>™</Text>
          </View>
        </Animated.View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
  },
  crackLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  crackSvg: {
    position: 'absolute',
  },
  glassHighlights: {
    ...StyleSheet.absoluteFillObject,
  },
  glassShard: {
    position: 'absolute',
    width: 20,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    borderRadius: 2,
  },
  impactRing: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 4,
    borderColor: '#10B981',
    backgroundColor: 'transparent',
  },
  logoGlow: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
  },
  glowGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 150,
  },
  logoContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  wordmarkContainer: {
    position: 'absolute',
    top: SCREEN_HEIGHT / 2 + 120,
  },
  wordmarkTextWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  wordmarkText: {
    fontSize: 42,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#ffffff',
  },
  wordmarkTM: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
    marginLeft: -2,
  },
});
