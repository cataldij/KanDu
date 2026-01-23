/**
 * AnimatedAnnotation - Draw annotations that animate like hand-drawing
 * Features hand-drawn wobble effect for natural, human feel
 * Uses react-native-reanimated + react-native-svg for smooth path animations
 */

import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import Svg, { Path, Circle as SvgCircle, G, Line } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  withDelay,
  withSequence,
  withRepeat,
  Easing,
  useAnimatedStyle,
} from 'react-native-reanimated';

// Create animated versions of SVG components
const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(SvgCircle);
const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedLine = Animated.createAnimatedComponent(Line);

// Annotation types
export type AnnotationType =
  | 'circle'      // Circle around an area (attention needed)
  | 'checkmark'   // Checkmark (good/done)
  | 'x'           // X mark (wrong/problem)
  | 'arrow'       // Arrow pointing to something
  | 'highlight'   // Highlight/pulse effect
  | 'pointer';    // Pin/pointer marker

export type AnnotationColor = 'green' | 'yellow' | 'red' | 'blue' | 'white' | 'cyan' | 'orange' | 'purple';

export interface Annotation {
  id: string;
  type: AnnotationType;
  x: number;           // X position (0-100 percentage of image width)
  y: number;           // Y position (0-100 percentage of image height)
  size?: number;       // Size multiplier (default 1)
  color?: AnnotationColor;
  label?: string;      // Optional text label
  voiceText?: string;  // Text to speak for this annotation
  delay?: number;      // Delay before animation starts (ms)
  // For arrows
  toX?: number;
  toY?: number;
}

interface AnimatedAnnotationProps {
  annotations: Annotation[];
  imageWidth: number;
  imageHeight: number;
  onAnnotationStart?: (annotation: Annotation, index: number) => void;
  onAnimationComplete?: () => void;
  handDrawn?: boolean; // Enable hand-drawn wobble effect
}

const COLORS: Record<string, string> = {
  green: '#22c55e',
  yellow: '#eab308',
  red: '#ef4444',
  blue: '#3b82f6',
  white: '#ffffff',
  cyan: '#06b6d4',    // For Q&A discussion annotations
  orange: '#f97316',  // Alternative attention color
  purple: '#8b5cf6',  // For highlighting
};

const DRAW_DURATION = 500; // ms to draw each annotation
const LABEL_FADE_DURATION = 300;

// Generate random wobble for hand-drawn effect
const wobble = (amount: number = 2): number => {
  return (Math.random() - 0.5) * amount;
};

// Generate a hand-drawn circle path (slightly imperfect)
const generateHandDrawnCircle = (cx: number, cy: number, radius: number): string => {
  const points = 24; // Number of points around the circle
  const pathPoints: string[] = [];

  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * Math.PI * 2;
    const wobbleRadius = radius + wobble(radius * 0.08);
    const x = cx + Math.cos(angle) * wobbleRadius + wobble(2);
    const y = cy + Math.sin(angle) * wobbleRadius + wobble(2);

    if (i === 0) {
      pathPoints.push(`M ${x} ${y}`);
    } else {
      // Use quadratic curves for smoother hand-drawn look
      const prevAngle = ((i - 0.5) / points) * Math.PI * 2;
      const cpRadius = radius + wobble(radius * 0.05);
      const cpX = cx + Math.cos(prevAngle) * cpRadius + wobble(3);
      const cpY = cy + Math.sin(prevAngle) * cpRadius + wobble(3);
      pathPoints.push(`Q ${cpX} ${cpY} ${x} ${y}`);
    }
  }

  return pathPoints.join(' ') + ' Z';
};

// Generate a hand-drawn checkmark path
const generateHandDrawnCheckmark = (x: number, y: number, scale: number): string => {
  const w = wobble;
  return `
    M ${x - scale * 0.5 + w(3)} ${y + w(2)}
    Q ${x - scale * 0.3 + w(2)} ${y + scale * 0.2 + w(2)} ${x - scale * 0.1 + w(2)} ${y + scale * 0.4 + w(2)}
    Q ${x + scale * 0.25 + w(2)} ${y + w(2)} ${x + scale * 0.6 + w(3)} ${y - scale * 0.4 + w(2)}
  `.trim();
};

// Generate a hand-drawn X path
const generateHandDrawnX = (x: number, y: number, scale: number): { line1: string; line2: string } => {
  const w = wobble;
  return {
    line1: `M ${x - scale + w(2)} ${y - scale + w(2)} L ${x + scale + w(2)} ${y + scale + w(2)}`,
    line2: `M ${x + scale + w(2)} ${y - scale + w(2)} L ${x - scale + w(2)} ${y + scale + w(2)}`,
  };
};

// Generate hand-drawn arrow path
const generateHandDrawnArrow = (
  x1: number, y1: number, x2: number, y2: number, headLength: number
): { line: string; head: string } => {
  const w = wobble;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const headAngle = Math.PI / 6;

  const head1X = x2 - headLength * Math.cos(angle - headAngle) + w(2);
  const head1Y = y2 - headLength * Math.sin(angle - headAngle) + w(2);
  const head2X = x2 - headLength * Math.cos(angle + headAngle) + w(2);
  const head2Y = y2 - headLength * Math.sin(angle + headAngle) + w(2);

  return {
    line: `M ${x1 + w(2)} ${y1 + w(2)} Q ${(x1 + x2) / 2 + w(4)} ${(y1 + y2) / 2 + w(4)} ${x2 + w(2)} ${y2 + w(2)}`,
    head: `M ${head1X} ${head1Y} L ${x2 + w(1)} ${y2 + w(1)} L ${head2X} ${head2Y}`,
  };
};

// Hand-drawn circle annotation
const HandDrawnCircleAnnotation: React.FC<{
  x: number;
  y: number;
  size: number;
  color: string;
  delay: number;
  onStart?: () => void;
}> = ({ x, y, size, color, delay, onStart }) => {
  const progress = useSharedValue(0);
  const radius = 30 * size;

  // Generate the hand-drawn path once
  const pathD = useMemo(() => generateHandDrawnCircle(x, y, radius), [x, y, radius]);
  const pathLength = 2 * Math.PI * radius * 1.1; // Approximate

  useEffect(() => {
    const timeout = setTimeout(() => {
      onStart?.();
    }, delay);

    progress.value = withDelay(
      delay,
      withTiming(1, { duration: DRAW_DURATION, easing: Easing.out(Easing.cubic) })
    );

    return () => clearTimeout(timeout);
  }, []);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: pathLength * (1 - progress.value),
  }));

  return (
    <AnimatedPath
      d={pathD}
      fill="none"
      stroke={color}
      strokeWidth={3 * size}
      strokeDasharray={pathLength}
      strokeLinecap="round"
      strokeLinejoin="round"
      animatedProps={animatedProps}
    />
  );
};

// Hand-drawn checkmark annotation
const HandDrawnCheckmark: React.FC<{
  x: number;
  y: number;
  size: number;
  color: string;
  delay: number;
  onStart?: () => void;
}> = ({ x, y, size, color, delay, onStart }) => {
  const progress = useSharedValue(0);
  const scale = 20 * size;

  const pathD = useMemo(() => generateHandDrawnCheckmark(x, y, scale), [x, y, scale]);
  const pathLength = scale * 1.8;

  useEffect(() => {
    const timeout = setTimeout(() => {
      onStart?.();
    }, delay);

    progress.value = withDelay(
      delay,
      withTiming(1, { duration: DRAW_DURATION, easing: Easing.out(Easing.cubic) })
    );

    return () => clearTimeout(timeout);
  }, []);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: pathLength * (1 - progress.value),
  }));

  return (
    <AnimatedPath
      d={pathD}
      fill="none"
      stroke={color}
      strokeWidth={4 * size}
      strokeDasharray={pathLength}
      strokeLinecap="round"
      strokeLinejoin="round"
      animatedProps={animatedProps}
    />
  );
};

// Hand-drawn X mark
const HandDrawnXMark: React.FC<{
  x: number;
  y: number;
  size: number;
  color: string;
  delay: number;
  onStart?: () => void;
}> = ({ x, y, size, color, delay, onStart }) => {
  const progress1 = useSharedValue(0);
  const progress2 = useSharedValue(0);
  const scale = 15 * size;

  const paths = useMemo(() => generateHandDrawnX(x, y, scale), [x, y, scale]);
  const lineLength = scale * 2 * Math.SQRT2 * 1.1;

  useEffect(() => {
    const timeout = setTimeout(() => {
      onStart?.();
    }, delay);

    progress1.value = withDelay(
      delay,
      withTiming(1, { duration: DRAW_DURATION * 0.6, easing: Easing.out(Easing.cubic) })
    );
    progress2.value = withDelay(
      delay + DRAW_DURATION * 0.4,
      withTiming(1, { duration: DRAW_DURATION * 0.6, easing: Easing.out(Easing.cubic) })
    );

    return () => clearTimeout(timeout);
  }, []);

  const animatedProps1 = useAnimatedProps(() => ({
    strokeDashoffset: lineLength * (1 - progress1.value),
  }));

  const animatedProps2 = useAnimatedProps(() => ({
    strokeDashoffset: lineLength * (1 - progress2.value),
  }));

  return (
    <G>
      <AnimatedPath
        d={paths.line1}
        fill="none"
        stroke={color}
        strokeWidth={4 * size}
        strokeDasharray={lineLength}
        strokeLinecap="round"
        animatedProps={animatedProps1}
      />
      <AnimatedPath
        d={paths.line2}
        fill="none"
        stroke={color}
        strokeWidth={4 * size}
        strokeDasharray={lineLength}
        strokeLinecap="round"
        animatedProps={animatedProps2}
      />
    </G>
  );
};

// Hand-drawn arrow
const HandDrawnArrow: React.FC<{
  x: number;
  y: number;
  toX: number;
  toY: number;
  size: number;
  color: string;
  delay: number;
  onStart?: () => void;
}> = ({ x, y, toX, toY, size, color, delay, onStart }) => {
  const progress = useSharedValue(0);
  const arrowHeadProgress = useSharedValue(0);

  const dx = toX - x;
  const dy = toY - y;
  const lineLength = Math.sqrt(dx * dx + dy * dy) * 1.1;
  const headLength = 12 * size;

  const paths = useMemo(
    () => generateHandDrawnArrow(x, y, toX, toY, headLength),
    [x, y, toX, toY, headLength]
  );
  const arrowHeadLength = headLength * 2.5;

  useEffect(() => {
    const timeout = setTimeout(() => {
      onStart?.();
    }, delay);

    progress.value = withDelay(
      delay,
      withTiming(1, { duration: DRAW_DURATION, easing: Easing.out(Easing.cubic) })
    );
    arrowHeadProgress.value = withDelay(
      delay + DRAW_DURATION * 0.7,
      withTiming(1, { duration: DRAW_DURATION * 0.4, easing: Easing.out(Easing.cubic) })
    );

    return () => clearTimeout(timeout);
  }, []);

  const lineProps = useAnimatedProps(() => ({
    strokeDashoffset: lineLength * (1 - progress.value),
  }));

  const headProps = useAnimatedProps(() => ({
    strokeDashoffset: arrowHeadLength * (1 - arrowHeadProgress.value),
  }));

  return (
    <G>
      <AnimatedPath
        d={paths.line}
        fill="none"
        stroke={color}
        strokeWidth={3 * size}
        strokeDasharray={lineLength}
        strokeLinecap="round"
        animatedProps={lineProps}
      />
      <AnimatedPath
        d={paths.head}
        fill="none"
        stroke={color}
        strokeWidth={3 * size}
        strokeDasharray={arrowHeadLength}
        strokeLinecap="round"
        strokeLinejoin="round"
        animatedProps={headProps}
      />
    </G>
  );
};

// Pointer/Pin annotation
const HandDrawnPointer: React.FC<{
  x: number;
  y: number;
  size: number;
  color: string;
  delay: number;
  onStart?: () => void;
}> = ({ x, y, size, color, delay, onStart }) => {
  const progress = useSharedValue(0);
  const scale = 12 * size;

  const pathD = useMemo(() => {
    const w = wobble;
    return `
      M ${x + w(1)} ${y + scale * 1.5 + w(1)}
      C ${x - scale + w(2)} ${y + scale * 0.5 + w(2)} ${x - scale + w(2)} ${y - scale * 0.5 + w(2)} ${x + w(1)} ${y - scale + w(1)}
      C ${x + scale + w(2)} ${y - scale * 0.5 + w(2)} ${x + scale + w(2)} ${y + scale * 0.5 + w(2)} ${x + w(1)} ${y + scale * 1.5 + w(1)}
      Z
    `.trim();
  }, [x, y, scale]);
  const pathLength = scale * 5;

  useEffect(() => {
    const timeout = setTimeout(() => {
      onStart?.();
    }, delay);

    progress.value = withDelay(
      delay,
      withTiming(1, { duration: DRAW_DURATION, easing: Easing.out(Easing.cubic) })
    );

    return () => clearTimeout(timeout);
  }, []);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: pathLength * (1 - progress.value),
    fillOpacity: progress.value,
  }));

  return (
    <AnimatedPath
      d={pathD}
      fill={color}
      stroke={color}
      strokeWidth={2 * size}
      strokeDasharray={pathLength}
      animatedProps={animatedProps}
    />
  );
};

// Highlight/pulse effect
const HandDrawnHighlight: React.FC<{
  x: number;
  y: number;
  size: number;
  color: string;
  delay: number;
  onStart?: () => void;
}> = ({ x, y, size, color, delay, onStart }) => {
  const progress = useSharedValue(0);
  const pulse = useSharedValue(1);
  const radius = 35 * size;

  useEffect(() => {
    const timeout = setTimeout(() => {
      onStart?.();
    }, delay);

    progress.value = withDelay(
      delay,
      withTiming(1, { duration: DRAW_DURATION * 0.5, easing: Easing.out(Easing.cubic) })
    );

    // Subtle continuous pulse
    pulse.value = withDelay(
      delay + DRAW_DURATION * 0.5,
      withRepeat(
        withSequence(
          withTiming(1.15, { duration: 800, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        false
      )
    );

    return () => clearTimeout(timeout);
  }, []);

  const animatedProps = useAnimatedProps(() => ({
    opacity: progress.value * 0.25,
    r: radius * pulse.value,
  }));

  return (
    <AnimatedCircle
      cx={x}
      cy={y}
      fill={color}
      animatedProps={animatedProps}
    />
  );
};

// VH1-style popup label with speech bubble effect
const PopupLabel: React.FC<{
  x: number;
  y: number;
  text: string;
  color: string;
  delay: number;
  imageWidth: number;
}> = ({ x, y, text, color, delay, imageWidth }) => {
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.8);
  const translateY = useSharedValue(15);

  useEffect(() => {
    opacity.value = withDelay(
      delay + DRAW_DURATION,
      withTiming(1, { duration: LABEL_FADE_DURATION, easing: Easing.out(Easing.back(1.5)) })
    );
    scale.value = withDelay(
      delay + DRAW_DURATION,
      withTiming(1, { duration: LABEL_FADE_DURATION, easing: Easing.out(Easing.back(1.5)) })
    );
    translateY.value = withDelay(
      delay + DRAW_DURATION,
      withTiming(0, { duration: LABEL_FADE_DURATION })
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { scale: scale.value },
      { translateY: translateY.value },
    ],
  }));

  // Position label smartly - avoid edges
  const labelX = Math.max(20, Math.min(x, imageWidth - 100));
  const labelY = y + 45;

  return (
    <Animated.View
      style={[
        styles.popupLabelContainer,
        { left: labelX - 60, top: labelY },
        animatedStyle,
      ]}
    >
      {/* Speech bubble tail */}
      <View style={[styles.popupTail, { borderBottomColor: color }]} />
      <View style={[styles.popupLabelBg, { backgroundColor: color }]}>
        <Text style={styles.popupLabelText}>{text}</Text>
      </View>
    </Animated.View>
  );
};

// Main component
export const AnimatedAnnotation: React.FC<AnimatedAnnotationProps> = ({
  annotations,
  imageWidth,
  imageHeight,
  onAnnotationStart,
  onAnimationComplete,
  handDrawn = true,
}) => {
  // Calculate total animation time for callback
  useEffect(() => {
    if (onAnimationComplete && annotations.length > 0) {
      const maxDelay = Math.max(...annotations.map(a => a.delay || 0));
      const totalTime = maxDelay + DRAW_DURATION + LABEL_FADE_DURATION + 200;
      const timeout = setTimeout(onAnimationComplete, totalTime);
      return () => clearTimeout(timeout);
    }
  }, [annotations, onAnimationComplete]);

  const renderAnnotation = (annotation: Annotation, index: number) => {
    // Convert percentage positions to pixel positions
    const x = (annotation.x / 100) * imageWidth;
    const y = (annotation.y / 100) * imageHeight;
    const toX = annotation.toX ? (annotation.toX / 100) * imageWidth : x;
    const toY = annotation.toY ? (annotation.toY / 100) * imageHeight : y;
    const size = annotation.size || 1;
    const color = COLORS[annotation.color || 'yellow'];
    const delay = annotation.delay || 0;

    const handleStart = () => {
      onAnnotationStart?.(annotation, index);
    };

    switch (annotation.type) {
      case 'circle':
        return (
          <HandDrawnCircleAnnotation
            key={annotation.id}
            x={x}
            y={y}
            size={size}
            color={color}
            delay={delay}
            onStart={handleStart}
          />
        );
      case 'checkmark':
        return (
          <HandDrawnCheckmark
            key={annotation.id}
            x={x}
            y={y}
            size={size}
            color={color}
            delay={delay}
            onStart={handleStart}
          />
        );
      case 'x':
        return (
          <HandDrawnXMark
            key={annotation.id}
            x={x}
            y={y}
            size={size}
            color={color}
            delay={delay}
            onStart={handleStart}
          />
        );
      case 'arrow':
        return (
          <HandDrawnArrow
            key={annotation.id}
            x={x}
            y={y}
            toX={toX}
            toY={toY}
            size={size}
            color={color}
            delay={delay}
            onStart={handleStart}
          />
        );
      case 'pointer':
        return (
          <HandDrawnPointer
            key={annotation.id}
            x={x}
            y={y}
            size={size}
            color={color}
            delay={delay}
            onStart={handleStart}
          />
        );
      case 'highlight':
        return (
          <HandDrawnHighlight
            key={annotation.id}
            x={x}
            y={y}
            size={size}
            color={color}
            delay={delay}
            onStart={handleStart}
          />
        );
      default:
        return null;
    }
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={imageWidth} height={imageHeight} style={StyleSheet.absoluteFill}>
        {annotations.map(renderAnnotation)}
      </Svg>

      {/* Render VH1-style popup labels outside SVG for better text rendering */}
      {annotations
        .filter(a => a.label)
        .map(annotation => {
          const x = (annotation.x / 100) * imageWidth;
          const y = (annotation.y / 100) * imageHeight;
          const color = COLORS[annotation.color || 'yellow'];
          return (
            <PopupLabel
              key={`label-${annotation.id}`}
              x={x}
              y={y}
              text={annotation.label!}
              color={color}
              delay={annotation.delay || 0}
              imageWidth={imageWidth}
            />
          );
        })}
    </View>
  );
};

const styles = StyleSheet.create({
  popupLabelContainer: {
    position: 'absolute',
    alignItems: 'center',
  },
  popupTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginBottom: -1,
  },
  popupLabelBg: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 6,
    minWidth: 60,
    alignItems: 'center',
  },
  popupLabelText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});

export default AnimatedAnnotation;
