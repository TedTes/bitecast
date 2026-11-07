import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';
import { Icon, type IconName } from '@/components/icon';
import { colors } from '@/constants/theme';

const tabIcon = (name: IconName) => function TabIcon({ color }: { color: ColorValue }) {
  return <Icon name={name} size={24} color={color} />;
};

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
      <Tabs.Screen name="log" options={{ title: 'Log', tabBarIcon: tabIcon('log') }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: tabIcon('profile') }} />
    </Tabs>
  );
}
