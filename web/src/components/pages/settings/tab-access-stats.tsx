'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useStatsAPIKey } from '@/api/endpoints/stats';
import { type APIKey } from '@/api/endpoints/apikey';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface APIKeyStatsCardProps {
    apiKey: APIKey;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function APIKeyStatsCard({ apiKey, open, onOpenChange }: APIKeyStatsCardProps) {
    const t = useTranslations('setting');
    const { data: statsList = [] } = useStatsAPIKey();
    const stats = useMemo(() => statsList.find((s) => s.api_key_id === apiKey.id), [statsList, apiKey.id]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md rounded-2xl">
                <DialogHeader>
                    <DialogTitle className="text-sm font-semibold truncate leading-6 pr-6">
                        {apiKey.name} - {t('apiKey.stats.title', { defaultMessage: '使用统计' })}
                    </DialogTitle>
                </DialogHeader>

                {!stats ? (
                    <div className="py-8 text-center text-xs text-muted-foreground">{t('apiKey.stats.noData')}</div>
                ) : (
                    <div className="grid grid-cols-2 gap-3 text-xs pt-2">
                        <div className="rounded-xl bg-muted/40 p-3 border border-border/20">
                            <div className="text-muted-foreground mb-1">{t('apiKey.stats.inputToken')}</div>
                            <div className="font-semibold font-mono text-sm tabular-nums">
                                {stats.input_token.formatted.value}
                                <span className="text-[10px] text-muted-foreground ml-0.5">{stats.input_token.formatted.unit}</span>
                            </div>
                        </div>
                        <div className="rounded-xl bg-muted/40 p-3 border border-border/20">
                            <div className="text-muted-foreground mb-1">{t('apiKey.stats.outputToken')}</div>
                            <div className="font-semibold font-mono text-sm tabular-nums">
                                {stats.output_token.formatted.value}
                                <span className="text-[10px] text-muted-foreground ml-0.5">{stats.output_token.formatted.unit}</span>
                            </div>
                        </div>
                        <div className="rounded-xl bg-muted/40 p-3 border border-border/20">
                            <div className="text-muted-foreground mb-1">{t('apiKey.stats.inputCost')}</div>
                            <div className="font-semibold font-mono text-sm tabular-nums">
                                {stats.input_cost.formatted.value}
                                <span className="text-[10px] text-muted-foreground ml-0.5">{stats.input_cost.formatted.unit}</span>
                            </div>
                        </div>
                        <div className="rounded-xl bg-muted/40 p-3 border border-border/20">
                            <div className="text-muted-foreground mb-1">{t('apiKey.stats.outputCost')}</div>
                            <div className="font-semibold font-mono text-sm tabular-nums">
                                {stats.output_cost.formatted.value}
                                <span className="text-[10px] text-muted-foreground ml-0.5">{stats.output_cost.formatted.unit}</span>
                            </div>
                        </div>
                        <div className="rounded-xl bg-muted/40 p-3 border border-border/20">
                            <div className="text-muted-foreground mb-1">{t('apiKey.stats.requestSuccess')}</div>
                            <div className="font-semibold font-mono text-sm tabular-nums">
                                {stats.request_success.formatted.value}
                                <span className="text-[10px] text-muted-foreground ml-0.5">{stats.request_success.formatted.unit}</span>
                            </div>
                        </div>
                        <div className="rounded-xl bg-muted/40 p-3 border border-border/20">
                            <div className="text-muted-foreground mb-1">{t('apiKey.stats.requestFailed')}</div>
                            <div className="font-semibold font-mono text-sm tabular-nums text-destructive">
                                {stats.request_failed.formatted.value}
                                <span className="text-[10px] text-muted-foreground ml-0.5">{stats.request_failed.formatted.unit}</span>
                            </div>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
