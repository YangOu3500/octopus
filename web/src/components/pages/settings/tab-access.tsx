'use client';

import { useCallback, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { KeyRound, Plus, Loader } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
    useAPIKeyList,
    useCreateAPIKey,
    useUpdateAPIKey,
    useDeleteAPIKey,
    type APIKey,
} from '@/api/endpoints/apikey';
import { toast } from 'sonner';
import { APIKeyKeyItem } from './tab-access-list';
import { APIKeyForm } from './tab-access-form';
import { APIKeyStatsCard } from './tab-access-stats';
import type { ApiError } from '@/api/types';

export function SettingAccessKeys() {
    const t = useTranslations('setting');
    const { data: apiKeys, isLoading: apiKeysLoading, error: apiKeysError } = useAPIKeyList();
    const createAPIKey = useCreateAPIKey();
    const updateAPIKey = useUpdateAPIKey();
    const deleteAPIKey = useDeleteAPIKey();

    const [isAdding, setIsAdding] = useState(false);
    const [viewingStats, setViewingStats] = useState<APIKey | null>(null);
    const [editingKey, setEditingKey] = useState<APIKey | null>(null);
    const [deletingId, setDeletingId] = useState<number | null>(null);

    const sortedApiKeys = useMemo(() => {
        if (!apiKeys) return [];
        return [...apiKeys].sort((a, b) => a.id - b.id);
    }, [apiKeys]);

    const handleDelete = useCallback((id: number) => {
        setDeletingId(id);
        deleteAPIKey.mutate(id, {
            onSuccess: () => {
                toast.success(t('apiKey.toast.deleteSuccess'));
            },
            onError: (error) => {
                const msg = (error as unknown as ApiError)?.message;
                toast.error(t('apiKey.toast.deleteError'), { description: msg });
            },
            onSettled: () => setDeletingId(null),
        });
    }, [deleteAPIKey, t]);

    const handleCreate = useCallback((data: Omit<APIKey, 'id' | 'api_key'>) => {
        createAPIKey.mutate(data, {
            onSuccess: () => {
                toast.success(t('apiKey.toast.createSuccess'));
                setIsAdding(false);
            },
            onError: (error) => {
                const msg = (error as unknown as ApiError)?.message;
                toast.error(t('apiKey.toast.createError'), { description: msg });
            },
        });
    }, [createAPIKey, t]);

    const handleUpdate = useCallback((apiKey: APIKey, data: Omit<APIKey, 'id' | 'api_key'>) => {
        updateAPIKey.mutate({ id: apiKey.id, ...data }, {
            onSuccess: () => {
                toast.success(t('apiKey.toast.updateSuccess'));
                setEditingKey(null);
            },
            onError: (error) => {
                const msg = (error as unknown as ApiError)?.message;
                toast.error(t('apiKey.toast.updateError'), { description: msg });
            },
        });
    }, [t, updateAPIKey]);

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 px-1 pb-1">
                <h2 className="text-sm font-semibold text-foreground/80 flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-primary" />
                    {t('apiKey.title')}
                </h2>
                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setIsAdding(true)}
                    className="h-8 w-8 rounded-lg shrink-0"
                    title={t('apiKey.add')}
                >
                    <Plus className="size-4" />
                </Button>
            </div>

            <div className="flex flex-col gap-2 rounded-2xl bg-card border border-border p-4 shadow-2xs">
                {apiKeysLoading ? (
                    <div className="flex items-center justify-center text-xs text-muted-foreground min-h-[120px]">
                        <Loader className="size-4 animate-spin" />
                    </div>
                ) : apiKeysError ? (
                    <div className="flex items-center justify-center text-xs text-destructive min-h-[120px]">
                        {t('apiKey.loadFailed')}
                    </div>
                ) : sortedApiKeys.length === 0 ? (
                    <div className="flex items-center justify-center text-xs text-muted-foreground min-h-[120px]">
                        {t('apiKey.empty')}
                    </div>
                ) : (
                    <div className="grid gap-2 max-h-[360px] overflow-y-auto pr-1">
                        {sortedApiKeys.map((apiKey) => (
                            <APIKeyKeyItem
                                key={apiKey.id}
                                apiKey={apiKey}
                                onViewStats={() => setViewingStats(apiKey)}
                                onEdit={() => setEditingKey(apiKey)}
                                onDelete={() => handleDelete(apiKey.id)}
                                isDeleting={deleteAPIKey.isPending && deletingId === apiKey.id}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Create API Key Dialog */}
            <Dialog open={isAdding} onOpenChange={setIsAdding}>
                <DialogContent className="sm:max-w-md rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-sm font-semibold">{t('apiKey.add')}</DialogTitle>
                    </DialogHeader>
                    <APIKeyForm
                        isPending={createAPIKey.isPending}
                        submitLabel={t('apiKey.form.create')}
                        onSubmit={handleCreate}
                        onClose={() => setIsAdding(false)}
                    />
                </DialogContent>
            </Dialog>

            {/* Edit API Key Dialog */}
            <Dialog open={!!editingKey} onOpenChange={(open) => !open && setEditingKey(null)}>
                <DialogContent className="sm:max-w-md rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-sm font-semibold">{t('apiKey.form.save')}</DialogTitle>
                    </DialogHeader>
                    {editingKey && (
                        <APIKeyForm
                            apiKey={editingKey}
                            isPending={updateAPIKey.isPending}
                            submitLabel={t('apiKey.form.save')}
                            onSubmit={(data) => handleUpdate(editingKey, data)}
                            onClose={() => setEditingKey(null)}
                        />
                    )}
                </DialogContent>
            </Dialog>

            {/* Stats Dialog */}
            {viewingStats && (
                <APIKeyStatsCard
                    apiKey={viewingStats}
                    open={!!viewingStats}
                    onOpenChange={(open) => !open && setViewingStats(null)}
                />
            )}
        </div>
    );
}
export { SettingAccessKeys as SettingAPIKey };
