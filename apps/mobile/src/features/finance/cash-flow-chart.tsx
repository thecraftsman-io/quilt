import { useCallback, useState } from 'react';
import { Pressable } from 'react-native';
import Svg, { Path, Rect, Text as SvgText } from 'react-native-svg';
import Feather from '@expo/vector-icons/Feather';
import { Card, Text, View, useQuiltTheme } from '@quilt/ui';
import { useFinance } from './finance-context';
import { financeApi } from '../../lib/client/finance';
import { useRemote, workspaceToday } from './hooks';
import { Choices, RemoteState } from './components';
import { display } from './model';
import {
  cashFlow,
  cashFlowFromReport,
  shiftMonth,
  type FlowGroup,
} from './cash-flow';

function ribbon(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  height: number,
) {
  const middle = (x1 + x2) / 2;
  return `M${x1},${y1} C${middle},${y1} ${middle},${y2} ${x2},${y2} L${x2},${y2 + height} C${middle},${y2 + height} ${middle},${y1 + height} ${x1},${y1 + height} Z`;
}
function FlowDiagram({ flow }: { flow: ReturnType<typeof cashFlow> }) {
  const { colors, mode } = useQuiltTheme();
  const [chartWidth, setChartWidth] = useState(680);
  const labelSpace = chartWidth < 500 ? 88 : 145;
  const center = chartWidth / 2;
  const right = chartWidth - labelSpace - 6;
  const height = Math.max(
    220,
    Math.max(flow.sources.length, flow.destinations.length) * 48 + 32,
  );
  const total = Number(flow.total.amount);
  // Reserve label space even when one category has a very small amount.
  let low = 0;
  let high = height - 32;
  for (let i = 0; i < 32; i++) {
    const candidate = (low + high) / 2;
    const fits = [flow.sources, flow.destinations].every(
      (groups) =>
        groups.reduce(
          (sum, g) =>
            sum + Math.max((Number(g.amount.amount) / total) * candidate, 34),
          0,
        ) +
          (groups.length - 1) * 14 <=
        height - 32,
    );
    if (fits) low = candidate;
    else high = candidate;
  }
  const available = low;
  const size = (group: FlowGroup) =>
    (Number(group.amount.amount) / total) * available;
  const centerTop = (height - available) / 2;
  const outgoing = mode === 'dark' ? '#D9A984' : '#BD835B';
  const muted = colors.textMuted;
  const column = (groups: FlowGroup[], side: 'source' | 'destination') => {
    const occupied =
      groups.reduce((sum, g) => sum + Math.max(size(g), 34), 0) +
      (groups.length - 1) * 14;
    let cursor = (height - occupied) / 2;
    let centerCursor = centerTop;
    return groups.map((group) => {
      const thickness = size(group);
      const y = cursor + (Math.max(thickness, 34) - thickness) / 2;
      const cy = centerCursor;
      cursor += Math.max(thickness, 34) + 14;
      centerCursor += thickness;
      const color =
        group.key === 'balance'
          ? muted
          : side === 'source' || group.key === 'remaining'
            ? colors.primary
            : outgoing;
      const source = side === 'source';
      const x = source ? labelSpace : right;
      const labelX = source ? x - 10 : x + 16;
      return (
        <SvgFragment
          key={group.key}
          path={
            source
              ? ribbon(x + 6, y, center - 5, cy, thickness)
              : ribbon(center + 5, cy, x, y, thickness)
          }
          x={x}
          y={y}
          thickness={thickness}
          color={color}
          labelX={labelX}
          labelY={y + thickness / 2}
          anchor={source ? 'end' : 'start'}
          label={
            chartWidth < 500 && group.label.length > 12
              ? `${group.label.slice(0, 11)}…`
              : group.label
          }
          amount={display(group.amount)}
          textColor={colors.text}
          muted={muted}
        />
      );
    });
  };
  return (
    <View
      onLayout={(event) =>
        setChartWidth(Math.max(240, event.nativeEvent.layout.width))
      }
    >
      <Svg
        width="100%"
        height={height}
        viewBox={`0 0 ${chartWidth} ${height}`}
        accessibilityLabel="Cash flow diagram. Income and refunds flow into spending categories and money left over."
      >
        {column(flow.sources, 'source')}
        {column(flow.destinations, 'destination')}
        <Rect
          x={center - 5}
          y={centerTop}
          width={10}
          height={available}
          rx={3}
          fill={colors.primary}
        />
      </Svg>
    </View>
  );
}
function SvgFragment({
  path,
  x,
  y,
  thickness,
  color,
  labelX,
  labelY,
  anchor,
  label,
  amount,
  textColor,
  muted,
}: {
  path: string;
  x: number;
  y: number;
  thickness: number;
  color: string;
  labelX: number;
  labelY: number;
  anchor: 'start' | 'end';
  label: string;
  amount: string;
  textColor: string;
  muted: string;
}) {
  return (
    <>
      <Path d={path} fill={color} fillOpacity={0.16} />
      <Rect
        x={x}
        y={y}
        width={6}
        height={Math.max(1, thickness)}
        rx={2}
        fill={color}
      />
      <SvgText
        x={labelX}
        y={labelY - 3}
        textAnchor={anchor}
        fill={textColor}
        fontSize={12}
        fontWeight="500"
      >
        {label.length > 18 ? `${label.slice(0, 17)}…` : label}
      </SvgText>
      <SvgText
        x={labelX}
        y={labelY + 14}
        textAnchor={anchor}
        fill={muted}
        fontSize={11}
      >
        {amount}
      </SvgText>
    </>
  );
}

export function CashFlowChart() {
  const { data, workspaceId } = useFinance();
  const { colors } = useQuiltTheme();
  const date = workspaceToday(data.settings[0]?.timeZone ?? 'UTC');
  const [month, setMonth] = useState(date.slice(0, 7));
  const [currency, setCurrency] = useState<string>(
    data.settings[0]?.reportingCurrency ?? 'EUR',
  );
  const [showDetails, setShowDetails] = useState(false);
  const result = useRemote(
    useCallback(
      (signal: AbortSignal) =>
        financeApi.summary(workspaceId, month, currency, date, signal),
      [workspaceId, month, currency, date],
    ),
  );
  const flow = result.value
    ? cashFlowFromReport(
        result.value.cashFlow,
        (id) =>
          data.categories.find((c) => c.id === id)?.name ?? 'Uncategorized',
      )
    : null;
  const label = new Intl.DateTimeFormat('en', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${month}-01T00:00:00Z`));
  const currentMonth = date.slice(0, 7);
  return (
    <Card>
      <View className="flex-row flex-wrap items-center justify-between gap-3">
        <Text variant="title">Cash flow</Text>
        <View className="flex-row items-center gap-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous cash flow month"
            onPress={() => setMonth(shiftMonth(month, -1))}
            style={{ padding: 12 }}
          >
            <Feather name="chevron-left" size={18} color={colors.textMuted} />
          </Pressable>
          <Text variant="label">{label}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next cash flow month"
            accessibilityState={{ disabled: month >= currentMonth }}
            disabled={month >= currentMonth}
            onPress={() => setMonth(shiftMonth(month, 1))}
            style={{ padding: 12, opacity: month >= currentMonth ? 0.3 : 1 }}
          >
            <Feather name="chevron-right" size={18} color={colors.textMuted} />
          </Pressable>
        </View>
      </View>
      {month !== currentMonth && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Show this month’s cash flow"
          onPress={() => setMonth(currentMonth)}
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <Text variant="label">This month</Text>
        </Pressable>
      )}
      <Choices
        label="Currency"
        value={currency}
        values={['EUR', 'USD', 'GBP']}
        onChange={setCurrency}
      />
      {result.loading || result.error ? (
        <RemoteState loading={result.loading} error={result.error} />
      ) : (
        flow && (
          <>
            <View className="flex-row flex-wrap gap-6 border-b border-border pb-5">
              {[
                { label: 'Money in', amount: flow.incoming },
                { label: 'Money out', amount: flow.expenses },
                { label: 'Net cash flow', amount: flow.net },
              ].map((item) => (
                <View
                  key={item.label}
                  style={{ flexGrow: 1, minWidth: 110, gap: 4 }}
                >
                  <Text variant="caption" tone="textMuted">
                    {item.label}
                  </Text>
                  <Text variant="title">{display(item.amount)}</Text>
                </View>
              ))}
            </View>
            {flow.total.amount === '0' ? (
              <View className="items-center py-8 gap-2">
                <Feather name="git-merge" color={colors.textMuted} size={24} />
                <Text variant="label">No cash flow this month</Text>
                <Text variant="caption" tone="textMuted">
                  Booked income and expenses in {currency} will appear here.
                </Text>
              </View>
            ) : (
              <FlowDiagram flow={flow} />
            )}
            <Text variant="caption" tone="textMuted">
              Booked activity · {currency} only · Transfers and balance
              adjustments excluded. Refunds count as money in.
            </Text>
            {flow.total.amount !== '0' && (
              <>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: showDetails }}
                  onPress={() => setShowDetails(!showDetails)}
                  style={{ minHeight: 44, justifyContent: 'center' }}
                >
                  <Text variant="label">
                    {showDetails ? 'Hide breakdown −' : 'View breakdown +'}
                  </Text>
                </Pressable>
                {showDetails && (
                  <View className="gap-4">
                    {[
                      { title: 'Money coming in', groups: flow.sources },
                      { title: 'Where it goes', groups: flow.destinations },
                    ].map((section) => (
                      <View key={section.title} className="gap-2">
                        <Text variant="label">{section.title}</Text>
                        {section.groups.map((group) => (
                          <View
                            key={group.key}
                            className="flex-row justify-between gap-4"
                          >
                            <Text tone="textMuted" style={{ flex: 1 }}>
                              {group.label}
                            </Text>
                            <Text>{display(group.amount)}</Text>
                          </View>
                        ))}
                      </View>
                    ))}
                    <Text variant="caption" tone="textMuted">
                      “From balance” covers spending beyond this month’s
                      inflows. “Left over” is the surplus.
                    </Text>
                  </View>
                )}
              </>
            )}
          </>
        )
      )}
    </Card>
  );
}
