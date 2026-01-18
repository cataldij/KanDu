import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Animated,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

interface VideoCompressionModalProps {
  visible: boolean;
  progress: number; // 0 to 1
  status?: 'compressing' | 'complete' | 'error';
}

export default function VideoCompressionModal({
  visible,
  progress,
  status = 'compressing',
}: VideoCompressionModalProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  const checkmarkScale = useRef(new Animated.Value(0)).current;

  // Pulse animation for the icon
  useEffect(() => {
    if (visible && status === 'compressing') {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.1,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [visible, status]);

  // Shimmer animation for the progress bar
  useEffect(() => {
    if (visible && status === 'compressing') {
      const shimmer = Animated.loop(
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        })
      );
      shimmer.start();
      return () => shimmer.stop();
    }
  }, [visible, status]);

  // Checkmark animation on complete
  useEffect(() => {
    if (status === 'complete') {
      Animated.spring(checkmarkScale, {
        toValue: 1,
        friction: 4,
        tension: 100,
        useNativeDriver: true,
      }).start();
    } else {
      checkmarkScale.setValue(0);
    }
  }, [status]);

  const shimmerTranslate = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-100, width],
  });

  const progressPercent = Math.round(progress * 100);
  const progressWidth = `${Math.min(progress * 100, 100)}%`;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Icon */}
          <Animated.View
            style={[
              styles.iconContainer,
              { transform: [{ scale: status === 'compressing' ? pulseAnim : 1 }] },
            ]}
          >
            {status === 'complete' ? (
              <Animated.View style={{ transform: [{ scale: checkmarkScale }] }}>
                <LinearGradient
                  colors={['#10B981', '#059669']}
                  style={styles.iconGradient}
                >
                  <Ionicons name="checkmark" size={32} color="#fff" />
                </LinearGradient>
              </Animated.View>
            ) : status === 'error' ? (
              <LinearGradient
                colors={['#EF4444', '#DC2626']}
                style={styles.iconGradient}
              >
                <Ionicons name="alert" size={32} color="#fff" />
              </LinearGradient>
            ) : (
              <LinearGradient
                colors={['#3B82F6', '#2563EB']}
                style={styles.iconGradient}
              >
                <Ionicons name="videocam" size={32} color="#fff" />
              </LinearGradient>
            )}
          </Animated.View>

          {/* Title */}
          <Text style={styles.title}>
            {status === 'complete'
              ? 'Video Ready!'
              : status === 'error'
              ? 'Compression Failed'
              : 'Optimizing Video'}
          </Text>

          {/* Subtitle */}
          <Text style={styles.subtitle}>
            {status === 'complete'
              ? 'Your video is ready for analysis'
              : status === 'error'
              ? 'Please try again with a shorter video'
              : 'Making your video perfect for AI analysis...'}
          </Text>

          {/* Progress Bar */}
          {status === 'compressing' && (
            <View style={styles.progressContainer}>
              <View style={styles.progressBackground}>
                <LinearGradient
                  colors={['#3B82F6', '#8B5CF6', '#3B82F6']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[styles.progressFill, { width: progressWidth as any }]}
                >
                  {/* Shimmer effect */}
                  <Animated.View
                    style={[
                      styles.shimmer,
                      { transform: [{ translateX: shimmerTranslate }] },
                    ]}
                  />
                </LinearGradient>
              </View>

              {/* Percentage */}
              <Text style={styles.percentage}>{progressPercent}%</Text>
            </View>
          )}

          {/* Size info */}
          {status === 'compressing' && (
            <Text style={styles.sizeInfo}>
              Reducing file size while maintaining quality
            </Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    backgroundColor: '#1F2937',
    borderRadius: 24,
    padding: 32,
    width: width - 64,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 20,
  },
  iconContainer: {
    marginBottom: 20,
  },
  iconGradient: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  progressContainer: {
    width: '100%',
    alignItems: 'center',
  },
  progressBackground: {
    width: '100%',
    height: 8,
    backgroundColor: '#374151',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
    overflow: 'hidden',
  },
  shimmer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    width: 100,
  },
  percentage: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    marginTop: 16,
  },
  sizeInfo: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 12,
    textAlign: 'center',
  },
});
