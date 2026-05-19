'use client';

import { useChannelList } from '@/api/endpoints/channel';
import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { TrendingUp } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContents, TabsContent } from '@/components/animate-ui/components/animate/tabs';
import { useHomeViewStore, type RankSortMode } from '@/components/modules/home/store';
import { cn } from '@/lib/utils';

type ChannelData = NonNullable<ReturnType<typeof useChannelList>['data']>[number];

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

        return (
            <div className="space-y-2">
                {channels.slice(0, 8).map((channel, index) => {
                    const rank = index + 1;
                    return (
                        <div
                            key={channel.raw.id}
                            className="flex items-center gap-3 rounded-lg border border-border/60 bg-background/40 px-3 py-2.5 transition-all duration-200 hover:-translate-y-px hover:border-primary/20 hover:bg-background/80"
                        >
                            <div className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg border text-sm font-semibold', rankBadgeTone(rank))}>
                                {rank}
                            </div>

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
        );
    };

    return (
        <div className="rounded-lg border border-border/70 bg-card p-4 shadow-sm transition-shadow duration-200 hover:shadow-md">
            <Tabs value={rankSortMode} onValueChange={(value) => setRankSortMode(value as RankSortMode)}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h3 className="text-base font-semibold">{t('title')}</h3>
                        <p className="mt-1 text-xs text-muted-foreground">{t('successRate')}</p>
                    </div>
                    <TabsList>
                        <TabsTrigger value="cost">{t('sortByCost')}</TabsTrigger>
                        <TabsTrigger value="count">{t('sortByCount')}</TabsTrigger>
                        <TabsTrigger value="tokens">{t('sortByTokens')}</TabsTrigger>
                    </TabsList>
                </div>
                <TabsContents className="mt-3">
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
