'use client';

import { useEffect, useState, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { ScrollText, Calendar, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { useSettingList, useSetSetting, SettingKey } from '@/api/endpoints/setting';
import { useClearLogs } from '@/api/endpoints/log';
import { toast } from '@/components/common/Toast';

export function SettingLog() {
    const t = useTranslations('setting');
    const { data: settings } = useSettingList();
    const setSetting = useSetSetting();
    const clearLogs = useClearLogs();

    const [enabled, setEnabled] = useState(true);
    const [keepPeriod, setKeepPeriod] = useState('7');
    const [isClearing, setIsClearing] = useState(false);

    const initialEnabled = useRef(true);
    const initialKeepPeriod = useRef('7');

    useEffect(() => {
        if (settings) {
            const enabledSetting = settings.find(s => s.key === SettingKey.RelayLogKeepEnabled);
            const periodSetting = settings.find(s => s.key === SettingKey.RelayLogKeepPeriod);
            if (enabledSetting) {
                const isEnabled = enabledSetting.value === 'true';
                queueMicrotask(() => setEnabled(isEnabled));
                initialEnabled.current = isEnabled;
            }
            if (periodSetting) {
                queueMicrotask(() => setKeepPeriod(periodSetting.value));
                initialKeepPeriod.current = periodSetting.value;
            }
        }
    }, [settings]);

    const handleEnabledChange = (checked: boolean) => {
        setEnabled(checked);
        setSetting.mutate(
            { key: SettingKey.RelayLogKeepEnabled, value: checked ? 'true' : 'false' },
            {
                onSuccess: () => {
                    toast.success(t('saved'));
                    initialEnabled.current = checked;
                }
            }
        );
    };

    const handleKeepPeriodSave = () => {
        if (keepPeriod === initialKeepPeriod.current) return;

        setSetting.mutate(
            { key: SettingKey.RelayLogKeepPeriod, value: keepPeriod },
            {
                onSuccess: () => {
                    toast.success(t('saved'));
                    initialKeepPeriod.current = keepPeriod;
                }
            }
        );
    };

    const handleClearLogs = () => {
        setIsClearing(true);
        clearLogs.mutate(undefined, {
            onSuccess: () => {
                toast.success(t('log.clearSuccess'));
                setIsClearing(false);
            },
            onError: () => {
                toast.error(t('log.clearFailed'));
                setIsClearing(false);
            }
        });
    };

    return (
        <div className="space-y-1">
            <div className="flex items-center gap-2 px-1 pb-2">
                <ScrollText className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground/80">{t('log.title')}</h3>
            </div>
            
            <div className="flex flex-col divide-y divide-border/40 rounded-2xl bg-background/30 border border-border/40 px-4">
                {/* 是否启用历史日志 */}
                <div className="flex items-center justify-between gap-4 py-3">
                    <div className="flex items-center gap-3">
                        <ScrollText className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium text-foreground/90">{t('log.enabled.label')}</span>
                    </div>
                    <Switch
                        checked={enabled}
                        onCheckedChange={handleEnabledChange}
                    />
                </div>

                {/* 历史日志保存范围 */}
                <div className="flex items-center justify-between gap-4 py-3">
                    <div className="flex items-center gap-3">
                        <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium text-foreground/90">{t('log.keepPeriod.label')}</span>
                    </div>
                    <Input
                        type="number"
                        value={keepPeriod}
                        onChange={(e) => setKeepPeriod(e.target.value)}
                        onBlur={handleKeepPeriodSave}
                        placeholder="天数 (例如 7)"
                        className="w-64 rounded-xl bg-background/50"
                        disabled={!enabled}
                    />
                </div>
            </div>

            {/* 危险区 - 清空历史日志 */}
            <div className="mt-4 flex flex-col rounded-2xl bg-destructive/5 border border-destructive/20 p-4">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                            <Trash2 className="h-4 w-4 text-destructive shrink-0" />
                            <span className="text-sm font-medium text-destructive">{t('log.clear.label')}</span>
                        </div>
                        <span className="text-xs text-muted-foreground pl-6">执行后不可撤销，彻底清理所有网关请求历史数据。</span>
                    </div>
                    <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleClearLogs}
                        disabled={isClearing}
                        className="rounded-xl shadow-none"
                    >
                        {isClearing ? t('log.clear.clearing') : t('log.clear.button')}
                    </Button>
                </div>
            </div>
        </div>
    );
}
