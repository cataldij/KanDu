/**
 * DiagnosisLoadingOverlay Component
 *
 * Full-screen overlay shown during diagnosis with animated KanDu logo.
 * Provides a branded loading experience while the AI analyzes the image/video.
 * When loading completes, triggers a particle burst animation before transitioning.
 */

import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Modal, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import AnimatedLogo from './AnimatedLogo';

interface DiagnosisLoadingOverlayProps {
  visible: boolean;
  isLoading?: boolean; // When false, triggers particle burst animation
  onAnimationComplete?: () => void; // Called after burst animation finishes
  messages?: string[];
  subtitle?: string;
}

const DEFAULT_LOADING_MESSAGES = [
  'Analyzing your image...',
  'Identifying the issue...',
  'Checking possible causes...',
  'Preparing your diagnosis...',
  'Almost there...',
];

export const ADVANCED_LOADING_MESSAGES = [
  'Running advanced analysis...',
  'Identifying parts and tools...',
  'Building step-by-step guide...',
  'Checking safety warnings...',
  'Preparing detailed instructions...',
];

export default function DiagnosisLoadingOverlay({
  visible,
  isLoading = true,
  onAnimationComplete,
  messages,
  subtitle,
}: DiagnosisLoadingOverlayProps) {
  const [messageIndex, setMessageIndex] = useState(0);

  // Animation for fading out text when burst happens
  const textOpacity = useRef(new Animated.Value(1)).current;
  const screenFade = useRef(new Animated.Value(1)).current;

  // Use provided messages or default
  const loadingMessages = messages || DEFAULT_LOADING_MESSAGES;
  const subtitleText = subtitle || 'Our AI is carefully examining your submission';

  useEffect(() => {
    if (!visible) {
      setMessageIndex(0);
      textOpacity.setValue(1);
      screenFade.setValue(1);
      return;
    }

    // Cycle through messages every 3 seconds
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % loadingMessages.length);
    }, 3000);

    return () => clearInterval(interval);
  }, [visible, loadingMessages.length]);

  // When loading completes, fade out the text and screen
  useEffect(() => {
    if (!isLoading && visible) {
      // Fade out text quickly when burst starts
      Animated.timing(textOpacity, {
        toValue: 0,
        duration: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();

      // Fade out the entire screen in sync with the particle animation
      // 500ms total burst duration - start fading at 200ms, complete by 500ms
      Animated.timing(screenFade, {
        toValue: 0,
        duration: 300,
        delay: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
  }, [isLoading, visible]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <Animated.View style={[styles.container, { opacity: screenFade }]}>
        <LinearGradient
          colors={['rgba(15, 23, 42, 0.97)', 'rgba(30, 41, 59, 0.97)']}
          style={styles.gradient}
        >
          <View style={styles.content}>
            {/* Animated Logo */}
            <View style={styles.logoContainer}>
              <AnimatedLogo
                size={140}
                isLoading={isLoading}
                onAnimationComplete={onAnimationComplete}
              />
            </View>

            {/* Loading Text - fades out during burst */}
            <Animated.View style={{ opacity: textOpacity }}>
              <Text style={styles.loadingText}>
                {!isLoading ? 'Done!' : loadingMessages[messageIndex]}
              </Text>

              {/* Subtle hint */}
              <Text style={styles.hintText}>
                {!isLoading ? '' : subtitleText}
              </Text>

              {/* Progress dots */}
              <View style={styles.dotsContainer}>
                {[0, 1, 2].map((i) => (
                  <View
                    key={i}
                    style={[
                      styles.dot,
                      {
                        opacity: !isLoading ? 1 : ((messageIndex % 3) >= i ? 1 : 0.3),
                        backgroundColor: !isLoading ? '#10B981' : '#10B981',
                      }
                    ]}
                  />
                ))}
              </View>
            </Animated.View>
          </View>
        </LinearGradient>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  logoContainer: {
    marginBottom: 40,
  },
  loadingText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 12,
  },
  hintText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
    marginBottom: 30,
  },
  dotsContainer: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
});
