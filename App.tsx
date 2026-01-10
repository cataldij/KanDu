import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, TouchableOpacity, Image } from 'react-native';

export default function App() {
  const categories = [
    { name: 'Appliances', emoji: '🔧', id: 'appliances' },
    { name: 'HVAC', emoji: '❄️', id: 'hvac' },
    { name: 'Plumbing', emoji: '🚰', id: 'plumbing' },
    { name: 'Electrical', emoji: '⚡', id: 'electrical' },
  ];

  const handleCategoryPress = (categoryId: string) => {
    console.log(`Selected category: ${categoryId}`);
  };

  return (
    <View style={styles.container}>
      <StatusBar style="auto" />

      <Image
        source={require('./assets/KanDu logo.png')}
        style={styles.logo}
        resizeMode="contain"
      />

      <Text style={styles.title}>What needs fixing?</Text>

      <View style={styles.categoriesContainer}>
        {categories.map((category) => (
          <TouchableOpacity
            key={category.id}
            style={styles.categoryButton}
            onPress={() => handleCategoryPress(category.id)}
            activeOpacity={0.7}
          >
            <Text style={styles.emoji}>{category.emoji}</Text>
            <Text style={styles.categoryText}>{category.name}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f7fb',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  logo: {
    width: 200,
    height: 80,
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1E5AA8',
    marginBottom: 40,
  },
  categoriesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 16,
    maxWidth: 400,
  },
  categoryButton: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    width: 160,
    height: 160,
    shadowColor: '#17A2B8',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 2,
    borderColor: '#C2E7EC',
  },
  emoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  categoryText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1E5AA8',
  },
});
