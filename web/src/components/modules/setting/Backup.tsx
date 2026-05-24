'use client';

import { useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Database, Download, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/common/Toast';
import { useExportDB, useImportDB } from '@/api/endpoints/setting';

export function SettingBackup() {
    const t = useTranslations('setting');

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

    const onPickFile = (f: File | null) => {
        setFile(f);
    };

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

    return (
        <div className="space-y-1">
            <div className="flex items-center gap-2 px-1 pb-2">
                <Database className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground/80">{t('backup.title')}</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 divide-y md:divide-y-0 md:divide-x divide-border/40 rounded-2xl bg-background/30 border border-border/40 p-4">
                {/* 导出 */}
                <div className="flex flex-col gap-3 md:pr-4">
                    <div className="text-sm font-medium text-foreground/90">{t('backup.export.title')}</div>

                    <div className="flex items-center justify-between gap-4">
                        <div className="text-sm text-muted-foreground">{t('backup.export.includeLogs')}</div>
                        <Switch checked={includeLogs} onCheckedChange={setIncludeLogs} />
                    </div>

                    <div className="flex items-center justify-between gap-4">
                        <div className="text-sm text-muted-foreground">{t('backup.export.includeStats')}</div>
                        <Switch checked={includeStats} onCheckedChange={setIncludeStats} />
                    </div>

                    <Button
                        type="button"
                        variant="outline"
                        className="w-full rounded-xl shadow-none bg-background/50 hover:bg-background/80 hover:text-primary transition-colors border-border/60 mt-1"
                        onClick={onExport}
                        disabled={exportDB.isPending}
                    >
                        <Download className="size-4 mr-1.5" />
                        {exportDB.isPending ? t('backup.export.exporting') : t('backup.export.button')}
                    </Button>
                </div>

                {/* 导入 */}
                <div className="flex flex-col gap-3 pt-4 md:pt-0 md:pl-4">
                    <div className="text-sm font-medium text-foreground/90">{t('backup.import.title')}</div>

                    <Input
                        ref={fileInputRef}
                        type="file"
                        accept="application/json,.json"
                        onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
                        className="rounded-xl bg-background/50"
                    />

                    <Button
                        type="button"
                        variant="destructive"
                        className="w-full rounded-xl mt-1 bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground border border-destructive/20 shadow-none transition-colors"
                        onClick={onImport}
                        disabled={importDB.isPending}
                    >
                        <Upload className="size-4 mr-1.5" />
                        {importDB.isPending ? t('backup.import.importing') : t('backup.import.button')}
                    </Button>

                    {rowsAffectedList.length > 0 && (
                        <div className="mt-2 space-y-1 rounded-xl bg-background/50 border border-border/40 p-3">
                            <div className="text-xs font-semibold text-foreground/90">{t('backup.import.result')}</div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-muted-foreground mt-2">
                                {rowsAffectedList.map((it) => (
                                    <div key={it.table} className="flex justify-between gap-2">
                                        <span className="truncate">{it.table}</span>
                                        <span className="tabular-nums font-medium text-foreground/80">{it.count}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

