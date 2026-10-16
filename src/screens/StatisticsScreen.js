import React, { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Pressable } from '../components/Touch';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { useData } from '../DataContext';
import { useNav } from '../nav';
import { contactName, contactPhoto, numberKey } from '../phone';
import { Avatar, IconButton, LargeHeader, Segmented } from '../components/ui';
import { Glass } from '../components/Glass';
import Aurora from '../components/Aurora';
import { Bars, Meter, ShareRows, StackedBar } from '../components/Charts';
import { computeStats, formatDuration, formatHour, formatShort } from '../stats';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const PERIOD_OPTIONS = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
];

function Card({ children, style }) {
  return (
    <Glass radius={28} blur style={[{ marginHorizontal: 16, marginTop: 14, padding: 20 }, style]}>
      {children}
    </Glass>
  );
}

export default function StatisticsScreen() {
  const t = useTheme();
  const nav = useNav();
  const insets = useSafeAreaInsets();
  const { recents, resolve, contacts } = useData();
  const [period, setPeriod] = useState('month');

  // recents arrive grouped for the list; statistics want every individual call
  const calls = useMemo(() => recents.flatMap((g) => g.calls), [recents]);

  const nameFor = useMemo(
    () => (number) => {
      const hit = resolve(number);
      return hit ? contactName(hit.contact) : null;
    },
    [resolve]
  );

  const stats = useMemo(() => computeStats(calls, period, nameFor), [calls, period, nameFor]);

  const byNumber = useMemo(() => {
    const m = new Map();
    for (const c of contacts) {
      for (const p of c.phoneNumbers || []) {
        const k = numberKey(p.number);
        if (k && !m.has(k)) m.set(k, c);
      }
    }
    return m;
  }, [contacts]);

  const slices = [
    { key: 'incoming', label: 'Incoming', value: stats.byType.incoming, color: t.chartIncoming },
    { key: 'outgoing', label: 'Outgoing', value: stats.byType.outgoing, color: t.chartOutgoing },
    { key: 'missed', label: 'Missed', value: stats.byType.missed, color: t.chartMissed },
    { key: 'other', label: 'Other', value: stats.byType.other, color: t.chartOther },
  ].filter((s) => s.value > 0);

  const trend =
    stats.trendPct === null
      ? null
      : stats.trendPct > 0
      ? `${stats.trendPct}% more than the period before`
      : stats.trendPct < 0
      ? `${Math.abs(stats.trendPct)}% fewer than the period before`
      : 'Same as the period before';

  const peak = formatHour(stats.busiestHour);
  const topMax = stats.topContacts.length ? stats.topContacts[0].count : 0;

  return (
    <View style={{ flex: 1 }}>
      <Aurora variant="sheet" />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }} showsVerticalScrollIndicator={false}>
        <LargeHeader
          title="Statistics"
          left={<IconButton glass name="chevron-back" onPress={nav.pop} />}
        />

        <View style={{ paddingHorizontal: 16, marginTop: 2 }}>
          <Segmented options={PERIOD_OPTIONS} value={period} onChange={setPeriod} />
        </View>

        {stats.total === 0 ? (
          <Card style={{ alignItems: 'center', paddingVertical: 34 }}>
            <Ionicons name="stats-chart-outline" size={30} color={t.secondary} />
            <Text style={{ color: t.text, fontSize: 18, fontWeight: '600', marginTop: 14 }}>No calls in this period</Text>
            <Text style={{ color: t.secondary, fontSize: 15, marginTop: 6, textAlign: 'center' }}>
              Try a longer period, or make a call.
            </Text>
          </Card>
        ) : (
          <>
            {/* breakdown */}
            <Card>
              <Text style={{ color: t.text, fontSize: 20, fontWeight: '700' }}>Call breakdown</Text>
              {trend ? <Text style={{ color: t.secondary, fontSize: 13, marginTop: 2 }}>{trend}</Text> : null}
              <View style={{ alignItems: 'center', marginTop: 16, marginBottom: 18 }}>
                <Text style={{ color: t.text, fontSize: 44, fontWeight: '700', letterSpacing: -0.5 }}>{stats.total}</Text>
                <Text style={{ color: t.secondary, fontSize: 13 }}>total calls</Text>
              </View>
              <StackedBar slices={slices} />
              <View style={{ height: 18 }} />
              <ShareRows
                slices={slices.map((s) => ({
                  ...s,
                  labelNode: <Text style={{ color: t.text, fontSize: 15 }}>{s.label}</Text>,
                  valueNode: (
                    <Text style={{ color: t.secondary, fontSize: 13 }}>
                      {s.value} · {Math.round((s.value / stats.total) * 100)}%
                    </Text>
                  ),
                }))}
                total={stats.total}
              />
            </Card>

            {/* talk time + average */}
            <View style={{ flexDirection: 'row', paddingHorizontal: 16, marginTop: 14, gap: 13 }}>
              <Glass radius={24} blur style={{ flex: 1, padding: 16 }}>
                <View style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: t.chartOutgoing + '2E' }}>
                  <Ionicons name="time-outline" size={17} color={t.chartOutgoing} />
                </View>
                <Text style={{ color: t.text, fontSize: 20, fontWeight: '700', marginTop: 10 }} numberOfLines={1}>
                  {formatDuration(stats.talkSeconds)}
                </Text>
                <Text style={{ color: t.secondary, fontSize: 12 }}>Talk time</Text>
              </Glass>
              <Glass radius={24} blur style={{ flex: 1, padding: 16 }}>
                <View style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: t.chartOther + '2E' }}>
                  <Ionicons name="call-outline" size={16} color={t.chartOther} />
                </View>
                <Text style={{ color: t.text, fontSize: 20, fontWeight: '700', marginTop: 10 }} numberOfLines={1}>
                  {formatShort(stats.avgSeconds)}
                </Text>
                <Text style={{ color: t.secondary, fontSize: 12 }}>Avg length</Text>
              </Glass>
            </View>

            {/* busiest days */}
            <Card>
              <Text style={{ color: t.text, fontSize: 20, fontWeight: '700' }}>Busiest days</Text>
              {peak ? <Text style={{ color: t.secondary, fontSize: 13, marginTop: 2 }}>Peak around {peak}</Text> : null}
              <View style={{ marginTop: 16 }}>
                <Bars
                  color={t.chartIncoming}
                  highlightColor={t.chartOther}
                  data={stats.perWeekday.map((v, i) => ({
                    value: v,
                    highlight: i === stats.busiestWeekday,
                    label: (
                      <Text style={{ color: i === stats.busiestWeekday ? t.text : t.secondary, fontSize: 11, fontWeight: '600' }}>
                        {WEEKDAYS[i]}
                      </Text>
                    ),
                  }))}
                />
              </View>
            </Card>

            {/* most called */}
            {stats.topContacts.length ? (
              <Card>
                <Text style={{ color: t.text, fontSize: 20, fontWeight: '700' }}>Most called</Text>
                <View style={{ marginTop: 6 }}>
                  {stats.topContacts.map((p, i) => {
                    const contact = byNumber.get(p.key) || null;
                    return (
                      <Pressable
                        key={p.key}
                        onPress={() => nav.push({ name: 'contact', contactId: contact ? contact.id : null, number: p.number })}
                        style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12 }}
                      >
                        <Avatar
                          size={38}
                          name={contact ? contactName(contact) : p.name}
                          image={contactPhoto(contact)}
                        />
                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <Text style={{ color: t.text, fontSize: 15 }} numberOfLines={1}>
                            {contact ? contactName(contact) : p.name}
                          </Text>
                          <View style={{ marginTop: 6 }}>
                            <Meter value={p.count} max={topMax} color={t.chartIncoming} />
                          </View>
                        </View>
                        <View style={{ alignItems: 'flex-end', marginLeft: 12 }}>
                          <Text style={{ color: t.text, fontSize: 17, fontWeight: '600' }}>{p.count}</Text>
                          <Text style={{ color: t.tertiary, fontSize: 12 }}>{formatDuration(p.seconds)}</Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </Card>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}
