import { Tabs, router } from 'expo-router';
import { Pressable, StyleSheet, View, type ColorValue } from 'react-native';
import { Icon, type IconName } from '@/components/icon';
import { colors, elevation } from '@/constants/theme';
import { haptic } from '@/lib/haptics';

const tabIcon = (name: IconName) => function TabIcon({ color }: { color: ColorValue }) {
  return <Icon name={name} size={24} color={color} />;
};

/** Raised centre button: logging a trip is the app's main action, reachable from every tab. */
function LogTripButton() {
  return (
    <View style={styles.centre}>
      <Pressable
        onPress={() => {
          haptic.select();
          router.push('/log/new');
        }}
        accessibilityRole="button"
        accessibilityLabel="Log a trip"
        accessibilityHint="Catch and no-catch trips both count"
        style={({ pressed }) => [styles.button, pressed && { transform: [{ scale: 0.94 }] }]}
      >
        <Icon name="plus" size={26} color={colors.onDark} />
      </Pressable>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        animation: 'shift',
        tabBarActiveTintColor: colors.teal,
        tabBarInactiveTintColor: colors.inkMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
        tabBarStyle: { backgroundColor: colors.paper, borderTopColor: colors.line },
        sceneStyle: { backgroundColor: colors.cream },
      }}
    >
      <Tabs.Screen name="today" options={{ title: 'Today', tabBarIcon: tabIcon('today') }} />
      <Tabs.Screen name="map" options={{ title: 'Map', tabBarIcon: tabIcon('map') }} />
      <Tabs.Screen name="add" options={{ title: 'Log a trip', tabBarButton: () => <LogTripButton /> }} />
      <Tabs.Screen name="log" options={{ title: 'Log', tabBarIcon: tabIcon('log') }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: tabIcon('profile') }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center' },
  button: { width: 58, height: 58, marginTop: -20, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.deep, borderWidth: 4, borderColor: colors.paper, ...elevation.raised },
});
