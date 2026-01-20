/**
 * HouseIcon - Renders a house outline (matching KanDu logo style) with an icon inside
 * Uses the EXACT same SVG path as AnimatedLogo (without the checkmark)
 * Used in the hero sections of Learn It, Plan It, Do It screens
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';

interface HouseIconProps {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  size?: number;
  gradientColors?: [string, string, string];
}

export default function HouseIcon({
  icon,
  iconColor = '#fff',
  size = 80,
  gradientColors = ['#3B82F6', '#06B6D4', '#10B981'],
}: HouseIconProps) {
  const strokeWidth = 6;
  const iconSize = size * 0.35;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {/* House outline SVG - EXACT path from AnimatedLogo (without checkmark) */}
      <Svg width={size} height={size} viewBox="0 0 100 100" style={styles.svg}>
        <Defs>
          <SvgLinearGradient id="houseGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={gradientColors[0]} />
            <Stop offset="50%" stopColor={gradientColors[1]} />
            <Stop offset="100%" stopColor={gradientColors[2]} />
          </SvgLinearGradient>
        </Defs>
        {/* House shape with speech bubble tail - matches AnimatedLogo exactly */}
        <Path
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
          stroke="url(#houseGradient)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>

      {/* Icon in center - positioned slightly higher to account for speech bubble tail */}
      <View style={styles.iconContainer}>
        <Ionicons name={icon} size={iconSize} color={iconColor} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  svg: {
    position: 'absolute',
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -8, // Offset to center icon in house body (above the speech bubble tail)
  },
});
