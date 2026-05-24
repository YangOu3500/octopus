'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { DollarSign, Clock, RefreshCw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useSettingList, useSetSetting, SettingKey } from '@/api/endpoints/setting';
import { useUpdateModelPrice, useLastUpdateTime } from '@/api/endpoints/model';
import { toast } from '@/components/common/Toast';

export function SettingLLMPrice() {
    const t = useTranslations('setting');
    const { data: settings } = useSettingList();
    const setSetting = useSetSetting();
    const updatePrice = useUpdateModelPrice();
    const { data: lastUpdateTime } = useLastUpdateTime();

    const [updateInterval, setUpdateInterval] = useState('');
    const initialUpdateInterval = useRef('');

    useEffect(() => {
        if (settings) {
            const interval = settings.find(s => s.key === SettingKey.ModelInfoUpdateInterval);
            if (interval) {
                queueMicrotask(() => setUpdateInterval(interval.value));
                initialUpdateInterval.current = interval.value;
            }
        }
    }, [settings]);

    const handleSave = (key: string, value: string, initialValue: string) => {
        if (value === initialValue) return;

        setSetting.mutate({ key, value }, {
            onSuccess: () => {
                toast.success(t('saved'));
                initialUpdateInterval.current = value;
            }
        });
    };

    const handleManualUpdate = () => {
        updatePrice.mutate(undefined, {
            onSuccess: () => {
                toast.success(t('llmPrice.updateSuccess'));
            },
            onError: () => {
                toast.error(t('llmPrice.updateFailed'));
            }
        });
    };

    const formatLastUpdateTime = (timeStr: string | undefined) => {
        if (!timeStr) return t('llmPrice.neverUpdated');
        const date = new Date(timeStr);
        if (date.getFullYear() === 1) return t('llmPrice.neverUpdated');
        return date.toLocaleString();
    };

    return (
        <div className="space-y-1">
            <div className="flex flex-col gap-2 px-1 pb-2">
                <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold text-foreground/80">{t('llmPrice.title')}</h3>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex flex-wrap gap-1.5">
                        <Badge variant="secondary" className="rounded-md bg-secondary/50 font-normal">{t('llmPrice.syncOrder.upstream')}</Badge>
                        <Badge variant="outline" className="rounded-md border-border/60 bg-background/50 font-normal">{t('llmPrice.syncOrder.official')}</Badge>
                        <Badge variant="outline" className="rounded-md border-border/60 bg-background/50 font-normal">{t('llmPrice.syncOrder.manual')}</Badge>
                    </div>
                    <span className="text-xs text-muted-foreground ml-2 hidden sm:inline-block">{t('llmPrice.syncHint')}</span>
                </div>
            </div>

            <div className="flex flex-col divide-y divide-border/40 rounded-2xl bg-background/30 border border-border/40 px-4">
                <div className="flex items-center justify-between gap-4 py-3">
                    <div className="flex items-center gap-3">
                        <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium text-foreground/90">{t('llmPrice.updateInterval.label')}</span>
                    </div>
                    <Input
                        type="number"
                        value={updateInterval}
                        onChange={(e) => setUpdateInterval(e.target.value)}
                        onBlur={() => handleSave(SettingKey.ModelInfoUpdateInterval, updateInterval, initialUpdateInterval.current)}
                        placeholder={t('llmPrice.updateInterval.placeholder')}
                        className="w-64 rounded-xl bg-background/50"
                    />
                </div>

                <div className="flex items-center justify-between gap-4 py-3">
                    <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-3">
                            <RefreshCw className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="text-sm font-medium text-foreground/90">{t('llmPrice.manualUpdate.label')}</span>
                        </div>
                        <span className="text-[11px] leading-relaxed text-muted-foreground ml-7">
                            {t('llmPrice.lastUpdate')}: {formatLastUpdateTime(lastUpdateTime)}
                        </span>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleManualUpdate}
                        disabled={updatePrice.isPending}
                        className="w-64 rounded-xl shadow-none bg-background/50 hover:bg-background/80 hover:text-primary transition-colors border-border/60"
                    >
                        {updatePrice.isPending ? t('llmPrice.manualUpdate.updating') : t('llmPrice.manualUpdate.button')}
                    </Button>
                </div>
            </div>
        </div>
    );
}
