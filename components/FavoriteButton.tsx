/**
 * FavoriteButton Component
 * Reusable heart button for adding/removing items from favorites
 */

import React, { useState, useEffect } from 'react';
import {
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';

interface FavoriteButtonProps {
  category: 'recipes' | 'projects' | 'articles' | 'tools';
  itemId: string;
  itemName: string;
  itemData?: any;
  size?: number;
  style?: ViewStyle;
  activeColor?: string;
  inactiveColor?: string;
  onToggle?: (isFavorite: boolean) => void;
}

export default function FavoriteButton({
  category,
  itemId,
  itemName,
  itemData = {},
  size = 24,
  style,
  activeColor = '#ef4444',
  inactiveColor = '#94a3b8',
  onToggle,
}: FavoriteButtonProps) {
  const { user } = useAuth();
  const [isFavorite, setIsFavorite] = useState(false);
  const [loading, setLoading] = useState(false);
  const scaleAnim = new Animated.Value(1);

  // Check if item is favorited on mount
  useEffect(() => {
    if (user) {
      checkFavoriteStatus();
    }
  }, [user, itemId]);

  const checkFavoriteStatus = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('favorites')
        .select('id')
        .eq('user_id', user.id)
        .eq('category', category)
        .eq('item_id', itemId)
        .single();

      if (!error && data) {
        setIsFavorite(true);
      }
    } catch (error) {
      // Item not favorited, ignore error
    }
  };

  const animatePress = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 1.3,
        duration: 150,
        easing: Easing.out(Easing.back(2)),
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 150,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();
  };

  const toggleFavorite = async () => {
    if (!user || loading) return;

    setLoading(true);
    animatePress();

    try {
      if (isFavorite) {
        // Remove from favorites
        const { error } = await supabase
          .from('favorites')
          .delete()
          .eq('user_id', user.id)
          .eq('category', category)
          .eq('item_id', itemId);

        if (!error) {
          setIsFavorite(false);
          onToggle?.(false);
        }
      } else {
        // Add to favorites
        const { error } = await supabase
          .from('favorites')
          .insert({
            user_id: user.id,
            category,
            item_id: itemId,
            item_name: itemName,
            item_data: itemData,
          });

        if (!error) {
          setIsFavorite(true);
          onToggle?.(true);
        }
      }
    } catch (error) {
      console.error('Error toggling favorite:', error);
    } finally {
      setLoading(false);
    }
  };

  // Don't render if user is not logged in
  if (!user) return null;

  return (
    <TouchableOpacity
      style={[styles.button, style]}
      onPress={toggleFavorite}
      activeOpacity={0.7}
      disabled={loading}
    >
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        <Ionicons
          name={isFavorite ? 'heart' : 'heart-outline'}
          size={size}
          color={isFavorite ? activeColor : inactiveColor}
        />
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
