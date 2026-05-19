'use client';

import { useTranslations } from 'next-intl';
import { Info, Tag, Github, AlertTriangle, Download, Loader2 } from 'lucide-react';
import { APP_BUILD_TIME, APP_COMMIT, APP_VERSION, GITHUB_REPO } from '@/lib/info';
import { useBuildInfo, useLatestInfo, useUpdateCore } from '@/api/endpoints/update';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/common/Toast';
import { isOctopusCacheName, isFontCacheName, SW_MESSAGE_TYPE } from '@/lib/sw';

function normalizeBuildValue(value?: string) {
    return value?.trim() || 'unknown';
}

function isComparableVersion(version: string) {
    const value = normalizeBuildValue(version).toLowerCase();
    return value !== 'dev' && value !== 'unknown';
}

function isComparableCommit(commit: string) {
    return normalizeBuildValue(commit).toLowerCase() !== 'unknown';
}

function shortCommit(commit: string) {
    const value = normalizeBuildValue(commit);
    return isComparableCommit(value) ? value.slice(0, 8) : value;
}

function formatBuildLabel(version: string, commit: string) {
    const normalizedVersion = normalizeBuildValue(version);
    const normalizedCommit = normalizeBuildValue(commit);

    if (isComparableCommit(normalizedCommit)) {
        return `${normalizedVersion} (${shortCommit(normalizedCommit)})`;
    }

    return normalizedVersion;
}

export function SettingInfo() {
    const t = useTranslations('setting');
    const latestInfoQuery = useLatestInfo();
    const buildInfoQuery = useBuildInfo();
    const updateCore = useUpdateCore();

    const backendVersion = buildInfoQuery.data?.version || '';
    const backendCommit = buildInfoQuery.data?.commit || '';
    const backendBuildTime = buildInfoQuery.data?.build_time || '';
    const latestVersion = latestInfoQuery.data?.tag_name || '';
    const frontendBuildLabel = formatBuildLabel(APP_VERSION, APP_COMMIT);
    const backendBuildLabel = formatBuildLabel(backendVersion, backendCommit);

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

    const handleForceRefresh = () => {
        clearCacheAndReload();
    };

    const handleUpdate = () => {
        updateCore.mutate(undefined, {
            onSuccess: () => {
                toast.success(t('info.updateSuccess'));
                setTimeout(() => {
                    clearCacheAndReload();
                }, 1500);
            },
            onError: () => {
                toast.error(t('info.updateFailed'));
            }
        });
    };

    return (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4 shadow-sm">
            <h2 className="text-lg font-bold text-card-foreground flex items-center gap-2">
                <Info className="h-5 w-5" />
                {t('info.title')}
            </h2>

            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <Github className="h-5 w-5 text-muted-foreground" />
                    <span className="text-sm font-medium">{t('info.github')}</span>
                </div>
                <a
                    href={GITHUB_REPO}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline"
                >
                    {GITHUB_REPO.replace('https://github.com/', '')}
                </a>
            </div>

            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <Tag className="h-5 w-5 text-muted-foreground" />
                    <span className="text-sm font-medium">{t('info.frontendBuild')}</span>
                </div>
                <code className="text-sm font-mono text-muted-foreground">
                    {frontendBuildLabel}
                </code>
            </div>

            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <Tag className="h-5 w-5 text-muted-foreground" />
                    <span className="text-sm font-medium">{t('info.backendBuild')}</span>
                </div>
                <div className="flex items-center gap-2">
                    {buildInfoQuery.isLoading ? (
                        <Loader2 className="size-4 animate-spin text-muted-foreground" />
                    ) : (
                        <code className="text-sm font-mono text-muted-foreground">
                            {backendBuildLabel}
                        </code>
                    )}
                </div>
            </div>

            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <Info className="h-5 w-5 text-muted-foreground" />
                    <span className="text-sm font-medium">{t('info.frontendBuildTime')}</span>
                </div>
                <code className="text-sm font-mono text-muted-foreground">
                    {normalizeBuildValue(APP_BUILD_TIME)}
                </code>
            </div>

            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <Info className="h-5 w-5 text-muted-foreground" />
                    <span className="text-sm font-medium">{t('info.backendBuildTime')}</span>
                </div>
                <div className="flex items-center gap-2">
                    {buildInfoQuery.isLoading ? (
                        <Loader2 className="size-4 animate-spin text-muted-foreground" />
                    ) : (
                        <code className="text-sm font-mono text-muted-foreground">
                            {normalizeBuildValue(backendBuildTime)}
                        </code>
                    )}
                </div>
            </div>

            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <Download className="h-5 w-5 text-muted-foreground" />
                    <span className="text-sm font-medium">{t('info.latestVersion')}</span>
                </div>
                <div className="flex items-center gap-2">
                    {latestInfoQuery.isLoading ? (
                        <Loader2 className="size-4 animate-spin text-muted-foreground" />
                    ) : (
                        <code className="text-sm font-mono text-muted-foreground">
                            {latestVersion || t('info.unknown')}
                        </code>
                    )}
                </div>
            </div>

            {isCacheMismatch && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-xl space-y-2">
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                        <div className="flex-1 space-y-1">
                            <p className="text-sm text-destructive font-medium">
                                {t('info.versionMismatch')}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                {t('info.versionMismatchHint', { frontend: frontendBuildLabel, backend: backendBuildLabel })}
                            </p>
                        </div>
                    </div>
                    <div className="flex justify-end">
                        <Button
                            variant="destructive"
                            size="sm"
                            onClick={handleForceRefresh}
                            className="rounded-xl"
                        >
                            {t('info.forceRefresh')}
                        </Button>
                    </div>
                </div>
            )}

            {hasNewVersion && (
                <div className="p-3 bg-primary/10 border border-primary/20 rounded-xl space-y-2">
                    <div className="flex items-start gap-3">
                        <Download className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                        <div className="flex-1 space-y-1">
                            <p className="text-sm text-primary font-medium">
                                {t('info.newVersionAvailable')}
                            </p>
                            <p className="text-xs text-muted-foreground">
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
                            className="rounded-xl"
                        >
                            {updateCore.isPending ? t('info.updating') : t('info.updateNow')}
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
