'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

export type ModelFormState = {
    name: string;
    input: string;
    output: string;
    cache_read: string;
    cache_write: string;
};

interface ModelFormProps {
    initialValues?: Partial<ModelFormState>;
    onSubmit: (values: ModelFormState) => void;
    isPending: boolean;
    isEdit: boolean;
    onCancel: () => void;
}

export function ModelForm({
    initialValues,
    onSubmit,
    isPending,
    isEdit,
    onCancel,
}: ModelFormProps) {
    const t = useTranslations('model.create');
    const [formData, setFormData] = useState<ModelFormState>({
        name: initialValues?.name ?? '',
        input: initialValues?.input ?? '',
        output: initialValues?.output ?? '',
        cache_read: initialValues?.cache_read ?? '',
        cache_write: initialValues?.cache_write ?? '',
    });

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!formData.name.trim()) return;
        onSubmit(formData);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            <div className="space-y-1">
                <Label htmlFor="model-name">{t('name')}</Label>
                <Input
                    id="model-name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="h-8 rounded-lg text-xs"
                    disabled={isEdit}
                />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                    <Label htmlFor="model-input">{t('input')}</Label>
                    <Input
                        id="model-input"
                        type="number"
                        step="any"
                        value={formData.input}
                        onChange={(e) => setFormData({ ...formData, input: e.target.value })}
                        className="h-8 rounded-lg text-xs"
                    />
                </div>
                <div className="space-y-1">
                    <Label htmlFor="model-output">{t('output')}</Label>
                    <Input
                        id="model-output"
                        type="number"
                        step="any"
                        value={formData.output}
                        onChange={(e) => setFormData({ ...formData, output: e.target.value })}
                        className="h-8 rounded-lg text-xs"
                    />
                </div>
                <div className="space-y-1">
                    <Label htmlFor="model-cache-read">{t('cacheRead')}</Label>
                    <Input
                        id="model-cache-read"
                        type="number"
                        step="any"
                        value={formData.cache_read}
                        onChange={(e) => setFormData({ ...formData, cache_read: e.target.value })}
                        className="h-8 rounded-lg text-xs"
                    />
                </div>
                <div className="space-y-1">
                    <Label htmlFor="model-cache-write">{t('cacheWrite')}</Label>
                    <Input
                        id="model-cache-write"
                        type="number"
                        step="any"
                        value={formData.cache_write}
                        onChange={(e) => setFormData({ ...formData, cache_write: e.target.value })}
                        className="h-8 rounded-lg text-xs"
                    />
                </div>
            </div>
            <div className="pt-4 flex gap-2 border-t">
                <Button type="button" variant="outline" className="flex-1 rounded-xl h-9 text-xs" onClick={onCancel}>
                    取消
                </Button>
                <Button
                    type="submit"
                    disabled={isPending || !formData.name.trim()}
                    className="flex-1 rounded-xl h-9 text-xs"
                >
                    {isPending ? t('submitting') : t('submit')}
                </Button>
            </div>
        </form>
    );
}
