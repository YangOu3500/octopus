'use client';

/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState, useRef, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { ScrollText, Calendar, Trash2, Database, Download, Upload, Info, Tag, Github, AlertTriangle, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { useSettingList, useSetSetting, SettingKey, useExportDB, useImportDB } from '@/api/endpoints/setting';
import { useClearLogs } from '@/api/endpoints/log';
import { APP_BUILD_TIME, APP_COMMIT, APP_VERSION, GITHUB_REPO } from '@/lib/info';
import { useBuildInfo, useLatestInfo, useUpdateCore } from '@/api/endpoints/update';
import { isOctopusCacheName, isFontCacheName, SW_MESSAGE_TYPE } from '@/lib/sw';
import { SettingFusion } from './tab-maintenance-fusion';
import { toast } from 'sonner';

export function SettingMaintenance() {
    const t = useTranslations('setting');

    // --- Log retention logic ---
    const { data: settings } = useSettingList();
    const setSetting = useSetSetting();
    const clearLogs = useClearLogs();

    const [logKeepEnabled, setLogKeepEnabled] = useState(true);
    const [logKeepPeriod, setLogKeepPeriod] = useState('7');
    const [isClearing, setIsClearing] = useState(false);

    const initialLogKeepEnabled = useRef(true);
    const initialLogKeepPeriod = useRef('7');

    useEffect(() => {
        if (settings) {
            const enabledSetting = settings.find(s => s.key === SettingKey.RelayLogKeepEnabled);
            const periodSetting = settings.find(s => s.key === SettingKey.RelayLogKeepPeriod);
            if (enabledSetting) {
                const isEnabled = enabledSetting.value === 'true';
                setLogKeepEnabled(isEnabled);
                initialLogKeepEnabled.current = isEnabled;
            }
            if (periodSetting) {
                setLogKeepPeriod(periodSetting.value);
                initialLogKeepPeriod.current = periodSetting.value;
            }
        }
    }, [settings]);

    const handleLogKeepEnabledChange = (checked: boolean) => {
        setLogKeepEnabled(checked);
        setSetting.mutate(
            { key: SettingKey.RelayLogKeepEnabled, value: checked ? 'true' : 'false' },
            {
                onSuccess: () => {
                    toast.success(t('saved'));
                    initialLogKeepEnabled.current = checked;
                }
            }
        );
    };

    const handleLogKeepPeriodSave = () => {
        if (logKeepPeriod === initialLogKeepPeriod.current) return;

        setSetting.mutate(
            { key: SettingKey.RelayLogKeepPeriod, value: logKeepPeriod },
            {
                onSuccess: () => {
                    toast.success(t('saved'));
                    initialLogKeepPeriod.current = logKeepPeriod;
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

    // --- DB Backup logic ---
    const exportDB = useExportDB();
    const importDB = useImportDB();
    const [includeLogs, setIncludeLogs] = useState(false);
    const [includeStats, setIncludeStats] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const rowsAffected = importDB.data?.rows_affected ?? null;
    const rowsAffectedList = useMemo(() => {
        if (!rowsAffected) return [];
        return Object.entries(rowsAffected)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => ({ table: k, count: v }));
    }, [rowsAffected]);

    const onImport = async () => {
        if (!file) {
            toast.error(t('backup.import.noFile'));
            return;
        }
        try {
            await importDB.mutateAsync(file);
            toast.success(t('backup.import.success'));
            if (fileInputRef.current) fileInputRef.current.value = '';
            setFile(null);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : t('backup.import.failed'));
        }
    };

    const onExport = async () => {
        try {
            await exportDB.mutateAsync({ include_logs: includeLogs, include_stats: includeStats });
            toast.success(t('backup.export.success'));
        } catch (e) {
            toast.error(e instanceof Error ? e.message : t('backup.export.failed'));
        }
    };

    // --- System Info logic ---
    const latestInfoQuery = useLatestInfo();
    const buildInfoQuery = useBuildInfo();
    const updateCore = useUpdateCore();

    const backendVersion = buildInfoQuery.data?.version || '';
    const backendCommit = buildInfoQuery.data?.commit || '';
    const backendBuildTime = buildInfoQuery.data?.build_time || '';
    const latestVersion = latestInfoQuery.data?.tag_name || '';

    const formatBuildLabel = (version: string, commit: string) => {
        const v = version.trim() || 'unknown';
        const c = commit.trim() || 'unknown';
        if (c.toLowerCase() !== 'unknown') {
            return `${v} (${c.slice(0, 8)})`;
        }
        return v;
    };

    const frontendBuildLabel = formatBuildLabel(APP_VERSION, APP_COMMIT);
    const backendBuildLabel = formatBuildLabel(backendVersion, backendCommit);

    const isComparableVersion = (version: string) => {
        const val = version.trim().toLowerCase();
        return val !== 'dev' && val !== 'unknown';
    };

    const isComparableCommit = (commit: string) => {
        return commit.trim().toLowerCase() !== 'unknown';
    };

    const hasVersionMismatch = isComparableVersion(backendVersion) && isComparableVersion(APP_VERSION) && backendVersion !== APP_VERSION;
    const hasCommitMismatch = isComparableCommit(backendCommit) && isComparableCommit(APP_COMMIT) && backendCommit !== APP_COMMIT;
    const isCacheMismatch = hasVersionMismatch || hasCommitMismatch;
    const hasNewVersion = isComparableVersion(backendVersion) && latestVersion && latestVersion !== backendVersion;

    const clearCacheAndReload = async () => {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({ type: SW_MESSAGE_TYPE.CLEAR_CACHE });
        }
        if ('caches' in window) {
            const names = await caches.keys();
            await Promise.all(
                names
                    .filter((name) => isOctopusCacheName(name) && !isFontCacheName(name))
                    .map((name) => caches.delete(name))
            );
        }
        if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            await Promise.all(registrations.map((reg) => reg.unregister()));
        }
        window.location.reload();
    };

    const handleUpdate = () => {
        updateCore.mutate(undefined, {
            onSuccess: () => {
                toast.success(t('info.updateSuccess'));
                setTimeout(() => clearCacheAndReload(), 1500);
            },
            onError: () => {
                toast.error(t('info.updateFailed'));
            }
        });
    };

    return (
        <div className="space-y-6">
            {/* 历史日志保存 */}
            <div className="space-y-2">
                <div className="flex items-center gap-2 px-1 pb-1">
                    <ScrollText className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold text-foreground/80">{t('log.title')}</h3>
                </div>
                
                <div className="flex flex-col divide-y divide-border/40 rounded-2xl bg-card border border-border px-4 shadow-2xs">
                    <div className="flex items-center justify-between gap-4 py-3">
                        <div className="flex items-center gap-3">
                            <ScrollText className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="text-sm font-medium text-foreground/90">{t('log.enabled.label')}</span>
                        </div>
                        <Switch checked={logKeepEnabled} onCheckedChange={handleLogKeepEnabledChange} />
                    </div>

                    <div className="flex items-center justify-between gap-4 py-3">
                        <div className="flex items-center gap-3">
                            <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="text-sm font-medium text-foreground/90">{t('log.keepPeriod.label')}</span>
                        </div>
                        <Input
                            type="number"
                            value={logKeepPeriod}
                            onChange={(e) => setLogKeepPeriod(e.target.value)}
                            onBlur={handleLogKeepPeriodSave}
                            placeholder="天数"
                            className="w-64 rounded-xl bg-background"
                            disabled={!logKeepEnabled}
                        />
                    </div>
                </div>

                <div className="flex flex-col rounded-2xl bg-destructive/5 border border-destructive/20 p-4">
                    <div className="flex items-center justify-between gap-4 flex-wrap sm:flex-nowrap">
                        <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-2">
                                <Trash2 className="h-4 w-4 text-destructive shrink-0" />
                                <span className="text-sm font-semibold text-destructive">{t('log.clear.label')}</span>
                            </div>
                            <span className="text-[10px] text-muted-foreground pl-6">执行后不可撤销，彻底清理所有网关请求历史数据。</span>
                        </div>
                        <Button
                            variant="destructive"
                            size="sm"
                            onClick={handleClearLogs}
                            disabled={isClearing}
                            className="rounded-xl shadow-none font-medium shrink-0 ml-auto sm:ml-0"
                        >
                            {isClearing ? t('log.clear.clearing') : t('log.clear.button')}
                        </Button>
                    </div>
                </div>
            </div>

            {/* 备份与恢复 */}
            <div className="space-y-2">
                <div className="flex items-center gap-2 px-1 pb-1">
                    <Database className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold text-foreground/80">{t('backup.title')}</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 divide-y md:divide-y-0 md:divide-x divide-border/40 rounded-2xl bg-card border border-border p-4 shadow-2xs">
                    <div className="flex flex-col gap-3 md:pr-4">
                        <div className="text-xs font-semibold text-foreground/90">{t('backup.export.title')}</div>
                        <div className="flex items-center justify-between gap-4 py-1">
                            <span className="text-xs text-muted-foreground">{t('backup.export.includeLogs')}</span>
                            <Switch checked={includeLogs} onCheckedChange={setIncludeLogs} />
                        </div>
                        <div className="flex items-center justify-between gap-4 py-1">
                            <span className="text-xs text-muted-foreground">{t('backup.export.includeStats')}</span>
                            <Switch checked={includeStats} onCheckedChange={setIncludeStats} />
                        </div>
                        <Button
                            type="button"
                            variant="outline"
                            className="w-full rounded-xl shadow-none hover:text-primary transition-colors mt-auto"
                            onClick={onExport}
                            disabled={exportDB.isPending}
                        >
                            <Download className="size-4 mr-1.5" />
                            {exportDB.isPending ? t('backup.export.exporting') : t('backup.export.button')}
                        </Button>
                    </div>

                    <div className="flex flex-col gap-3 pt-4 md:pt-0 md:pl-4">
                        <div className="text-xs font-semibold text-foreground/90">{t('backup.import.title')}</div>
                        <Input
                            ref={fileInputRef}
                            type="file"
                            accept="application/json,.json"
                            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                            className="rounded-xl bg-background text-xs"
                        />
                        <Button
                            type="button"
                            variant="destructive"
                            className="w-full rounded-xl bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground border border-destructive/20 shadow-none transition-colors"
                            onClick={onImport}
                            disabled={importDB.isPending}
                        >
                            <Upload className="size-4 mr-1.5" />
                            {importDB.isPending ? t('backup.import.importing') : t('backup.import.button')}
                        </Button>
                        {rowsAffectedList.length > 0 && (
                            <div className="mt-2 space-y-1 rounded-xl bg-background border border-border p-3">
                                <div className="text-[10px] font-semibold text-foreground/90">{t('backup.import.result')}</div>
                                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px] text-muted-foreground mt-2">
                                    {rowsAffectedList.map((it) => (
                                        <div key={it.table} className="flex justify-between gap-2">
                                            <span className="truncate">{it.table}</span>
                                            <span className="tabular-nums font-semibold text-foreground/80">{it.count}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* 版本信息 */}
            <div className="space-y-2">
                <div className="flex items-center gap-2 px-1 pb-1">
                    <Info className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold text-foreground/80">{t('info.title')}</h3>
                </div>

                <div className="flex flex-col divide-y divide-border/40 rounded-2xl bg-card border border-border px-4 shadow-2xs">
                    <div className="flex items-center justify-between gap-4 py-3">
                        <div className="flex items-center gap-3">
                            <Github className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="text-sm font-medium text-foreground/90">{t('info.github')}</span>
                        </div>
                        <a
                            href={GITHUB_REPO}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline"
                        >
                            {GITHUB_REPO.replace('https://github.com/', '')}
                        </a>
                    </div>

                    <div className="flex items-center justify-between gap-4 py-3">
                        <div className="flex items-center gap-3">
                            <Tag className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="text-sm font-medium text-foreground/90">{t('info.frontendBuild')}</span>
                        </div>
                        <code className="text-[11px] font-mono text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded-md">
                            {frontendBuildLabel}
                        </code>
                    </div>

                    <div className="flex items-center justify-between gap-4 py-3">
                        <div className="flex items-center gap-3">
                            <Tag className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="text-sm font-medium text-foreground/90">{t('info.backendBuild')}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            {buildInfoQuery.isLoading ? (
                                <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                            ) : (
                                <code className="text-[11px] font-mono text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded-md">
                                    {backendBuildLabel}
                                </code>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center justify-between gap-4 py-3">
                        <div className="flex items-center gap-3">
                            <Info className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="text-sm font-medium text-foreground/90">{t('info.frontendBuildTime')}</span>
                        </div>
                        <code className="text-[11px] font-mono text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded-md">
                            {APP_BUILD_TIME}
                        </code>
                    </div>

                    <div className="flex items-center justify-between gap-4 py-3">
                        <div className="flex items-center gap-3">
                            <Info className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="text-sm font-medium text-foreground/90">{t('info.backendBuildTime')}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            {buildInfoQuery.isLoading ? (
                                <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                            ) : (
                                <code className="text-[11px] font-mono text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded-md">
                                    {backendBuildTime}
                                </code>
                            )}
                        </div>
                    </div>
                </div>

                {isCacheMismatch && (
                    <div className="p-3 bg-destructive/5 border border-destructive/20 rounded-2xl space-y-3">
                        <div className="flex items-start gap-3">
                            <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                            <div className="flex-1 space-y-0.5">
                                <p className="text-xs text-destructive font-semibold">
                                    {t('info.versionMismatch')}
                                </p>
                                <p className="text-[10px] text-destructive/80 leading-normal">
                                    {t('info.versionMismatchHint', { frontend: frontendBuildLabel, backend: backendBuildLabel })}
                                </p>
                            </div>
                        </div>
                        <div className="flex justify-end">
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={clearCacheAndReload}
                                className="rounded-xl bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground border border-destructive/20 shadow-none font-medium"
                            >
                                {t('info.forceRefresh')}
                            </Button>
                        </div>
                    </div>
                )}

                {hasNewVersion && (
                    <div className="p-3 bg-primary/5 border border-primary/20 rounded-2xl space-y-3">
                        <div className="flex items-start gap-3">
                            <Download className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                            <div className="flex-1 space-y-0.5">
                                <p className="text-xs text-primary font-semibold">
                                    {t('info.newVersionAvailable')}
                                </p>
                                <p className="text-[10px] text-primary/80 leading-normal">
                                    {t('info.newVersionAvailableHint')}
                                </p>
                            </div>
                        </div>
                        <div className="flex justify-end">
                            <Button
                                variant="default"
                                size="sm"
                                onClick={handleUpdate}
                                disabled={updateCore.isPending}
                                className="rounded-xl shadow-none font-medium"
                            >
                                {updateCore.isPending ? t('info.updating') : t('info.updateNow')}
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            {/* Fusion capabilities 可见性 (folded inside accordion) */}
            <SettingFusion />
        </div>
    );
}
export { SettingMaintenance as SettingLogsMaintenance };
