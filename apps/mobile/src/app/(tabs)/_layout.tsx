import { Tabs, router } from 'expo-router';
import { Pressable, StyleSheet, View, type ColorValue } from 'react-native';
import { Icon, type IconName } from '@/components/icon';
import { DeepWaterBar } from '@/components/deep-water-bar';
import { colors, elevation, TAB_BUTTON_RISE } from '@/constants/theme';
import { useLiveSky } from '@/features/live-sky';
import { onScene, TAB_PILL_TINT, tabWater } from '@/features/sky';
import { haptic } from '@/lib/haptics';

const tabIcon = (name: IconName) => function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
  return (
    <View style={styles.icon}>
      {/* Selection is a shape as well as a colour */}
      {focused ? <View style={styles.pill} /> : null}
      <Icon name={name} size={22} color={color} />
    </View>
  );
};

/** Raised centre button: logging a trip is the app's main action, reachable from every tab. */
function LogTripButton() {
  const { palette } = useLiveSky();
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
        style={({ pressed }) => [styles.button, { backgroundColor: tabWater(palette).top }, pressed && { transform: [{ scale: 0.94 }] }]}
      >
        {/* A filled disc on a filled ring: a border would let the fill bleed round its outside */}
        <View style={styles.disc}>
          <Icon name="plus" size={26} color={colors.deep} />
        </View>
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
        // The bar is deep water on every tab, so it needs light icons at every hour.
        tabBarBackground: () => <DeepWaterBar />,
        tabBarActiveTintColor: onScene.accent,
        tabBarInactiveTintColor: onScene.soft,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarStyle: { backgroundColor: 'transparent', borderTopWidth: 0, overflow: 'visible' },
        sceneStyle: { backgroundColor: colors.cream },
      }}
    >
      <Tabs.Screen name="today" options={{ title: 'Today', tabBarIcon: tabIcon('today'), tabBarBackground: () => <DeepWaterBar edge={false} /> }} />
      <Tabs.Screen name="map" options={{ title: 'Map', tabBarIcon: tabIcon('map') }} />
      <Tabs.Screen name="add" options={{ title: 'Log a trip', tabBarButton: () => <LogTripButton /> }} />
      <Tabs.Screen name="log" options={{ title: 'Log', tabBarIcon: tabIcon('log') }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: tabIcon('profile') }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center' },
  button: { width: 54, height: 54, marginTop: -TAB_BUTTON_RISE, borderRadius: 27, alignItems: 'center', justifyContent: 'center', ...elevation.raised },
  disc: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.onDark },
  icon: { width: 52, height: 28, alignItems: 'center', justifyContent: 'center' },
  pill: { position: 'absolute', top: 1, bottom: 1, left: 0, right: 0, borderRadius: 13, backgroundColor: onScene.accent, opacity: TAB_PILL_TINT },
});
