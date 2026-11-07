import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ColorValue, StyleProp, ViewStyle } from 'react-native';
import { View } from 'react-native';
import { colors } from '@/constants/theme';

type SymbolName = Extract<SymbolViewProps['name'], { ios?: unknown }>;
type Pair = { ios: NonNullable<SymbolName['ios']>; android: NonNullable<SymbolName['android']> };

/**
 * Semantic icon registry. Screens reference meaning (“wind”, “sync-pending”), never a
 * platform glyph, so the whole app stays visually consistent: SF Symbols on iOS and
 * Material Symbols on Android/web (both shipped by expo-symbols, no extra dependency).
 */
const registry = {
  // navigation
  today: { ios: 'sun.horizon', android: 'wb_twilight' },
  map: { ios: 'map', android: 'map' },
  log: { ios: 'book.closed', android: 'menu_book' },
  profile: { ios: 'person.crop.circle', android: 'account_circle' },
  'chevron-right': { ios: 'chevron.right', android: 'chevron_right' },
  back: { ios: 'chevron.left', android: 'arrow_back' },
  'chevron-down': { ios: 'chevron.down', android: 'expand_more' },
  'chevron-up': { ios: 'chevron.up', android: 'expand_less' },
  close: { ios: 'xmark', android: 'close' },
  plus: { ios: 'plus', android: 'add' },
  minus: { ios: 'minus', android: 'remove' },
  check: { ios: 'checkmark', android: 'check' },
  search: { ios: 'magnifyingglass', android: 'search' },
  filter: { ios: 'line.3.horizontal.decrease', android: 'filter_list' },
  external: { ios: 'arrow.up.right', android: 'open_in_new' },
  // season + water
  'open-water': { ios: 'water.waves', android: 'waves' },
  ice: { ios: 'snowflake', android: 'ac_unit' },
  lake: { ios: 'drop', android: 'water_drop' },
  pin: { ios: 'mappin', android: 'location_on' },
  north: { ios: 'location.north.fill', android: 'navigation' },
  // conditions
  'low-light': { ios: 'sunset', android: 'wb_twilight' },
  sun: { ios: 'sun.max', android: 'light_mode' },
  moon: { ios: 'moon', android: 'dark_mode' },
  cloud: { ios: 'cloud', android: 'cloud' },
  rain: { ios: 'cloud.rain', android: 'rainy' },
  wind: { ios: 'wind', android: 'air' },
  pressure: { ios: 'barometer', android: 'speed' },
  transition: { ios: 'sun.haze', android: 'routine' },
  calm: { ios: 'water.waves', android: 'waves' },
  temperature: { ios: 'thermometer.medium', android: 'thermostat' },
  // forecast
  clock: { ios: 'clock', android: 'schedule' },
  calendar: { ios: 'calendar', android: 'calendar_month' },
  chart: { ios: 'chart.bar', android: 'bar_chart' },
  tactics: { ios: 'scope', android: 'my_location' },
  depth: { ios: 'arrow.down.to.line', android: 'vertical_align_bottom' },
  clarity: { ios: 'eye', android: 'visibility' },
  lure: { ios: 'fish', android: 'phishing' },
  ruler: { ios: 'ruler', android: 'straighten' },
  notes: { ios: 'note.text', android: 'notes' },
  // status
  info: { ios: 'info.circle', android: 'info' },
  warning: { ios: 'exclamationmark.triangle', android: 'warning' },
  error: { ios: 'exclamationmark.octagon', android: 'error' },
  success: { ios: 'checkmark.circle', android: 'check_circle' },
  offline: { ios: 'wifi.slash', android: 'wifi_off' },
  refresh: { ios: 'arrow.clockwise', android: 'refresh' },
  'sync-pending': { ios: 'arrow.triangle.2.circlepath', android: 'sync' },
  'sync-done': { ios: 'checkmark.icloud', android: 'cloud_done' },
  'sync-error': { ios: 'exclamationmark.icloud', android: 'sync_problem' },
  device: { ios: 'iphone', android: 'smartphone' },
  lock: { ios: 'lock', android: 'lock' },
  shield: { ios: 'checkmark.shield', android: 'verified_user' },
  // account + settings
  bell: { ios: 'bell', android: 'notifications' },
  'bell-off': { ios: 'bell.slash', android: 'notifications_off' },
  quiet: { ios: 'moon.zzz', android: 'bedtime' },
  units: { ios: 'ruler', android: 'straighten' },
  export: { ios: 'square.and.arrow.up', android: 'ios_share' },
  restore: { ios: 'arrow.counterclockwise', android: 'restore' },
  trash: { ios: 'trash', android: 'delete' },
  link: { ios: 'link', android: 'link' },
  person: { ios: 'person', android: 'person' },
  document: { ios: 'doc.text', android: 'description' },
  request: { ios: 'plus.bubble', android: 'add_comment' },
  pro: { ios: 'star.circle', android: 'workspace_premium' },
  apple: { ios: 'apple.logo', android: 'phone_iphone' },
  settings: { ios: 'gearshape', android: 'settings' },
  plug: { ios: 'powerplug', android: 'power' },
} as const satisfies Record<string, Pair>;

export type IconName = keyof typeof registry;

export function Icon({
  name,
  size = 20,
  color = colors.ink,
  style,
}: {
  name: IconName;
  size?: number;
  color?: ColorValue;
  style?: StyleProp<ViewStyle>;
}) {
  const pair: Pair = registry[name];
  return (
    <View
      style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      aria-hidden
    >
      <SymbolView
        name={{ ios: pair.ios, android: pair.android, web: pair.android }}
        size={size}
        tintColor={color}
        weight="medium"
        resizeMode="scaleAspectFit"
        fallback={<View style={{ width: size, height: size }} />}
      />
    </View>
  );
}
