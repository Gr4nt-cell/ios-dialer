import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from './theme';
import { PaneProvider } from './device';
import Sidebar, { SIDEBAR_WIDTH } from './components/Sidebar';
import Boundary from './components/Boundary';
import { useT } from './i18n';

/**
 * The tablet layout: a glass rail, a list column, and a detail pane.
 *
 * Screens are the same ones the phone uses. What changes is where a pushed
 * route lands: on a phone it covers the screen, here it fills the pane beside
 * the list, so the list it came from stays visible and selectable. A section
 * that has something permanent to show on the right — the keypad — says so,
 * and its pushes stay modal rather than pushing the dial pad out of view.
 */

// A list column wide enough for a name, a number and a timestamp without
// wrapping, and narrow enough to leave the detail pane the larger half.
export const LIST_MIN = 330;
export const LIST_MAX = 420;
const LIST_FRACTION = 0.34;

export function listWidth(windowWidth) {
  const usable = windowWidth - SIDEBAR_WIDTH;
  return Math.round(Math.min(LIST_MAX, Math.max(LIST_MIN, usable * LIST_FRACTION)));
}

function Placeholder({ icon, title, message }) {
  const t = useTheme();
  return (
    <View style={styles.placeholder}>
      <Ionicons name={icon} size={64} color={t.tertiary} />
      <Text style={{ color: t.secondary, fontSize: 20, fontWeight: '600', marginTop: 16 }}>{title}</Text>
      {message ? (
        <Text style={{ color: t.tertiary, fontSize: 15, marginTop: 6, textAlign: 'center', maxWidth: 320, lineHeight: 20 }}>
          {message}
        </Text>
      ) : null}
    </View>
  );
}

export default function TabletShell({
  tabs,
  activeTab,
  onChangeTab,
  onSettings,
  badges,
  list,
  detail,
  listKey,
  detailKey,
  windowWidth,
  windowHeight,
}) {
  const t = useTheme();
  const tr = useT();
  const insets = useSafeAreaInsets();
  const LIST_W = listWidth(windowWidth);
  const detailW = windowWidth - SIDEBAR_WIDTH - LIST_W;

  const listSize = useMemo(() => ({ width: LIST_W, height: windowHeight }), [LIST_W, windowHeight]);
  const detailSize = useMemo(() => ({ width: detailW, height: windowHeight }), [detailW, windowHeight]);

  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: t.bg }}>
      <Sidebar tabs={tabs} active={activeTab} onChange={onChangeTab} onSettings={onSettings} badges={badges} />

      <View style={[styles.column, { width: LIST_W, borderRightColor: t.separator }]}>
        <PaneProvider value={listSize}>
          <Boundary resetKey={listKey}>{list}</Boundary>
        </PaneProvider>
      </View>

      <View style={{ flex: 1 }}>
        <PaneProvider value={detailSize}>
          <Boundary resetKey={detailKey}>
            {detail || (
              <View style={{ flex: 1, paddingBottom: insets.bottom }}>
                <Placeholder
                  icon="chatbubbles-outline"
                  title={tr('Nothing Selected')}
                  message={tr('Pick someone on the left to see their details here.')}
                />
              </View>
            )}
          </Boundary>
        </PaneProvider>
      </View>
    </View>
  );
}

TabletShell.Placeholder = Placeholder;

const styles = StyleSheet.create({
  column: { borderRightWidth: StyleSheet.hairlineWidth },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
});
