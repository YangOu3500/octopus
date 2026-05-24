'use client';

import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Cell } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { useChannelList } from '@/api/endpoints/channel';
import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { TrendingUp } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContents, TabsContent } from '@/components/animate-ui/components/animate/tabs';
import { useHomeViewStore, type RankSortMode } from '@/components/modules/home/store';
import { cn } from '@/lib/utils';

type ChannelData = NonNullable<ReturnType<typeof useChannelList>['data']>[number];

const RANK_COLORS = [
    'hsl(var(--primary))',
    'hsl(var(--chart-2))',
    'hsl(var(--chart-3))',
    'hsl(var(--chart-4))',
    'hsl(var(--chart-5))',
    'hsl(var(--primary) / 0.6)',
    'hsl(var(--chart-2) / 0.6)',
    'hsl(var(--chart-3) / 0.6)',
];

function rankBadgeTone(rank: number) {
    if (rank === 1) return 'border-primary/20 bg-primary/10 text-primary';
    if (rank === 2) return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
    if (rank === 3) return 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300';
    return 'border-border/70 bg-background text-muted-foreground';
}

export function Rank() {
    const { data: channelData } = useChannelList();
    const t = useTranslations('home.rank');
    const rankSortMode = useHomeViewStore((state) => state.rankSortMode);
    const setRankSortMode = useHomeViewStore((state) => state.setRankSortMode);

    const rankedByCost = useMemo<ChannelData[]>(() => {
        if (!channelData) return [];
        return [...channelData].sort((a, b) => b.formatted.total_cost.raw - a.formatted.total_cost.raw);
    }, [channelData]);

    const rankedByCount = useMemo<ChannelData[]>(() => {
        if (!channelData) return [];
        return [...channelData].sort((a, b) => b.formatted.request_count.raw - a.formatted.request_count.raw);
    }, [channelData]);

    const rankedByTokens = useMemo<ChannelData[]>(() => {
        if (!channelData) return [];
        return [...channelData].sort((a, b) => b.formatted.total_token.raw - a.formatted.total_token.raw);
    }, [channelData]);

    const renderValue = (channel: ChannelData, mode: RankSortMode) => {
        if (mode === 'count') {
            return (
                <span className="font-semibold tabular-nums">
                    {channel.formatted.request_count.formatted.value}
                    <span className="ml-0.5 text-xs text-muted-foreground">{channel.formatted.request_count.formatted.unit}</span>
                </span>
            );
        }
        if (mode === 'tokens') {
            return (
                <span className="font-semibold tabular-nums">
                    {channel.formatted.total_token.formatted.value}
                    <span className="ml-0.5 text-xs text-muted-foreground">{channel.formatted.total_token.formatted.unit}</span>
                </span>
            );
        }
        return (
            <span className="font-semibold tabular-nums">
                {channel.formatted.total_cost.formatted.value}
                <span className="ml-0.5 text-xs text-muted-foreground">{channel.formatted.total_cost.formatted.unit}</span>
            </span>
        );
    };

    const renderSub = (channel: ChannelData, mode: RankSortMode) => {
        if (mode === 'count') {
            const successCount = channel.formatted.request_success.raw;
            const failedCount = channel.formatted.request_failed.raw;
            const totalCount = successCount + failedCount;
            const successRate = totalCount > 0 ? (successCount / totalCount) * 100 : 0;
            return `${t('successRate')}: ${successRate.toFixed(1)}%`;
        }
        if (mode === 'tokens') {
            return `${channel.formatted.request_count.formatted.value}${channel.formatted.request_count.formatted.unit} requests`;
        }
        return `${channel.formatted.total_token.formatted.value}${channel.formatted.total_token.formatted.unit} tokens`;
    };

    const renderList = (channels: ChannelData[], mode: RankSortMode) => {
        if (channels.length === 0) {
            return (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <TrendingUp className="mb-3 size-10 opacity-30" />
                    <p className="text-sm">{t('noData')}</p>
                </div>
            );
        }

        const top8 = channels.slice(0, 8);
        const chartData = top8.map((channel, index) => ({
            name: channel.raw.name,
            value: mode === 'tokens' ? channel.formatted.total_token.raw : (mode === 'cost' ? channel.formatted.total_cost.raw : channel.formatted.request_count.raw),
            formattedValue: mode === 'tokens' 
                ? `${channel.formatted.total_token.formatted.value}${channel.formatted.total_token.formatted.unit}`
                : (mode === 'cost' ? `$${channel.formatted.total_cost.formatted.value}${channel.formatted.total_cost.formatted.unit.replace('$', '')}` : `${channel.formatted.request_count.formatted.value}${channel.formatted.request_count.formatted.unit}`),
            color: RANK_COLORS[index] || RANK_COLORS[0],
        }));
        
        const chartConfig = {
            value: { label: t(`sortBy${mode.charAt(0).toUpperCase() + mode.slice(1)}`) }
        };

        return (
            <div className="space-y-6">
                <div className="h-[200px] w-full mt-2">
                    <ChartContainer config={chartConfig} className="h-full w-full">
                        <BarChart accessibilityLayer data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="oklch(var(--border) / 0.4)" />
                            <XAxis 
                                dataKey="name" 
                                tickLine={false} 
                                axisLine={false} 
                                tickMargin={8} 
                                stroke="oklch(var(--foreground) / 0.55)"
                                className="text-[10px] font-semibold truncate"
                                tickFormatter={(value) => value.length > 6 ? `${value.substring(0, 6)}...` : value}
                            />
                            <ChartTooltip cursor={{ fill: 'oklch(var(--muted) / 0.5)' }} content={<ChartTooltipContent />} />
                            <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={40}>
                                {chartData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ChartContainer>
                </div>
                
                <div className="space-y-2">
                    {top8.map((channel, index) => {
                        const rank = index + 1;
                        return (
                            <div
                                key={channel.raw.id}
                                className="flex items-center gap-3 rounded-lg border border-border/60 bg-background/40 px-3 py-2.5 transition-all duration-200 hover:-translate-y-px hover:border-primary/20 hover:bg-background/80"
                            >
                                <div className="flex size-3 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: RANK_COLORS[index] || RANK_COLORS[0] }} />

                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm font-medium">{channel.raw.name}</div>
                                    <div className="mt-1 truncate text-xs text-muted-foreground">{renderSub(channel, mode)}</div>
                                </div>

                                <div className="shrink-0 text-right text-sm">
                                    {renderValue(channel, mode)}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full">
            <Tabs value={rankSortMode} onValueChange={(value) => setRankSortMode(value as RankSortMode)}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
                    <div className="hidden sm:block">
                        <p className="text-[13px] font-medium text-muted-foreground/80">{t('successRate')}</p>
                    </div>
                    <TabsList className="bg-muted/40 border border-border/40 p-1">
                        <TabsTrigger value="cost" className="rounded-md px-3 py-1.5 text-xs font-semibold">{t('sortByCost')}</TabsTrigger>
                        <TabsTrigger value="count" className="rounded-md px-3 py-1.5 text-xs font-semibold">{t('sortByCount')}</TabsTrigger>
                        <TabsTrigger value="tokens" className="rounded-md px-3 py-1.5 text-xs font-semibold">{t('sortByTokens')}</TabsTrigger>
                    </TabsList>
                </div>
                <TabsContents>
                    <TabsContent value="cost">
                        {renderList(rankedByCost, 'cost')}
                    </TabsContent>
                    <TabsContent value="count">
                        {renderList(rankedByCount, 'count')}
                    </TabsContent>
                    <TabsContent value="tokens">
                        {renderList(rankedByTokens, 'tokens')}
                    </TabsContent>
                </TabsContents>
            </Tabs>
        </div>
    );
}
