'use client';

import { useEffect, useState, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { RefreshCw, Clock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useSettingList, useSetSetting, SettingKey } from '@/api/endpoints/setting';
import { useLastSyncTime, useSyncChannel } from '@/api/endpoints/channel';
import { toast } from '@/components/common/Toast';

export function SettingLLMSync() {
    const t = useTranslations('setting');
    const { data: settings } = useSettingList();
    const setSetting = useSetSetting();
    const syncChannel = useSyncChannel();
    const { data: lastSyncTime } = useLastSyncTime();

    const [syncInterval, setSyncInterval] = useState('');
    const initialSyncInterval = useRef('');

    useEffect(() => {
        if (settings) {
            const interval = settings.find(s => s.key === SettingKey.SyncLLMInterval);
            if (interval) {
                queueMicrotask(() => setSyncInterval(interval.value));
                initialSyncInterval.current = interval.value;
            }
        }
    }, [settings]);

    const handleSave = (key: string, value: string, initialValue: string) => {
        if (value === initialValue) return;

        setSetting.mutate({ key, value }, {
            onSuccess: () => {
                toast.success(t('saved'));
                initialSyncInterval.current = value;
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

    const formatLastSyncTime = (timeStr: string | undefined) => {
        if (!timeStr) return t('llmSync.neverSynced');
        const date = new Date(timeStr);
        if (date.getFullYear() === 1) return t('llmSync.neverSynced');
        return date.toLocaleString();
    };

    return (
        <div className="space-y-1">
            <div className="flex items-center gap-2 px-1 pb-2">
                <RefreshCw className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground/80">{t('llmSync.title')}</h3>
            </div>

            <div className="flex flex-col divide-y divide-border/40 rounded-2xl bg-background/30 border border-border/40 px-4">
                {/* 同步间隔 */}
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
                        className="w-64 rounded-xl bg-background/50"
                    />
                </div>

                {/* 手动同步 */}
                <div className="flex items-center justify-between gap-4 py-3">
                    <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-3">
                            <RefreshCw className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="text-sm font-medium text-foreground/90">{t('llmSync.manualSync.label')}</span>
                        </div>
                        <span className="text-[11px] leading-relaxed text-muted-foreground ml-7">
                            {t('llmSync.lastSync')}: {formatLastSyncTime(lastSyncTime)}
                        </span>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleManualSync}
                        disabled={syncChannel.isPending}
                        className="w-64 rounded-xl shadow-none bg-background/50 hover:bg-background/80 hover:text-primary transition-colors border-border/60"
                    >
                        {syncChannel.isPending ? t('llmSync.manualSync.syncing') : t('llmSync.manualSync.button')}
                    </Button>
                </div>
            </div>
        </div>
    );
}
