import React from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { initials } from '../phone';
import { Glass } from './Glass';

// ---------- Avatar ----------

export function Avatar({ name, image, size = 40 }) {
  const t = useTheme();
  const letters = initials(name);
  const style = { width: size, height: size, borderRadius: size / 2 };
  if (image) return <Image source={{ uri: image }} style={style} />;
  return (
    <View style={[style, { backgroundColor: t.avatar[0], alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }]}>
      <View style={[StyleSheet.absoluteFill, { top: '50%', backgroundColor: t.avatar[1], opacity: 0.55 }]} />
      {letters ? (
        <Text style={{ color: '#fff', fontWeight: '600', fontSize: size * 0.4, letterSpacing: 0.5 }}>{letters}</Text>
      ) : (
        <Ionicons name="person" size={size * 0.62} color="#fff" style={{ marginTop: size * 0.18 }} />
      )}
    </View>
  );
}

// ---------- Text button ----------

export function TextButton({ title, onPress, color, bold, disabled, style, glass, prominent }) {
  const t = useTheme();
  if (glass || prominent) {
    return (
      <Pressable onPress={onPress} disabled={disabled} hitSlop={8} style={style}>
        {({ pressed }) => (
          <Glass
            radius={18}
            pressed={pressed}
            tint={prominent && !disabled ? t.blue : undefined}
            tintOpacity={0.92}
            style={{ height: 36, paddingHorizontal: 15, justifyContent: 'center', opacity: disabled ? 0.45 : 1 }}
          >
            <Text style={{ color: prominent ? '#fff' : color || t.text, fontSize: 16, fontWeight: bold || prominent ? '600' : '500' }}>{title}</Text>
          </Glass>
        )}
      </Pressable>
    );
  }
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={10} style={style}>
      {({ pressed }) => (
        <Text
          style={{
            color: disabled ? t.tertiary : color || t.blue,
            fontSize: 17,
            fontWeight: bold ? '600' : '400',
            opacity: pressed ? 0.4 : 1,
          }}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

export function IconButton({ name, onPress, color, size = 24, style, filled, glass, prominent, disabled }) {
  const t = useTheme();
  if (glass || prominent) {
    return (
      <Pressable onPress={onPress} hitSlop={8} style={style} disabled={disabled}>
        {({ pressed }) => (
          <Glass radius={18} pressed={pressed} tint={prominent ? t.blue : undefined} tintOpacity={0.92} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.45 : 1 }}>
            <Ionicons name={name} size={size - 4} color={prominent ? '#fff' : color || t.text} />
          </Glass>
        )}
      </Pressable>
    );
  }
  return (
    <Pressable onPress={onPress} hitSlop={10} style={style} disabled={disabled}>
      {({ pressed }) =>
        filled ? (
          <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: t.fill, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.5 : 1 }}>
            <Ionicons name={name} size={size - 4} color={color || t.text} />
          </View>
        ) : (
          <Ionicons name={name} size={size} color={color || t.blue} style={{ opacity: pressed ? 0.4 : 1 }} />
        )
      }
    </Pressable>
  );
}

// ---------- Large-title header ----------

export function LargeHeader({ title, left, right, center, children, compact }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top, backgroundColor: t.bg }}>
      <View style={styles.bar}>
        <View style={styles.barSide}>{left}</View>
        <View style={styles.barCenter}>{center}</View>
        <View style={[styles.barSide, { alignItems: 'flex-end' }]}>{right}</View>
      </View>
      {title && !compact ? <Text style={[styles.largeTitle, { color: t.text }]}>{title}</Text> : null}
      {children}
    </View>
  );
}

// ---------- Search bar ----------

export function SearchBar({ value, onChangeText, placeholder = 'Search', autoFocus }) {
  const t = useTheme();
  return (
    <Glass radius={20} style={styles.search}>
      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingHorizontal: 12, gap: 6 }}>
        <Ionicons name="search" size={17} color={t.secondary} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={t.secondary}
          style={[styles.searchInput, { color: t.text }]}
          autoCorrect={false}
          autoFocus={autoFocus}
          returnKeyType="search"
        />
        {value ? (
          <Pressable onPress={() => onChangeText('')} hitSlop={8}>
            <Ionicons name="close-circle" size={17} color={t.secondary} />
          </Pressable>
        ) : (
          <Ionicons name="mic" size={17} color={t.secondary} />
        )}
      </View>
    </Glass>
  );
}

// ---------- Segmented control ----------

export function Segmented({ options, value, onChange }) {
  const t = useTheme();
  return (
    <Glass radius={18} style={styles.segment}>
      <View style={{ flexDirection: 'row', padding: 3 }}>
        {options.map((o) => {
          const active = o.value === value;
          return (
            <Pressable key={o.value} onPress={() => onChange(o.value)} style={{ flex: 1 }}>
              {active ? (
                <Glass radius={15} style={styles.segmentItem} tint={t.dark ? 'rgba(255,255,255,0.22)' : '#FFFFFF'} tintOpacity={1}>
                  <Text style={{ color: t.text, fontSize: 13, fontWeight: '600' }} numberOfLines={1}>{o.label}</Text>
                </Glass>
              ) : (
                <View style={styles.segmentItem}>
                  <Text style={{ color: t.text, fontSize: 13, fontWeight: '500' }} numberOfLines={1}>{o.label}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </Glass>
  );
}

// ---------- Grouped list pieces ----------

export function Group({ children, style }) {
  const t = useTheme();
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={[{ backgroundColor: t.card, borderRadius: 22, marginHorizontal: 16, overflow: 'hidden' }, style]}>
      {items.map((child, i) => (
        <View key={i}>
          {i > 0 ? <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.separator, marginLeft: 16 }} /> : null}
          {child}
        </View>
      ))}
    </View>
  );
}

export function Cell({ label, value, onPress, onLongPress, color, right, children }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} disabled={!onPress && !onLongPress}>
      {({ pressed }) => (
        <View style={[styles.cell, pressed && { backgroundColor: t.dark ? '#2C2C2E' : '#E5E5EA' }]}>
          <View style={{ flex: 1 }}>
            {label ? <Text style={{ color: t.text, fontSize: 13, marginBottom: 2 }}>{label}</Text> : null}
            {value ? <Text style={{ color: color || t.text, fontSize: 17 }}>{value}</Text> : null}
            {children}
          </View>
          {right}
        </View>
      )}
    </Pressable>
  );
}

export function Separator({ inset = 16 }) {
  const t = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.separator, marginLeft: inset }} />;
}

export function EmptyState({ icon, title, message, action }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingHorizontal: 40, paddingTop: 80 }}>
      {icon ? <Ionicons name={icon} size={54} color={t.tertiary} /> : null}
      <Text style={{ color: t.text, fontSize: 22, fontWeight: '700', marginTop: 14, textAlign: 'center' }}>{title}</Text>
      {message ? <Text style={{ color: t.secondary, fontSize: 15, marginTop: 6, textAlign: 'center', lineHeight: 20 }}>{message}</Text> : null}
      {action ? <View style={{ marginTop: 18 }}>{action}</View> : null}
    </View>
  );
}

// ---------- Sheet header (modal screens) ----------

export function SheetHeader({ title, left, right }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top + 6, backgroundColor: t.grouped }}>
      <View style={styles.bar}>
        <View style={styles.barSide}>{left}</View>
        <View style={styles.barCenter}>
          <Text style={{ color: t.text, fontSize: 17, fontWeight: '600' }} numberOfLines={1}>
            {title}
          </Text>
        </View>
        <View style={[styles.barSide, { alignItems: 'flex-end' }]}>{right}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { height: 44, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  barSide: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  barCenter: { flex: 2, alignItems: 'center' },
  largeTitle: { fontSize: 34, fontWeight: '700', letterSpacing: 0.37, paddingHorizontal: 16, marginBottom: 8 },
  search: { marginHorizontal: 16, marginBottom: 10, height: 40 },
  searchInput: { flex: 1, fontSize: 17, paddingVertical: 0 },
  segment: { width: 200 },
  segmentItem: { alignItems: 'center', justifyContent: 'center', height: 30, paddingHorizontal: 8 },
  cell: { minHeight: 52, paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center' },
});
