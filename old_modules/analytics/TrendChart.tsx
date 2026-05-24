import { useTheme } from 'next-themes';
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

const CHART_COLORS = [
    '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#14b8a6', '#f97316', '#6366f1'
];

export function TrendChart({ data, keys, isLoading }: { data: any[]; keys: string[]; isLoading: boolean }) {
    if (isLoading) {
        return <div className="flex items-center justify-center h-full text-sm text-muted-foreground">加载中...</div>;
    }
    if (data.length === 0) {
        return <div className="flex items-center justify-center h-full text-sm text-muted-foreground">暂无数据</div>;
    }

    return (
        <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                    {keys.map((key, i) => (
                        <linearGradient key={`color${i}`} id={`color${i}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={CHART_COLORS[i % CHART_COLORS.length]} stopOpacity={0.8} />
                            <stop offset="95%" stopColor={CHART_COLORS[i % CHART_COLORS.length]} stopOpacity={0} />
                        </linearGradient>
                    ))}
                </defs>
                <XAxis 
                    dataKey="time" 
                    stroke="#888888" 
                    fontSize={12} 
                    tickLine={false} 
                    axisLine={false} 
                />
                <YAxis 
                    stroke="#888888" 
                    fontSize={12} 
                    tickLine={false} 
                    axisLine={false} 
                    tickFormatter={(val) => `${val}`}
                />
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <Tooltip 
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '20px' }} />
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
