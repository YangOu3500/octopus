'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Trash2, X, Info, Pencil } from 'lucide-react';
import { type APIKey } from '@/api/endpoints/apikey';
import { CopyButton } from '@/components/shared/copy-button';

interface APIKeyKeyItemProps {
    apiKey: APIKey;
    onViewStats: () => void;
    onEdit: () => void;
    onDelete: () => void;
    isDeleting: boolean;
}

export function APIKeyKeyItem({
    apiKey,
    onViewStats,
    onEdit,
    onDelete,
    isDeleting,
}: APIKeyKeyItemProps) {
    const t = useTranslations('setting');
    const [confirmDelete, setConfirmDelete] = useState(false);

    return (
        <div className="group relative flex items-center justify-between gap-3 p-3 rounded-xl bg-muted/30 border border-border/10 overflow-hidden min-h-[46px]">
            <span className="text-xs font-semibold truncate text-foreground/90 max-w-[200px]" title={apiKey.name}>
                {apiKey.name}
            </span>

            <div className="flex items-center gap-1.5 shrink-0">
                <button
                    type="button"
                    onClick={onViewStats}
                    className="flex size-7 items-center justify-center rounded-md bg-muted/60 text-muted-foreground transition-all hover:bg-muted hover:text-foreground active:scale-95 border border-border/10"
                    title="Stats"
                >
                    <Info className="size-3.5" />
                </button>
                <button
                    type="button"
                    onClick={onEdit}
                    className="flex size-7 items-center justify-center rounded-md bg-muted/60 text-muted-foreground transition-all hover:bg-muted hover:text-foreground active:scale-95 border border-border/10"
                    title="Edit"
                >
                    <Pencil className="size-3.5" />
                </button>
                
                <CopyButton
                    value={apiKey.api_key}
                    className="bg-primary/10 text-primary transition-all hover:bg-primary hover:text-primary-foreground border border-primary/15"
                />

                {!confirmDelete && (
                    <button
                        type="button"
                        onClick={() => setConfirmDelete(true)}
                        className="flex size-7 items-center justify-center rounded-md bg-destructive/10 text-destructive transition-colors hover:bg-destructive hover:text-destructive-foreground border border-destructive/15"
                        title="Delete"
                    >
                        <Trash2 className="size-3.5" />
                    </button>
                )}
            </div>

            {confirmDelete && (
                <div className="absolute inset-0 flex items-center justify-center gap-2 bg-destructive/95 p-2 rounded-xl transition-all duration-150">
                    <button
                        type="button"
                        onClick={() => setConfirmDelete(false)}
                        className="flex size-7 items-center justify-center rounded-md bg-destructive-foreground/20 text-destructive-foreground transition-all hover:bg-destructive-foreground/30 active:scale-95 border border-white/10"
                    >
                        <X className="size-3.5" />
                    </button>
                    <button
                        type="button"
                        onClick={onDelete}
                        disabled={isDeleting}
                        className="flex-1 h-7 flex items-center justify-center gap-1 rounded-md bg-background text-destructive text-xs font-semibold transition-all hover:bg-background/90 active:scale-[0.98] disabled:opacity-50"
                    >
                        <Trash2 className="size-3" />
                        {isDeleting ? '...' : t('apiKey.form.confirm')}
                    </button>
                </div>
            )}
        </div>
    );
}
