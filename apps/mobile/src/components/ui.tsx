import { useEffect, type PropsWithChildren, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type AccessibilityActionEvent,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedKeyboard,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, elevation, hitSlop, radius, spacing, touch, type, type TypeVariant } from '@/constants/theme';
import { haptic } from '@/lib/haptics';
import { useAppStore } from '@/store/use-app-store';
import { Icon, type IconName } from './icon';

/* ───────────────────────────── Typography ───────────────────────────── */

type TProps = TextProps & {
  variant?: TypeVariant;
  color?: string;
  align?: TextStyle['textAlign'];
  weight?: TextStyle['fontWeight'];
  style?: StyleProp<TextStyle>;
};

/** The only text primitive. Applies the type scale and Dynamic Type caps. */
export function T({ variant = 'body', color = colors.ink, align, weight, style, children, ...props }: PropsWithChildren<TProps>) {
  const { maxScale, ...variantStyle } = type[variant];
  return (
    <Text
      maxFontSizeMultiplier={maxScale}
      {...props}
      style={[variantStyle as TextStyle, { color }, align && { textAlign: align }, weight && { fontWeight: weight }, style]}
    >
      {children}
    </Text>
  );
}

export function Eyebrow({ children, color = colors.teal }: PropsWithChildren<{ color?: string }>) {
  return <T variant="label" color={color}>{children}</T>;
}

export function Title({ children, size = 'large', color = colors.ink }: PropsWithChildren<{ size?: 'large' | 'medium'; color?: string }>) {
  return <T variant={size === 'large' ? 'display' : 'title'} color={color} accessibilityRole="header">{children}</T>;
}

export function Body({ children, muted = false, style, align }: PropsWithChildren<{ muted?: boolean; style?: StyleProp<TextStyle>; align?: TextStyle['textAlign'] }>) {
  return <T color={muted ? colors.inkMuted : colors.ink} style={style} align={align}>{children}</T>;
}

/** Screen intro: eyebrow, serif title, optional lede. */
export function PageHeader({ eyebrow, title, lede, right }: { eyebrow?: string; title: string; lede?: string; right?: ReactNode }) {
  return (
    <View style={styles.pageHeader}>
      <View style={styles.pageHeaderRow}>
        <View style={{ flex: 1, gap: spacing.xs }}>
          {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
          <Title>{title}</Title>
        </View>
        {right}
      </View>
      {lede ? <Body muted>{lede}</Body> : null}
    </View>
  );
}

export function SectionHeader({ title, caption, action }: { title: string; caption?: string; action?: ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="headline" accessibilityRole="header">{title}</T>
        {caption ? <T variant="caption" color={colors.inkMuted}>{caption}</T> : null}
      </View>
      {action}
    </View>
  );
}

/* ───────────────────────────── Layout ───────────────────────────── */

type ScreenProps = PropsWithChildren<{
  scroll?: boolean;
  /** Native stack header is visible → skip the top safe-area inset. */
  header?: boolean;
  /** Rendered inside a tab navigator → tab bar owns the bottom inset. */
  tab?: boolean;
  /** Sticky bottom action area (thumb zone). Lifts above the keyboard on iOS. */
  footer?: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  style?: StyleProp<ViewStyle>;
  background?: string;
}>;

export function Screen({ children, scroll = true, header = false, tab = false, footer, refreshing, onRefresh, style, background = colors.cream }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const keyboard = useAnimatedKeyboard();
  const bottomInset = tab ? 0 : insets.bottom;
  // Android resizes the window for the keyboard; iOS needs the sticky footer lifted.
  const liftFooter = Platform.OS === 'ios' && Boolean(footer);
  const lift = useAnimatedStyle(() => {
    if (!liftFooter) return { paddingBottom: 0 };
    return { paddingBottom: Math.max(0, keyboard.height.value - bottomInset) };
  });
  const content = (
    <View style={[styles.screenContent, { paddingBottom: footer ? spacing.xl : spacing.xxl + bottomInset }, style]}>{children}</View>
  );
  return (
    <Animated.View style={[{ flex: 1, backgroundColor: background, paddingTop: header ? 0 : insets.top }, lift]}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets={!footer}
          refreshControl={onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={colors.teal} colors={[colors.teal]} /> : undefined}
        >
          {content}
        </ScrollView>
      ) : (
        content
      )}
      {footer ? (
        <View style={[styles.footer, { paddingBottom: spacing.md + bottomInset, backgroundColor: background, borderTopColor: background === colors.deep ? colors.deepLine : colors.line }]}>{footer}</View>
      ) : null}
    </Animated.View>
  );
}

/** Staggered, restrained entrance. Respects the OS “reduce motion” setting. */
export function Reveal({ children, index = 0, style }: PropsWithChildren<{ index?: number; style?: StyleProp<ViewStyle> }>) {
  const reduced = useReducedMotion();
  if (reduced) return <View style={style}>{children}</View>;
  return (
    <Animated.View entering={FadeInDown.duration(320).delay(Math.min(index, 6) * 50)} style={style}>
      {children}
    </Animated.View>
  );
}

export function Row({ children, gap = spacing.sm, align = 'center', justify, wrap, style, ...props }: PropsWithChildren<Omit<ViewProps, 'style'> & { gap?: number; align?: ViewStyle['alignItems']; justify?: ViewStyle['justifyContent']; wrap?: boolean; style?: StyleProp<ViewStyle> }>) {
  return <View {...props} style={[{ flexDirection: 'row', alignItems: align, gap, justifyContent: justify, flexWrap: wrap ? 'wrap' : undefined }, style]}>{children}</View>;
}

export function Divider({ inset = 0, color = colors.line }: { inset?: number; color?: string }) {
  return <View style={{ height: StyleSheet.hairlineWidth * 2, backgroundColor: color, marginLeft: inset }} />;
}

/* ───────────────────────────── Surfaces ───────────────────────────── */

type CardVariant = 'surface' | 'sunken' | 'ink' | 'outline' | 'tint';
type CardProps = PropsWithChildren<{
  variant?: CardVariant;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}>;

export function Card({ children, variant = 'surface', style, onPress, accessibilityLabel, accessibilityHint }: CardProps) {
  const base = [styles.card, styles[`card_${variant}`], style];
  if (!onPress) return <View style={base}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [base, pressed && styles.cardPressed]}
    >
      {children}
    </Pressable>
  );
}

/* ───────────────────────────── Controls ───────────────────────────── */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'onDark';
type ButtonProps = Omit<PressableProps, 'style' | 'children'> & {
  children: string;
  variant?: ButtonVariant;
  size?: 'md' | 'lg' | 'sm';
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
  loadingLabel?: string;
  style?: StyleProp<ViewStyle>;
};

const buttonText: Record<ButtonVariant, string> = {
  primary: colors.onDark,
  secondary: colors.ink,
  ghost: colors.teal,
  danger: colors.danger,
  onDark: colors.deep,
};

export function Button({ children, variant = 'primary', size = 'lg', icon, iconRight, loading, loadingLabel, style, disabled, onPress, ...props }: ButtonProps) {
  const isDisabled = Boolean(disabled || loading);
  const color = buttonText[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={loading && loadingLabel ? loadingLabel : children}
      accessibilityState={{ disabled: isDisabled, busy: Boolean(loading) }}
      hitSlop={size === 'sm' ? hitSlop : undefined}
      {...props}
      disabled={isDisabled}
      onPress={(event) => {
        haptic.select();
        onPress?.(event);
      }}
      style={({ pressed }) => [styles.button, styles[`button_${size}`], styles[`button_${variant}`], pressed && styles.pressed, disabled && !loading && styles.disabled, style]}
    >
      {loading ? (
        <Row gap={spacing.sm}>
          <ActivityIndicator color={color} />
          {loadingLabel ? <T variant="subhead" color={color}>{loadingLabel}</T> : null}
        </Row>
      ) : (
        <Row gap={spacing.sm} justify="center">
          {icon ? <Icon name={icon} size={size === 'sm' ? 16 : 18} color={color} /> : null}
          <T variant={size === 'sm' ? 'callout' : 'subhead'} weight="700" color={color} numberOfLines={2} align="center" style={{ flexShrink: 1 }}>
            {children}
          </T>
          {iconRight ? <Icon name={iconRight} size={size === 'sm' ? 14 : 16} color={color} /> : null}
        </Row>
      )}
    </Pressable>
  );
}

export function IconButton({ icon, label, onPress, tone = 'fog', size = touch.min, disabled }: { icon: IconName; label: string; onPress: () => void; tone?: 'fog' | 'ink' | 'clear'; size?: number; disabled?: boolean }) {
  const bg = tone === 'ink' ? colors.deep : tone === 'fog' ? colors.fog : 'transparent';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={hitSlop}
      onPress={() => {
        haptic.select();
        onPress();
      }}
      style={({ pressed }) => [{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <Icon name={icon} size={size * 0.45} color={tone === 'ink' ? colors.onDark : colors.ink} />
    </Pressable>
  );
}

/** Inline text action (e.g. section “See all”). Padded to a full touch target. */
export function LinkButton({ children, onPress, icon, color = colors.teal }: { children: string; onPress: () => void; icon?: IconName; color?: string }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={hitSlop} style={({ pressed }) => [styles.link, pressed && { opacity: 0.6 }]}>
      <T variant="callout" weight="700" color={color}>{children}</T>
      {icon ? <Icon name={icon} size={14} color={color} /> : null}
    </Pressable>
  );
}

type ChipTone = 'neutral' | 'good' | 'warm' | 'dark' | 'teal' | 'danger' | 'outline';
const chipTones: Record<ChipTone, { bg: string; fg: string; border?: string }> = {
  neutral: { bg: colors.fog, fg: colors.inkSoft },
  good: { bg: colors.successTint, fg: colors.success },
  warm: { bg: colors.sunriseTint, fg: colors.sunriseInk },
  dark: { bg: colors.deep, fg: colors.onDark },
  teal: { bg: colors.tealTint, fg: colors.tealDeep },
  danger: { bg: colors.dangerTint, fg: colors.danger },
  outline: { bg: 'transparent', fg: colors.inkSoft, border: colors.lineStrong },
};

export function Chip({ label, tone = 'neutral', icon, accessibilityLabel }: { label: string; tone?: ChipTone; icon?: IconName; accessibilityLabel?: string }) {
  const t = chipTones[tone];
  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel ?? label}
      style={[styles.chip, { backgroundColor: t.bg, borderColor: t.border ?? 'transparent' }]}
    >
      {icon ? <Icon name={icon} size={13} color={t.fg} /> : null}
      <T variant="caption" weight="700" color={t.fg}>{label}</T>
    </View>
  );
}

type Option<V extends string> = { label: string; value: V; icon?: IconName; accessibilityLabel?: string };

/** Single-choice segmented control. Exposed to screen readers as a radio group. */
export function Segmented<V extends string>({ options, value, onChange, label, tone = 'light' }: { options: Option<V>[]; value: V; onChange: (value: V) => void; label?: string; tone?: 'light' | 'dark' }) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[styles.segmented, tone === 'dark' && { backgroundColor: colors.deepRaised }]}>
      {options.map((option) => {
        const active = value === option.value;
        const fg = tone === 'dark' ? (active ? colors.deep : colors.onDarkMuted) : active ? colors.ink : colors.inkMuted;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={option.accessibilityLabel ?? option.label}
            accessibilityState={{ checked: active, selected: active }}
            onPress={() => {
              if (!active) haptic.select();
              onChange(option.value);
            }}
            style={[styles.segment, active && (tone === 'dark' ? styles.segmentActiveDark : styles.segmentActive)]}
          >
            {option.icon ? <Icon name={option.icon} size={16} color={fg} /> : null}
            <T variant="callout" weight="700" color={fg} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
              {option.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Wrapping single-choice chips — better than segmented when options > 3 or labels vary. */
export function ChoiceChips<V extends string>({ options, value, onChange, label }: { options: Option<V>[]; value: V | null; onChange: (value: V) => void; label?: string }) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.choiceWrap}>
      {options.map((option) => {
        const active = value === option.value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={option.accessibilityLabel ?? option.label}
            accessibilityState={{ checked: active, selected: active }}
            onPress={() => {
              if (!active) haptic.select();
              onChange(option.value);
            }}
            style={({ pressed }) => [styles.choice, active && styles.choiceActive, pressed && styles.pressed]}
          >
            {option.icon ? <Icon name={option.icon} size={16} color={active ? colors.onDark : colors.teal} /> : active ? <Icon name="check" size={14} color={colors.onDark} /> : null}
            <T variant="callout" weight="700" color={active ? colors.onDark : colors.ink}>{option.label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

type FieldProps = TextInputProps & {
  label: string;
  helper?: string;
  error?: string | null;
  suffix?: string;
  optional?: boolean;
};

export function Field({ label, helper, error, suffix, optional, style, ...props }: FieldProps) {
  const describedBy = error ?? helper;
  return (
    <View style={styles.fieldWrap}>
      <Row justify="space-between">
        <T variant="callout" weight="700" nativeID={`${label}-label`}>{label}</T>
        {optional ? <T variant="caption" color={colors.inkMuted}>Optional</T> : null}
      </Row>
      <View style={[styles.field, props.multiline && styles.fieldMultiline, error ? styles.fieldError : null]}>
        <TextInput
          placeholderTextColor={colors.inkFaint}
          accessibilityLabel={label}
          accessibilityHint={describedBy}
          accessibilityLabelledBy={`${label}-label`}
          maxFontSizeMultiplier={1.8}
          {...props}
          style={[styles.input, props.multiline && styles.inputMultiline, style]}
        />
        {suffix ? <T variant="callout" color={colors.inkMuted} style={{ paddingRight: spacing.lg }}>{suffix}</T> : null}
      </View>
      {error ? (
        <Row gap={6} align="flex-start">
          <Icon name="error" size={14} color={colors.danger} style={{ marginTop: 2 }} />
          <T variant="caption" color={colors.danger} accessibilityLiveRegion="polite" style={{ flex: 1 }}>{error}</T>
        </Row>
      ) : helper ? (
        <T variant="caption" color={colors.inkMuted}>{helper}</T>
      ) : null}
    </View>
  );
}

/** Large thumb-friendly −/+ stepper, adjustable for screen readers. */
export function Stepper({ label, value, onChange, min = 0, max = 99, step = 1, unit }: { label: string; value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number; unit?: string }) {
  const set = (next: number) => {
    const clamped = Math.min(max, Math.max(min, next));
    if (clamped !== value) haptic.select();
    onChange(clamped);
  };
  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min, max, now: value, text: `${value}${unit ? ` ${unit}` : ''}` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event: AccessibilityActionEvent) => set(value + (event.nativeEvent.actionName === 'increment' ? step : -step))}
      style={styles.stepper}
    >
      <Pressable onPress={() => set(value - step)} disabled={value <= min} style={({ pressed }) => [styles.stepButton, pressed && styles.pressed, value <= min && styles.disabled]} importantForAccessibility="no">
        <Icon name="minus" size={22} color={colors.ink} />
      </Pressable>
      <View style={{ alignItems: 'center', minWidth: 64 }}>
        <T variant="numeralL">{value}</T>
        {unit ? <T variant="caption" color={colors.inkMuted}>{unit}</T> : null}
      </View>
      <Pressable onPress={() => set(value + step)} disabled={value >= max} style={({ pressed }) => [styles.stepButton, styles.stepButtonPlus, pressed && styles.pressed, value >= max && styles.disabled]} importantForAccessibility="no">
        <Icon name="plus" size={22} color={colors.onDark} />
      </Pressable>
    </View>
  );
}

export function ListRow({ icon, title, subtitle, onPress, right, destructive, accessibilityHint, chevron = true }: { icon?: IconName; title: string; subtitle?: string; onPress?: () => void; right?: ReactNode; destructive?: boolean; accessibilityHint?: string; chevron?: boolean }) {
  const content = (
    <>
      {icon ? (
        <View style={[styles.rowIcon, destructive && { backgroundColor: colors.dangerTint }]}>
          <Icon name={icon} size={18} color={destructive ? colors.danger : colors.teal} />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="subhead" weight="600" color={destructive ? colors.danger : colors.ink}>{title}</T>
        {subtitle ? <T variant="caption" color={colors.inkMuted}>{subtitle}</T> : null}
      </View>
      {right ?? (onPress && chevron ? <Icon name="chevron-right" size={16} color={colors.inkFaint} /> : null)}
    </>
  );
  if (!onPress) return <View style={styles.row} accessible accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}>{content}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title} accessibilityHint={accessibilityHint} onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
      {content}
    </Pressable>
  );
}

export function ToggleRow({ icon, title, subtitle, value, onValueChange, disabled }: { icon?: IconName; title: string; subtitle?: string; value: boolean; onValueChange: (value: boolean) => void; disabled?: boolean }) {
  return (
    <View style={[styles.row, disabled && { opacity: 0.55 }]}>
      {icon ? (
        <View style={styles.rowIcon}>
          <Icon name={icon} size={18} color={colors.teal} />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 2 }} importantForAccessibility="no-hide-descendants">
        <T variant="subhead" weight="600">{title}</T>
        {subtitle ? <T variant="caption" color={colors.inkMuted}>{subtitle}</T> : null}
      </View>
      <Switch
        accessibilityLabel={title}
        accessibilityHint={subtitle}
        value={value}
        disabled={disabled}
        onValueChange={(next) => {
          haptic.select();
          onValueChange(next);
        }}
        trackColor={{ true: colors.teal, false: colors.fogDeep }}
        thumbColor={Platform.OS === 'android' ? colors.white : undefined}
        ios_backgroundColor={colors.fogDeep}
      />
    </View>
  );
}

/* ───────────────────────────── Feedback ───────────────────────────── */

type BannerTone = 'info' | 'warning' | 'danger' | 'success' | 'offline' | 'neutral';
const bannerTones: Record<BannerTone, { bg: string; fg: string; border: string; icon: IconName }> = {
  info: { bg: colors.tealMist, fg: colors.tealDeep, border: colors.tealTint, icon: 'info' },
  warning: { bg: colors.warningTint, fg: colors.warning, border: colors.warningLine, icon: 'warning' },
  danger: { bg: colors.dangerTint, fg: colors.danger, border: colors.dangerLine, icon: 'error' },
  success: { bg: colors.successTint, fg: colors.success, border: '#C3DFCF', icon: 'success' },
  offline: { bg: colors.fog, fg: colors.inkSoft, border: colors.fogDeep, icon: 'offline' },
  neutral: { bg: colors.paper, fg: colors.inkSoft, border: colors.line, icon: 'info' },
};

export function Banner({ tone = 'info', title, body, icon, action, live }: { tone?: BannerTone; title?: string; body?: string; icon?: IconName; action?: { label: string; onPress: () => void; loading?: boolean }; live?: boolean }) {
  const t = bannerTones[tone];
  return (
    <Animated.View
      entering={FadeIn.duration(220)}
      style={[styles.banner, { backgroundColor: t.bg, borderColor: t.border }]}
      accessibilityLiveRegion={live ? 'polite' : undefined}
      accessibilityRole={tone === 'danger' || tone === 'warning' ? 'alert' : undefined}
    >
      <Icon name={icon ?? t.icon} size={18} color={t.fg} style={{ marginTop: 1 }} />
      <View style={{ flex: 1, gap: 2 }}>
        {title ? <T variant="callout" weight="700" color={t.fg === colors.inkSoft ? colors.ink : t.fg}>{title}</T> : null}
        {body ? <T variant="callout" color={colors.inkSoft}>{body}</T> : null}
        {action ? (
          <View style={{ marginTop: spacing.xs, alignSelf: 'flex-start' }}>
            {action.loading ? <ActivityIndicator color={t.fg} /> : <LinkButton onPress={action.onPress} color={t.fg}>{action.label}</LinkButton>}
          </View>
        ) : null}
      </View>
    </Animated.View>
  );
}

/** Mandatory, fixed ice-safety disclaimer. Text must not be paraphrased. */
export const ICE_SAFETY_TEXT = 'BiteCast does not assess ice safety. Check ice yourself and follow local guidance.';
export function IceSafetyNotice({ compact }: { compact?: boolean }) {
  return (
    <View style={[styles.iceNotice, compact && { paddingVertical: spacing.sm }]} accessibilityRole="alert" accessible accessibilityLabel={`Ice safety. ${ICE_SAFETY_TEXT}`}>
      <View style={styles.iceIcon}>
        <Icon name="warning" size={compact ? 16 : 18} color={colors.warning} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        {!compact ? <T variant="callout" weight="700" color={colors.warning}>Ice safety</T> : null}
        <T variant={compact ? 'caption' : 'callout'} color={colors.ink} weight={compact ? '600' : '400'}>{ICE_SAFETY_TEXT}</T>
      </View>
    </View>
  );
}

/** Device-level connectivity notice. Wired to the connectivity adapter in the store. */
export function OfflineBanner({ what = 'Showing cached forecasts.' }: { what?: string }) {
  const offline = useAppStore((state) => state.connectivity === 'offline');
  if (!offline) return null;
  return <Banner tone="offline" title="You’re offline" body={`${what} Catch logs still save to this device.`} live />;
}

export function EmptyState({ icon, title, body, action, art }: { icon: IconName; title: string; body: string; action?: ReactNode; art?: ReactNode }) {
  return (
    <View style={styles.empty}>
      {art ?? (
        <View style={styles.emptyIcon}>
          <Icon name={icon} size={26} color={colors.teal} />
        </View>
      )}
      <T variant="headline" align="center" accessibilityRole="header">{title}</T>
      <T variant="callout" color={colors.inkMuted} align="center">{body}</T>
      {action ? <View style={{ alignSelf: 'stretch', marginTop: spacing.sm }}>{action}</View> : null}
    </View>
  );
}

export function ErrorState({ title = 'Something went wrong', body, onRetry, retrying }: { title?: string; body: string; onRetry?: () => void; retrying?: boolean }) {
  return (
    <View style={styles.empty} accessibilityRole="alert">
      <View style={[styles.emptyIcon, { backgroundColor: colors.dangerTint }]}>
        <Icon name="error" size={26} color={colors.danger} />
      </View>
      <T variant="headline" align="center">{title}</T>
      <T variant="callout" color={colors.inkMuted} align="center">{body}</T>
      {onRetry ? <Button variant="secondary" icon="refresh" loading={retrying} onPress={onRetry} style={{ alignSelf: 'stretch', marginTop: spacing.sm }}>Try again</Button> : null}
    </View>
  );
}

/** Pulsing placeholder block. Static when reduce-motion is on. */
export function Skeleton({ height = 16, width = '100%', radius: r = radius.sm, style }: { height?: number; width?: ViewStyle['width']; radius?: number; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const opacity = useSharedValue(0.55);
  useEffect(() => {
    if (!reduced) opacity.set(withRepeat(withTiming(1, { duration: 800 }), -1, true));
  }, [opacity, reduced]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return <Animated.View style={[{ height, width, borderRadius: r, backgroundColor: colors.fog }, animated, style]} />;
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <View style={[styles.card, styles.card_surface, { gap: spacing.md }]} accessibilityLabel="Loading" accessibilityRole="progressbar">
      <Row justify="space-between">
        <View style={{ flex: 1, gap: spacing.sm }}>
          <Skeleton height={20} width="55%" />
          <Skeleton height={12} width="35%" />
        </View>
        <Skeleton height={64} width={64} radius={radius.md} />
      </Row>
      {Array.from({ length: lines - 1 }, (_, index) => <Skeleton key={index} height={12} width={index % 2 ? '70%' : '90%'} />)}
    </View>
  );
}

export function ProgressBar({ value, color = colors.teal, label, height = 8 }: { value: number; color?: string; label?: string; height?: number }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: pct }}
      style={{ height, borderRadius: height, backgroundColor: colors.fog, overflow: 'hidden' }}
    >
      <View style={{ width: `${pct}%`, height: '100%', borderRadius: height, backgroundColor: color }} />
    </View>
  );
}

/* ───────────────────────────── Styles ───────────────────────────── */

const styles = StyleSheet.create({
  scroll: { flexGrow: 1 },
  screenContent: { flexGrow: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.lg, gap: spacing.lg, width: '100%', maxWidth: 640, alignSelf: 'center' },
  footer: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, gap: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, width: '100%', maxWidth: 640, alignSelf: 'center' },
  pageHeader: { gap: spacing.sm },
  pageHeaderRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: spacing.sm, gap: spacing.md },

  card: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  card_surface: { backgroundColor: colors.paper, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: colors.line },
  card_sunken: { backgroundColor: colors.fog },
  card_ink: { backgroundColor: colors.deep, overflow: 'hidden' },
  card_outline: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.lineStrong },
  card_tint: { backgroundColor: colors.tealMist, borderWidth: 1, borderColor: colors.tealTint },
  cardPressed: { opacity: 0.88, transform: [{ scale: 0.995 }] },

  button: { borderRadius: radius.pill, paddingHorizontal: spacing.xl, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  button_lg: { minHeight: touch.large },
  button_md: { minHeight: touch.comfortable },
  button_sm: { minHeight: 36, paddingHorizontal: spacing.lg },
  button_primary: { backgroundColor: colors.deep, borderColor: colors.deep },
  button_secondary: { backgroundColor: colors.paper, borderColor: colors.lineStrong },
  button_ghost: { backgroundColor: 'transparent', borderColor: 'transparent' },
  button_danger: { backgroundColor: colors.dangerTint, borderColor: colors.dangerLine },
  button_onDark: { backgroundColor: colors.onDark, borderColor: colors.onDark },
  pressed: { opacity: 0.78, transform: [{ scale: 0.985 }] },
  disabled: { opacity: 0.4 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: touch.min, justifyContent: 'center' },

  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, borderWidth: 1 },

  segmented: { flexDirection: 'row', padding: 4, backgroundColor: colors.fog, borderRadius: radius.pill },
  segment: { flex: 1, flexDirection: 'row', gap: 6, minHeight: touch.min, paddingHorizontal: spacing.sm, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  segmentActive: { backgroundColor: colors.paper, ...elevation.low },
  segmentActiveDark: { backgroundColor: colors.onDark },

  choiceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: touch.min, paddingHorizontal: spacing.lg, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.paper },
  choiceActive: { backgroundColor: colors.teal, borderColor: colors.teal },

  fieldWrap: { gap: spacing.sm },
  field: { flexDirection: 'row', alignItems: 'center', minHeight: touch.comfortable + 4, borderRadius: radius.md, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.paper },
  fieldMultiline: { alignItems: 'flex-start', minHeight: 104 },
  fieldError: { borderColor: colors.danger, borderWidth: 1.5 },
  input: { flex: 1, minHeight: touch.comfortable + 2, paddingHorizontal: spacing.lg, color: colors.ink, fontSize: 16 },
  inputMultiline: { minHeight: 100, paddingTop: spacing.md, paddingBottom: spacing.md, textAlignVertical: 'top' },

  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  stepButton: { width: touch.large, height: touch.large, borderRadius: touch.large / 2, backgroundColor: colors.fog, alignItems: 'center', justifyContent: 'center' },
  stepButtonPlus: { backgroundColor: colors.deep },

  row: { flexDirection: 'row', alignItems: 'center', minHeight: 56, gap: spacing.md, paddingVertical: spacing.sm },
  rowIcon: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.tealMist, alignItems: 'center', justifyContent: 'center' },

  banner: { flexDirection: 'row', gap: spacing.md, padding: spacing.md, paddingRight: spacing.lg, borderRadius: radius.md, borderWidth: 1 },
  iceNotice: { flexDirection: 'row', gap: spacing.md, alignItems: 'center', padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.warningTint, borderWidth: 1, borderColor: colors.warningLine, borderLeftWidth: 4, borderLeftColor: colors.sunrise },
  iceIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#FBF4E3', alignItems: 'center', justifyContent: 'center' },

  empty: { paddingVertical: spacing.xxl, paddingHorizontal: spacing.lg, alignItems: 'center', gap: spacing.sm },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.tealMist, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs },
});
