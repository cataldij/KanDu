/**
 * HouseTile - Renders a tile in the shape of the KanDu house icon
 * Uses SVG Path with gradient fill for the house shape
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, {
  Defs,
  Path,
  LinearGradient as SvgLinearGradient,
  Stop,
} from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';

interface HouseTileProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  subtext: string;
  gradientColors: [string, string];
  size?: number;
  id: string; // Unique ID for gradient references
}

export default function HouseTile({
  icon,
  label,
  subtext,
  gradientColors,
  size = 160,
  id,
}: HouseTileProps) {
  // House shape - viewBox is cropped tight to the path bounds (x: 10-90, y: 8-92)
  // Path width = 80, path height = 84, so aspect ratio ~= 0.95
  const height = size * 1.05;

  // House path - coordinates relative to original 0-100 viewBox
  const housePath = `
    M50 8
    L85 32
    Q90 36 90 44
    L90 68
    Q90 74 84 76
    L76 76
    L64 92
    L64 76
    L16 76
    Q10 74 10 68
    L10 44
    Q10 36 15 32
    L50 8
    Z
  `;

  // Unique gradient IDs to avoid conflicts between tiles
  const bgGradientId = `bgGradient-${id}`;
  const sheenGradientId = `sheenGradient-${id}`;

  return (
    <View style={[styles.container, { width: size, height }]}>
      {/* viewBox cropped to house bounds: x=10, y=8, width=80, height=84 */}
      <Svg width={size} height={height} viewBox="8 6 84 88">
        <Defs>
          {/* Background gradient */}
          <SvgLinearGradient id={bgGradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={gradientColors[0]} />
            <Stop offset="100%" stopColor={gradientColors[1]} />
          </SvgLinearGradient>

          {/* Glass sheen gradient - semi-transparent white overlay */}
          <SvgLinearGradient id={sheenGradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.3} />
            <Stop offset="50%" stopColor="#FFFFFF" stopOpacity={0.1} />
            <Stop offset="100%" stopColor="#FFFFFF" stopOpacity={0} />
          </SvgLinearGradient>
        </Defs>

        {/* House shape with gradient fill */}
        <Path
          d={housePath}
          fill={`url(#${bgGradientId})`}
        />

        {/* Glass sheen overlay */}
        <Path
          d={housePath}
          fill={`url(#${sheenGradientId})`}
        />

        {/* Checkmark watermark - positioned in lower portion */}
        <Path
          d="M35 58 L45 68 L65 48"
          fill="none"
          stroke="rgba(255, 255, 255, 0.08)"
          strokeWidth={10}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>

      {/* Content overlay - icon, label, subtext */}
      <View style={styles.contentOverlay}>
        <Ionicons name={icon} size={36} color="#FFFFFF" style={styles.icon} />
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.subtext}>{subtext}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  contentOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 4,
    paddingBottom: 20, // Offset for speech bubble tail
  },
  icon: {
    marginBottom: 6,
  },
  label: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  subtext: {
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    marginTop: 2,
  },
});
