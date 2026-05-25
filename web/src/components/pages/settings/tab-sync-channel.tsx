'use client';

/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { RefreshCw, Clock, DollarSign } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useSettingList, useSetSetting, SettingKey } from '@/api/endpoints/setting';
import { useLastSyncTime, useSyncChannel } from '@/api/endpoints/channel';
import { useUpdateModelPrice, useLastUpdateTime } from '@/api/endpoints/model';
import { toast } from 'sonner';

export function SettingChannelSync() {
    const t = useTranslations('setting');
    const { data: settings } = useSettingList();
    const setSetting = useSetSetting();
    const syncChannel = useSyncChannel();
    const { data: lastSyncTime } = useLastSyncTime();
    const updatePrice = useUpdateModelPrice();
    const { data: lastUpdateTime } = useLastUpdateTime();

    const [syncInterval, setSyncInterval] = useState('');
    const [priceUpdateInterval, setPriceUpdateInterval] = useState('');
    const initialSyncInterval = useRef('');
    const initialPriceUpdateInterval = useRef('');

    useEffect(() => {
        if (settings) {
            const syncItem = settings.find(s => s.key === SettingKey.SyncLLMInterval);
            const priceItem = settings.find(s => s.key === SettingKey.ModelInfoUpdateInterval);
            
            if (syncItem) {
                setSyncInterval(syncItem.value);
                initialSyncInterval.current = syncItem.value;
            }
            if (priceItem) {
                setPriceUpdateInterval(priceItem.value);
                initialPriceUpdateInterval.current = priceItem.value;
            }
        }
    }, [settings]);

    const handleSave = (key: string, value: string, initialValue: string) => {
        if (value === initialValue) return;

        setSetting.mutate({ key, value }, {
            onSuccess: () => {
                toast.success(t('saved'));
                if (key === SettingKey.SyncLLMInterval) {
                    initialSyncInterval.current = value;
                } else if (key === SettingKey.ModelInfoUpdateInterval) {
                    initialPriceUpdateInterval.current = value;
                }
            }
        });
    };

    const handleManualSync = () => {
        syncChannel.mutate(undefined, {
            onSuccess: () => {
                toast.success(t('llmSync.syncSuccess'));
            },
            onError: () => {
                toast.error(t('llmSync.syncFailed'));
            }
        });
    };

    const handleManualPriceUpdate = () => {
        updatePrice.mutate(undefined, {
            onSuccess: () => {
                toast.success(t('llmPrice.updateSuccess'));
            },
            onError: () => {
                toast.error(t('llmPrice.updateFailed'));
            }
        });
    };

    const formatDateString = (timeStr: string | undefined) => {
        if (!timeStr) return t('llmSync.neverSynced');
        const date = new Date(timeStr);
        if (date.getFullYear() === 1) return t('llmSync.neverSynced');
        return date.toLocaleString();
    };

    const formatPriceDateString = (timeStr: string | undefined) => {
        if (!timeStr) return t('llmPrice.neverUpdated');
        const date = new Date(timeStr);
        if (date.getFullYear() === 1) return t('llmPrice.neverUpdated');
        return date.toLocaleString();
    };

    return (
        <div className="space-y-6">
            {/* 渠道同步 */}
            <div className="space-y-2">
                <div className="flex items-center gap-2 px-1 pb-1">
                    <RefreshCw className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold text-foreground/80">{t('llmSync.title')}</h3>
                </div>

                <div className="flex flex-col divide-y divide-border/40 rounded-2xl bg-card border border-border px-4 shadow-2xs">
                    <div className="flex items-center justify-between gap-4 py-3">
                        <div className="flex items-center gap-3">
                            <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="text-sm font-medium text-foreground/90">{t('llmSync.syncInterval.label')}</span>
                        </div>
                        <Input
                            type="number"
                            value={syncInterval}
                            onChange={(e) => setSyncInterval(e.target.value)}
                            onBlur={() => handleSave(SettingKey.SyncLLMInterval, syncInterval, initialSyncInterval.current)}
                            placeholder={t('llmSync.syncInterval.placeholder')}
                            className="w-64 rounded-xl bg-background"
                        />
                    </div>

                    <div className="flex items-center justify-between gap-4 py-3">
                        <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-3">
                                <RefreshCw className="h-4 w-4 text-muted-foreground shrink-0" />
                                <span className="text-sm font-medium text-foreground/90">{t('llmSync.manualSync.label')}</span>
                            </div>
                            <span className="text-[10px] text-muted-foreground ml-7 leading-normal">
                                {t('llmSync.lastSync')}: {formatDateString(lastSyncTime)}
                            </span>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleManualSync}
                            disabled={syncChannel.isPending}
                            className="w-64 rounded-xl shadow-none hover:text-primary transition-colors"
                        >
                            {syncChannel.isPending ? t('llmSync.manualSync.syncing') : t('llmSync.manualSync.button')}
                        </Button>
                    </div>
                </div>
            </div>

            {/* 模型价格 */}
            <div className="space-y-2">
                <div className="flex flex-col gap-1 px-1 pb-1">
                    <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-primary" />
                        <h3 className="text-sm font-semibold text-foreground/80">{t('llmPrice.title')}</h3>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                        <div className="flex flex-wrap gap-1">
                            <Badge variant="secondary" className="rounded-md bg-secondary/65 font-normal text-[10px]">{t('llmPrice.syncOrder.upstream')}</Badge>
                            <Badge variant="outline" className="rounded-md border-border bg-background/50 font-normal text-[10px]">{t('llmPrice.syncOrder.official')}</Badge>
                            <Badge variant="outline" className="rounded-md border-border bg-background/50 font-normal text-[10px]">{t('llmPrice.syncOrder.manual')}</Badge>
                        </div>
                        <span className="text-[10px] text-muted-foreground ml-2 hidden sm:inline-block">{t('llmPrice.syncHint')}</span>
                    </div>
                </div>

                <div className="flex flex-col divide-y divide-border/40 rounded-2xl bg-card border border-border px-4 shadow-2xs">
                    <div className="flex items-center justify-between gap-4 py-3">
                        <div className="flex items-center gap-3">
                            <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="text-sm font-medium text-foreground/90">{t('llmPrice.updateInterval.label')}</span>
                        </div>
                        <Input
                            type="number"
                            value={priceUpdateInterval}
                            onChange={(e) => setPriceUpdateInterval(e.target.value)}
                            onBlur={() => handleSave(SettingKey.ModelInfoUpdateInterval, priceUpdateInterval, initialPriceUpdateInterval.current)}
                            placeholder={t('llmPrice.updateInterval.placeholder')}
                            className="w-64 rounded-xl bg-background"
                        />
                    </div>

                    <div className="flex items-center justify-between gap-4 py-3">
                        <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-3">
                                <RefreshCw className="h-4 w-4 text-muted-foreground shrink-0" />
                                <span className="text-sm font-medium text-foreground/90">{t('llmPrice.manualUpdate.label')}</span>
                            </div>
                            <span className="text-[10px] text-muted-foreground ml-7 leading-normal">
                                {t('llmPrice.lastUpdate')}: {formatPriceDateString(lastUpdateTime)}
                            </span>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleManualPriceUpdate}
                            disabled={updatePrice.isPending}
                            className="w-64 rounded-xl shadow-none hover:text-primary transition-colors"
                        >
                            {updatePrice.isPending ? t('llmPrice.manualUpdate.updating') : t('llmPrice.manualUpdate.button')}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
export { SettingChannelSync as SettingLLMSync };
