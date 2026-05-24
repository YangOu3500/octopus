'use client';

import { useRef, useState, useCallback, type DragEvent } from 'react';
import { FileJson, X, Upload, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type ImportSource = 'all-api-hub' | 'metapi';

type SiteImportResult = {
    created_sites: number;
    reused_sites: number;
    created_accounts: number;
    updated_accounts: number;
    skipped_accounts: number;
    scheduled_sync_accounts?: number;
    warnings: string[];
    imported_tokens?: number;
    imported_groups?: number;
    imported_models?: number;
    disabled_models?: number;
};

interface ImportDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onImport: (payload: { file: File | null; text: string }, source: ImportSource) => Promise<SiteImportResult>;
    isImporting: boolean;
}

function SiteMetric({ label, value }: { label: string; value: number | string }) {
    return (
        <div className="rounded-xl border p-3 bg-muted/20">
            <div className="text-[10px] text-muted-foreground">{label}</div>
            <div className="mt-0.5 text-base font-semibold">{value}</div>
        </div>
    );
}

export function ImportDialog({
    open,
    onOpenChange,
    onImport,
    isImporting
}: ImportDialogProps) {
    const [importSource, setImportSource] = useState<ImportSource>('all-api-hub');
    const [importPayloadText, setImportPayloadText] = useState('');
    const [importFile, setImportFile] = useState<File | null>(null);
    const [isImportDragging, setIsImportDragging] = useState(false);
    const [lastImportResult, setLastImportResult] = useState<SiteImportResult | null>(null);

    const importFileInputRef = useRef<HTMLInputElement | null>(null);
    const importDragDepthRef = useRef(0);

    const handleClose = useCallback(() => {
        onOpenChange(false);
        setLastImportResult(null);
        setImportFile(null);
        setImportPayloadText('');
    }, [onOpenChange]);

    const setSelectedImportFile = useCallback((file: File | null) => {
        setImportFile(file);
        setLastImportResult(null);
        setIsImportDragging(false);
        importDragDepthRef.current = 0;
        if (!file && importFileInputRef.current) {
            importFileInputRef.current.value = '';
        }
    }, []);

    const isImportFileDrag = useCallback((event: DragEvent<HTMLDivElement>) => {
        return Array.from(event.dataTransfer.types).includes('Files');
    }, []);

    const handleImportDragEnter = useCallback((event: DragEvent<HTMLDivElement>) => {
        if (!isImportFileDrag(event)) return;
        event.preventDefault();
        importDragDepthRef.current += 1;
        setIsImportDragging(true);
    }, [isImportFileDrag]);

    const handleImportDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
        if (!isImportFileDrag(event)) return;
        event.preventDefault();
        importDragDepthRef.current = Math.max(0, importDragDepthRef.current - 1);
        if (importDragDepthRef.current === 0) {
            setIsImportDragging(false);
        }
    }, [isImportFileDrag]);

    const handleImportDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
        if (!isImportFileDrag(event)) return;
        event.preventDefault();
    }, [isImportFileDrag]);

    const handleImportDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
        if (!isImportFileDrag(event)) return;
        event.preventDefault();
        setSelectedImportFile(event.dataTransfer.files?.[0] ?? null);
    }, [isImportFileDrag, setSelectedImportFile]);

    const handleImportSites = async () => {
        const hasFile = !!importFile;
        const hasText = !!importPayloadText.trim();
        if (!hasFile && !hasText) {
            toast.error('请选择 JSON 文件或粘贴导出内容');
            return;
        }

        try {
            const result = await onImport({
                file: importFile,
                text: importPayloadText,
            }, importSource);

            setLastImportResult(result);
            setImportFile(null);
            setImportPayloadText('');
            toast.success(`导入完成: 新增 ${result.created_sites} 站点, 新增 ${result.created_accounts} 账号`);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : '导入失败');
        }
    };

    return (
        <Dialog open={open} onOpenChange={(val) => { if (!val) handleClose(); else onOpenChange(true); }}>
            <DialogContent className="max-w-3xl rounded-2xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FileJson className="size-5" />
                        导入站点数据
                    </DialogTitle>
                    <DialogDescription>
                        支持上传或粘贴 All API Hub / Metapi 导出的 JSON。导入会按平台和站点地址自动创建或复用站点。
                    </DialogDescription>
                </DialogHeader>

                <div
                    className="space-y-4 py-1"
                    onDragEnter={handleImportDragEnter}
                    onDragLeave={handleImportDragLeave}
                    onDragOver={handleImportDragOver}
                    onDrop={handleImportDrop}
                >
                    <div className="grid gap-1 text-xs">
                        <span className="font-medium text-muted-foreground">导入来源</span>
                        <Select
                            value={importSource}
                            onValueChange={(val) => {
                                setImportSource(val as ImportSource);
                                setLastImportResult(null);
                            }}
                        >
                            <SelectTrigger className="rounded-lg h-9 text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all-api-hub" className="text-xs">All API Hub</SelectItem>
                                <SelectItem value="metapi" className="text-xs">Metapi</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="grid gap-1.5 text-xs">
                        <div className="font-medium text-muted-foreground">上传 JSON 文件</div>
                        <div className="flex items-center gap-2">
                            <Input
                                ref={importFileInputRef}
                                type="file"
                                accept=".json,application/json"
                                onChange={(e) => {
                                    setSelectedImportFile(e.target.files?.[0] ?? null);
                                }}
                                className="hidden"
                            />
                            <button
                                type="button"
                                onClick={() => importFileInputRef.current?.click()}
                                className={cn(
                                    'flex min-w-0 flex-1 items-center justify-center rounded-lg border border-dashed px-3 text-center text-xs transition-all hover:bg-muted/40 cursor-pointer',
                                    isImportDragging
                                        ? 'min-h-24 border-primary bg-primary/10 text-primary'
                                        : 'min-h-10 border-border bg-muted/20',
                                )}
                            >
                                <span
                                    className={cn(
                                        'min-w-0 truncate',
                                        importFile ? 'text-foreground' : 'text-muted-foreground',
                                    )}
                                >
                                    {isImportDragging
                                        ? '松开以选择 JSON 文件'
                                        : importFile?.name ?? '点击选择或拖拽 JSON 文件到这里'}
                                </span>
                            </button>
                            <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className={cn('h-10 w-10 rounded-lg', !importFile && 'opacity-50')}
                                onClick={() => setSelectedImportFile(null)}
                                disabled={!importFile}
                            >
                                <X className="size-4" />
                            </Button>
                        </div>
                    </div>

                    <div className="grid gap-1.5 text-xs">
                        <span className="font-medium text-muted-foreground">或粘贴导出 JSON</span>
                        <textarea
                            value={importPayloadText}
                            onChange={(e) => {
                                setImportPayloadText(e.target.value);
                                setLastImportResult(null);
                            }}
                            placeholder={
                                importSource === 'metapi'
                                    ? '粘贴类似 {"version":"2.1","accounts":{"sites":[...],"accounts":[...]}} 的完整导出内容'
                                    : '粘贴类似 {"accounts":{"accounts":[...]}} 的完整导出内容'
                            }
                            className="min-h-36 w-full rounded-lg border bg-background px-3 py-2 font-mono text-[11px] outline-none transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20"
                        />
                        <span className="text-[10px] text-muted-foreground">
                            {importSource === 'metapi'
                                ? 'Metapi 导入只迁移站点、账号、Key、分组和模型；路由策略与下游 Key 会跳过。'
                                : '导入会保留已存在站点的本地配置；同一分组下的多个 key 后续仍会聚合到同一个托管 channel。'}
                        </span>
                    </div>

                    {lastImportResult && (
                        <div className="space-y-3 rounded-lg border p-4 bg-muted/10">
                            <div className="grid gap-2 grid-cols-2 md:grid-cols-3">
                                <SiteMetric label="新增站点" value={lastImportResult.created_sites} />
                                <SiteMetric label="复用站点" value={lastImportResult.reused_sites} />
                                <SiteMetric label="新增账号" value={lastImportResult.created_accounts} />
                                <SiteMetric label="更新账号" value={lastImportResult.updated_accounts} />
                                <SiteMetric label="跳过账号" value={lastImportResult.skipped_accounts} />
                                {typeof lastImportResult.scheduled_sync_accounts === 'number' && (
                                    <SiteMetric label="后台同步" value={lastImportResult.scheduled_sync_accounts} />
                                )}
                                {typeof lastImportResult.imported_tokens === 'number' && (
                                    <>
                                        <SiteMetric label="导入 Key" value={lastImportResult.imported_tokens} />
                                        <SiteMetric label="导入分组" value={lastImportResult.imported_groups ?? 0} />
                                        <SiteMetric label="导入模型" value={lastImportResult.imported_models ?? 0} />
                                    </>
                                )}
                            </div>

                            {lastImportResult.warnings && lastImportResult.warnings.length > 0 && (
                                <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                                    <div className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
                                        <AlertTriangle className="size-4" />
                                        <span>导入告警</span>
                                    </div>
                                    <div className="mt-2 space-y-1 max-h-[100px] overflow-y-auto">
                                        {lastImportResult.warnings.map((w, i) => (
                                            <div key={i} className="text-[11px] text-destructive/80 font-mono break-all leading-tight">
                                                {w}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <DialogFooter className="mt-2">
                    <Button
                        variant="outline"
                        className="rounded-lg text-xs"
                        onClick={handleClose}
                    >
                        关闭
                    </Button>
                    <Button
                        onClick={handleImportSites}
                        disabled={isImporting}
                        className="rounded-lg text-xs"
                    >
                        <Upload className="size-3.5 mr-1" />
                        {isImporting ? '导入中...' : '开始导入'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
