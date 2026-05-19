'use client';

import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Pencil, Trash2, ArrowDownToLine, ArrowUpFromLine, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useUpdateModel, useDeleteModel, type LLMInfo } from '@/api/endpoints/model';
import { getModelIcon } from '@/lib/model-icons';
import { toast } from '@/components/common/Toast';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/animate-ui/components/animate/tooltip';
import { ModelDeleteOverlay, ModelEditOverlay } from './ItemOverlays';
import { cn } from '@/lib/utils';
import { createPortal } from 'react-dom';
import { Badge } from '@/components/ui/badge';

interface ModelItemProps {
    model: LLMInfo;
    layout?: 'grid' | 'list';
}

function sourceTone(source: LLMInfo['resolved_source']) {
    switch (source) {
        case 'upstream':
            return 'border-primary/20 bg-primary/10 text-primary';
        case 'official':
            return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
        case 'manual':
            return 'border-border bg-background text-muted-foreground';
        case 'manual_required':
        default:
            return 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300';
    }
}

const SOURCE_FLOW: Array<Exclude<LLMInfo['resolved_source'], 'manual_required'> | 'manual'> = ['upstream', 'official', 'manual'];

export const ModelItem = memo(function ModelItem({ model, layout = 'grid' }: ModelItemProps) {
    const t = useTranslations('model');
    const isListLayout = layout === 'list';
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [overlayRect, setOverlayRect] = useState<{ top: number; left: number; width: number } | null>(null);
    const instanceId = useId();
    const editLayoutId = `edit-btn-${model.name}-${instanceId}`;
    const deleteLayoutId = `delete-btn-${model.name}-${instanceId}`;
    const cardRef = useRef<HTMLElement | null>(null);
    const editButtonRef = useRef<HTMLButtonElement | null>(null);
    const editOverlayRef = useRef<HTMLDivElement | null>(null);
    const [editValues, setEditValues] = useState(() => ({
        input: model.input.toString(),
        output: model.output.toString(),
        cache_read: model.cache_read.toString(),
        cache_write: model.cache_write.toString(),
    }));

    const updateModel = useUpdateModel();
    const deleteModel = useDeleteModel();

    const { Avatar: ModelAvatar, color: brandColor } = useMemo(() => getModelIcon(model.name), [model.name]);
    const resolvedSource = model.resolved_source ?? (model.manual_configured ? 'manual' : 'manual_required');
    const sourceDetail = useMemo(() => {
        switch (resolvedSource) {
            case 'upstream':
                return t('sourceMeta.upstream', {
                    accounts: model.upstream_site_accounts ?? 0,
                    groups: model.upstream_groups ?? 0,
                });
            case 'official':
                return model.resolved_updated_at
                    ? t('sourceMeta.officialWithTime', { time: new Date(model.resolved_updated_at).toLocaleString() })
                    : t('sourceMeta.official');
            case 'manual':
                return t('sourceMeta.manual');
            case 'manual_required':
            default:
                return t('sourceMeta.manualRequired');
        }
    }, [model.resolved_updated_at, model.upstream_groups, model.upstream_site_accounts, resolvedSource, t]);

    const updateOverlayRect = useCallback(() => {
        const card = cardRef.current;
        if (!card) return;
        const rect = card.getBoundingClientRect();
        setOverlayRect((prev) => {
            if (prev && prev.top === rect.top && prev.left === rect.left && prev.width === rect.width) {
                return prev;
            }
            return { top: rect.top, left: rect.left, width: rect.width };
        });
    }, []);

    const closeEdit = useCallback(() => {
        setIsEditOpen(false);
    }, []);

    const handleEditClick = () => {
        setConfirmDelete(false);
        setEditValues({
            input: model.input.toString(),
            output: model.output.toString(),
            cache_read: model.cache_read.toString(),
            cache_write: model.cache_write.toString(),
        });
        // Ensure first open already has anchor geometry so layout animation can run.
        updateOverlayRect();
        setIsEditOpen(true);
    };

    const handleCancelEdit = () => {
        closeEdit();
    };

    const handleSaveEdit = () => {
        updateModel.mutate({
            name: model.name,
            input: parseFloat(editValues.input) || 0,
            output: parseFloat(editValues.output) || 0,
            cache_read: parseFloat(editValues.cache_read) || 0,
            cache_write: parseFloat(editValues.cache_write) || 0,
        }, {
            onSuccess: () => {
                closeEdit();
                toast.success(t('toast.updated'));
            },
            onError: (error) => {
                toast.error(t('toast.updateFailed'), { description: error.message });
            }
        });
    };

    const handleDeleteClick = () => {
        closeEdit();
        setConfirmDelete(true);
    };
    const handleCancelDelete = () => setConfirmDelete(false);
    const handleConfirmDelete = () => {
        deleteModel.mutate(model.name, {
            onSuccess: () => {
                setConfirmDelete(false);
                toast.success(t('toast.deleted'));
            },
            onError: (error) => {
                setConfirmDelete(false);
                toast.error(t('toast.deleteFailed'), { description: error.message });
            }
        });
    };

    useEffect(() => {
        if (!isEditOpen) return;

        const handlePointerDown = (event: PointerEvent) => {
            const target = event.target as Node | null;
            if (!target) return;
            if (editOverlayRef.current?.contains(target)) return;
            if (editButtonRef.current?.contains(target)) return;
            closeEdit();
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') closeEdit();
        };

        updateOverlayRect();
        window.addEventListener('resize', updateOverlayRect);
        window.addEventListener('scroll', updateOverlayRect, true);
        document.addEventListener('pointerdown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('resize', updateOverlayRect);
            window.removeEventListener('scroll', updateOverlayRect, true);
            document.removeEventListener('pointerdown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isEditOpen, updateOverlayRect, closeEdit]);

    const shouldRenderEditPortal = isEditOpen || overlayRect !== null;

    return (
        <article
            ref={cardRef}
            className={cn(
                'group relative flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 transition-all duration-300',
                resolvedSource === 'manual_required' && 'border-amber-500/30 bg-amber-500/[0.04]',
                (isEditOpen || confirmDelete) && 'z-50'
            )}
        >
            <ModelAvatar size={52} />

            <div className="flex-1 min-w-0 flex flex-col justify-center gap-2">
                <div className="flex min-w-0 items-start justify-between gap-3">
                    <Tooltip side="top" sideOffset={10} align="start">
                        <TooltipTrigger className='min-w-0 text-left text-base font-semibold text-card-foreground leading-tight truncate'>
                            {model.name}
                        </TooltipTrigger>
                        <TooltipContent key={model.name}>
                            {model.name}
                        </TooltipContent>
                    </Tooltip>
                    <Badge variant="outline" className={cn('shrink-0 rounded-md px-2 text-[11px]', sourceTone(resolvedSource))}>
                        {t(`source.${resolvedSource}`)}
                    </Badge>
                </div>

                <p className={cn(
                    'text-xs',
                    resolvedSource === 'manual_required' ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground',
                )}>
                    {sourceDetail}
                </p>

                <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                    <span className="mr-1">{t('card.sourceFlow')}</span>
                    {SOURCE_FLOW.map((source, index) => {
                        const currentSource = resolvedSource === 'manual_required' ? 'manual' : resolvedSource;
                        const active = currentSource === source;
                        return (
                            <div key={source} className="inline-flex items-center gap-1">
                                <Badge
                                    variant="outline"
                                    className={cn(
                                        'rounded-md px-1.5 py-0 text-[10px]',
                                        active ? sourceTone(resolvedSource) : 'border-border/70 bg-background text-muted-foreground'
                                    )}
                                >
                                    {t(`source.${source}`)}
                                </Badge>
                                {index < SOURCE_FLOW.length - 1 ? <ChevronRight className="size-3 text-muted-foreground/60" /> : null}
                            </div>
                        );
                    })}
                </div>

                {isListLayout ? (
                    <p className="flex items-center gap-2 overflow-hidden text-sm text-muted-foreground whitespace-nowrap">
                        <span className="inline-flex items-center gap-1">
                            <ArrowDownToLine className="size-3.5 shrink-0" style={{ color: brandColor }} />
                            {t('card.inputCache')}
                            <span className="tabular-nums">{model.input.toFixed(2)}/{model.cache_read.toFixed(2)}$</span>
                        </span>
                        <span className="text-muted-foreground/60">|</span>
                        <span className="inline-flex items-center gap-1 overflow-hidden">
                            <ArrowUpFromLine className="size-3.5 shrink-0" style={{ color: brandColor }} />
                            {t('card.outputCache')}
                            <span className="tabular-nums truncate">{model.output.toFixed(2)}/{model.cache_write.toFixed(2)}$</span>
                        </span>
                    </p>
                ) : (
                    <>
                        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <ArrowDownToLine className="size-3.5" style={{ color: brandColor }} />
                            {t('card.inputCache')}
                            <span className="tabular-nums">{model.input.toFixed(2)}/{model.cache_read.toFixed(2)}$</span>
                        </p>

                        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <ArrowUpFromLine className="size-3.5" style={{ color: brandColor }} />
                            {t('card.outputCache')}
                            <span className="tabular-nums">{model.output.toFixed(2)}/{model.cache_write.toFixed(2)}$</span>
                        </p>
                    </>
                )}
            </div>

            <div
                className={cn(
                    isListLayout
                        ? 'shrink-0 flex items-center gap-2 self-center'
                        : 'shrink-0 flex flex-col justify-between self-stretch',
                    (isEditOpen || confirmDelete) && 'invisible pointer-events-none'
                )}
            >
                <motion.button
                    ref={editButtonRef}
                    layoutId={editLayoutId}
                    type="button"
                    onClick={handleEditClick}
                    disabled={isEditOpen || confirmDelete}
                    className="h-9 w-9 flex items-center justify-center rounded-lg bg-muted/60 text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
                    title={t('card.edit')}
                >
                    <Pencil className="size-4" />
                </motion.button>

                <motion.button
                    layoutId={deleteLayoutId}
                    type="button"
                    onClick={handleDeleteClick}
                    disabled={isEditOpen || confirmDelete}
                    className="h-9 w-9 flex items-center justify-center rounded-lg bg-destructive/10 text-destructive transition-colors hover:bg-destructive hover:text-destructive-foreground disabled:opacity-50"
                    title={t('card.delete')}
                >
                    <Trash2 className="size-4" />
                </motion.button>
            </div>

            <AnimatePresence>
                {confirmDelete && (
                    <ModelDeleteOverlay
                        layoutId={deleteLayoutId}
                        isPending={deleteModel.isPending}
                        onCancel={handleCancelDelete}
                        onConfirm={handleConfirmDelete}
                    />
                )}
            </AnimatePresence>

            {shouldRenderEditPortal && typeof document !== 'undefined'
                ? createPortal(
                    <AnimatePresence onExitComplete={() => setOverlayRect(null)}>
                        {isEditOpen && overlayRect && (
                            <div
                                ref={editOverlayRef}
                                className="fixed z-[90]"
                                style={{
                                    top: `${overlayRect.top}px`,
                                    left: `${overlayRect.left}px`,
                                    width: `${overlayRect.width}px`,
                                }}
                            >
                                <div className="relative">
                                    <ModelEditOverlay
                                        layoutId={editLayoutId}
                                        modelName={model.name}
                                        brandColor={brandColor}
                                        editValues={editValues}
                                        isPending={updateModel.isPending}
                                        onChange={setEditValues}
                                        onCancel={handleCancelEdit}
                                        onSave={handleSaveEdit}
                                    />
                                </div>
                            </div>
                        )}
                    </AnimatePresence>,
                    document.body
                )
                : null}
        </article>
    );
});
