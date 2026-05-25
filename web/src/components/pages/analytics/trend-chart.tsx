'use client';

import { useTheme } from 'next-themes';
import { useTranslations } from 'next-intl';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend
} from 'recharts';
import { Loader } from 'lucide-react';

const CHART_COLORS = [
    '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#14b8a6', '#f97316', '#6366f1'
];

interface TrendChartProps {
    data: Record<string, string | number>[];
    keys: string[];
    isLoading: boolean;
}

export function TrendChart({ data, keys, isLoading }: TrendChartProps) {
    const t = useTranslations('analytics');
    const { theme } = useTheme();

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-xs text-muted-foreground min-h-[260px]">
                <Loader className="size-4 animate-spin" />
            </div>
        );
    }
    if (data.length === 0) {
        return (
            <div className="flex items-center justify-center h-full text-xs text-muted-foreground min-h-[260px]">
                {t('no_data')}
            </div>
        );
    }

    const gridStroke = theme === 'dark' ? '#27272a' : '#e4e4e7';
    const textStroke = theme === 'dark' ? '#a1a1aa' : '#71717a';

    return (
        <ResponsiveContainer width="100%" height="100%" minHeight={220}>
            <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                    {keys.map((key, i) => (
                        <linearGradient key={`color${i}`} id={`color${i}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={CHART_COLORS[i % CHART_COLORS.length]} stopOpacity={0.4} />
                            <stop offset="95%" stopColor={CHART_COLORS[i % CHART_COLORS.length]} stopOpacity={0} />
                        </linearGradient>
                    ))}
                </defs>
                <XAxis 
                    dataKey="time" 
                    stroke={textStroke} 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false} 
                    dy={10}
                />
                <YAxis 
                    stroke={textStroke} 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false} 
                    tickFormatter={(val) => typeof val === 'number' ? val.toLocaleString() : `${val}`}
                    dx={-5}
                />
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} />
                <Tooltip 
                    contentStyle={{
                        borderRadius: '12px',
                        border: '1px solid var(--border)',
                        boxShadow: '0 4px 12px rgb(0 0 0 / 0.15)',
                        backgroundColor: 'var(--card)',
                        fontSize: '11px',
                        color: 'var(--foreground)'
                    }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '20px' }} />
                {keys.map((key, i) => (
                    <Area 
                        key={key} 
                        type="monotone" 
                        dataKey={key} 
                        stackId="1" 
                        stroke={CHART_COLORS[i % CHART_COLORS.length]} 
                        fillOpacity={1} 
                        fill={`url(#color${i})`} 
                    />
                ))}
            </AreaChart>
        </ResponsiveContainer>
    );
}
export default TrendChart;
