'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CalendarCheck2, Clock3, Globe2, RefreshCw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useSettingList, useSetSetting, SettingKey } from '@/api/endpoints/setting';
import { useCheckinAllSites, useSyncAllSites } from '@/api/endpoints/site';
import { toast } from '@/components/common/Toast';
import { useSettingStore } from '@/stores/setting';
import { translateSiteMessage } from '@/components/modules/site/site-message';

function getErrorMessage(error: unknown, fallback: string) {
    if (error instanceof Error && error.message.trim()) {
        return error.message;
    }
    if (error && typeof error === 'object' && 'message' in error) {
        const message = (error as { message?: unknown }).message;
        if (typeof message === 'string' && message.trim()) {
            return message;
        }
    }
    return fallback;
}

export function SettingSiteAutomation() {
    const rootT = useTranslations();
    const t = useTranslations('setting.siteAutomation');
    const settingT = useTranslations('setting');
    const locale = useSettingStore((state) => state.locale);
    const { data: settings } = useSettingList();
    const setSetting = useSetSetting();
    const syncAllSites = useSyncAllSites();
    const checkinAllSites = useCheckinAllSites();

    const [syncInterval, setSyncInterval] = useState('');
    const [checkinInterval, setCheckinInterval] = useState('');
    const initialSyncInterval = useRef('');
    const initialCheckinInterval = useRef('');

    useEffect(() => {
        if (!settings) return;

        const siteSync = settings.find((item) => item.key === SettingKey.SiteSyncInterval);
        const siteCheckin = settings.find((item) => item.key === SettingKey.SiteCheckinInterval);

        if (siteSync) {
            queueMicrotask(() => setSyncInterval(siteSync.value));
            initialSyncInterval.current = siteSync.value;
        }
        if (siteCheckin) {
            queueMicrotask(() => setCheckinInterval(siteCheckin.value));
            initialCheckinInterval.current = siteCheckin.value;
        }
    }, [settings]);

    function handleSave(key: string, value: string, initialValue: string, onSaved: (next: string) => void) {
        if (value === initialValue) return;

        setSetting.mutate(
            { key, value },
            {
                onSuccess: () => {
                    onSaved(value);
                    toast.success(settingT('saved'));
                },
                onError: (error) => {
                    toast.error(translateSiteMessage(locale, getErrorMessage(error, settingT('saveFailed')), rootT));
                },
            },
        );
    }

    function handleManualSync() {
        syncAllSites.mutate(undefined, {
            onSuccess: () => {
                toast.success(t('manualSync.success'));
            },
            onError: (error) => {
                toast.error(translateSiteMessage(locale, getErrorMessage(error, t('manualSync.failed')), rootT));
            },
        });
    }

    function handleManualCheckin() {
        checkinAllSites.mutate(undefined, {
            onSuccess: () => {
                toast.success(t('manualCheckin.success'));
            },
            onError: (error) => {
                toast.error(translateSiteMessage(locale, getErrorMessage(error, t('manualCheckin.failed')), rootT));
            },
        });
    }

    return (
        <div className="space-y-1">
            <div className="flex items-center gap-2 px-1 pb-2">
                <Globe2 className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground/80">{t('title')}</h3>
            </div>

            <div className="flex flex-col divide-y divide-border/40 rounded-2xl bg-background/30 border border-border/40 px-4">
                <div className="flex items-center justify-between gap-4 py-3">
                    <div className="flex items-center gap-3">
                        <Clock3 className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium text-foreground/90">{t('syncInterval.label')}</span>
                    </div>
                    <Input
                        type="number"
                        value={syncInterval}
                        onChange={(event) => setSyncInterval(event.target.value)}
                        onBlur={() =>
                            handleSave(SettingKey.SiteSyncInterval, syncInterval, initialSyncInterval.current, (next) => {
                                initialSyncInterval.current = next;
                            })
                        }
                        placeholder={t('syncInterval.placeholder')}
                        className="w-64 rounded-xl bg-background/50"
                    />
                </div>

                <div className="flex items-center justify-between gap-4 py-3">
                    <div className="flex items-center gap-3">
                        <Clock3 className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium text-foreground/90">{t('checkinInterval.label')}</span>
                    </div>
                    <Input
                        type="number"
                        value={checkinInterval}
                        onChange={(event) => setCheckinInterval(event.target.value)}
                        onBlur={() =>
                            handleSave(
                                SettingKey.SiteCheckinInterval,
                                checkinInterval,
                                initialCheckinInterval.current,
                                (next) => {
                                    initialCheckinInterval.current = next;
                                },
                            )
                        }
                        placeholder={t('checkinInterval.placeholder')}
                        className="w-64 rounded-xl bg-background/50"
                    />
                </div>

                <div className="flex items-center justify-between gap-4 py-3">
                    <div className="flex items-center gap-3">
                        <RefreshCw className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium text-foreground/90">{t('manualSync.label')}</span>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleManualSync}
                        disabled={syncAllSites.isPending}
                        className="w-64 rounded-xl shadow-none bg-background/50 hover:bg-background/80 hover:text-primary transition-colors border-border/60"
                    >
                        {syncAllSites.isPending ? t('manualSync.pending') : t('manualSync.button')}
                    </Button>
                </div>

                <div className="flex items-center justify-between gap-4 py-3">
                    <div className="flex items-center gap-3">
                        <CalendarCheck2 className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium text-foreground/90">{t('manualCheckin.label')}</span>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleManualCheckin}
                        disabled={checkinAllSites.isPending}
                        className="w-64 rounded-xl shadow-none bg-background/50 hover:bg-background/80 hover:text-primary transition-colors border-border/60"
                    >
                        {checkinAllSites.isPending ? t('manualCheckin.pending') : t('manualCheckin.button')}
                    </Button>
                </div>
            </div>
        </div>
    );
}
