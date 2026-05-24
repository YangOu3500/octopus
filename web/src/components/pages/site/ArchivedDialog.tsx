'use client';

import { ArchiveRestore, CircleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog';
import { useArchivedSiteList } from '@/api/endpoints/site';

interface ArchivedDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onRestore: (siteId: number, name: string) => Promise<void>;
    isRestoring: boolean;
}

export function ArchivedDialog({
    open,
    onOpenChange,
    onRestore,
    isRestoring
}: ArchivedDialogProps) {
    const { data: archivedSites, isLoading, error } = useArchivedSiteList(open);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl rounded-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <ArchiveRestore className="size-5" />
                        归档站点
                    </DialogTitle>
                    <DialogDescription>
                        归档的站点仍保留账号、Key 和模型配置，托管渠道会被下线。点击恢复会还原到主列表（默认保持禁用状态，启用后会自动重建托管渠道）。
                    </DialogDescription>
                </DialogHeader>

                <div className="max-h-[50vh] overflow-y-auto py-2">
                    {isLoading ? (
                        <div className="py-10 text-center text-xs text-muted-foreground animate-pulse">
                            正在加载归档站点...
                        </div>
                    ) : error ? (
                        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-xs text-destructive flex items-center gap-2">
                            <CircleAlert className="size-4 shrink-0" />
                            <span>加载失败: {error.message}</span>
                        </div>
                    ) : !archivedSites || archivedSites.length === 0 ? (
                        <div className="py-10 text-center text-xs text-muted-foreground italic">
                            当前没有归档的站点。
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {archivedSites.map((site) => (
                                <div
                                    key={site.id}
                                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 bg-card/60"
                                >
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2 text-xs">
                                            <span className="font-semibold text-sm truncate">
                                                {site.name}
                                            </span>
                                            <Badge variant="outline" className="text-[10px] h-5">
                                                {site.platform}
                                            </Badge>
                                            <span className="truncate text-muted-foreground max-w-[200px]" title={site.base_url}>
                                                {site.base_url}
                                            </span>
                                        </div>
                                        <div className="mt-1 text-[10px] text-muted-foreground">
                                            归档于 {site.archived_at ? new Date(site.archived_at).toLocaleString() : '-'}
                                            {' · '}
                                            {site.accounts?.length || 0} 个账号已保留
                                        </div>
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="rounded-lg h-8 text-xs shrink-0"
                                        onClick={() => onRestore(site.id, site.name)}
                                        disabled={isRestoring}
                                    >
                                        <ArchiveRestore className="size-3.5 mr-1" />
                                        恢复
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <DialogFooter className="mt-2">
                    <Button
                        variant="outline"
                        className="rounded-lg text-xs"
                        onClick={() => onOpenChange(false)}
                    >
                        关闭
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
