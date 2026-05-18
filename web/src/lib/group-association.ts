import type {
    GroupAutoGenerateAssociationMode,
    GroupAutoGenerateAssociationOptions,
    GroupAutoGenerateManualAlias,
} from '@/api/endpoints/group';
import { SettingKey, type Setting } from '@/api/endpoints/setting';

export type ManualAliasDraft = { id: string; alias: string; target: string };
export type AssociationOptionKey = keyof GroupAutoGenerateAssociationOptions;
export type SavedAssociationState = {
    associationMode: GroupAutoGenerateAssociationMode;
    associationOptions: GroupAutoGenerateAssociationOptions;
    manualAliases: GroupAutoGenerateManualAlias[];
};

export const ASSOCIATION_OPTION_KEYS = [
    'strip_provider_prefix',
    'strip_models_namespace',
    'normalize_case',
    'normalize_separators',
] as const satisfies readonly AssociationOptionKey[];

export function defaultAssociationOptions(mode: GroupAutoGenerateAssociationMode): GroupAutoGenerateAssociationOptions {
    if (mode === 'alias') {
        return {
            strip_provider_prefix: true,
            strip_models_namespace: true,
            normalize_case: true,
            normalize_separators: true,
        };
    }

    return {
        strip_provider_prefix: false,
        strip_models_namespace: false,
        normalize_case: true,
        normalize_separators: false,
    };
}

export function createManualAliasDraft(): ManualAliasDraft {
    return {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        alias: '',
        target: '',
    };
}

export function createManualAliasDraftFromValue(item: GroupAutoGenerateManualAlias): ManualAliasDraft {
    return {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        alias: item.alias,
        target: item.target,
    };
}

export function sanitizeManualAliases(items: Array<Pick<ManualAliasDraft, 'alias' | 'target'>>): GroupAutoGenerateManualAlias[] {
    return items
        .map((item) => ({
            alias: item.alias.trim(),
            target: item.target.trim(),
        }))
        .filter((item) => item.alias && item.target);
}

export function parseAssociationMode(value: string | undefined): GroupAutoGenerateAssociationMode {
    return value === 'alias' ? 'alias' : 'exact';
}

export function parseAssociationOptions(
    value: string | undefined,
    mode: GroupAutoGenerateAssociationMode,
): GroupAutoGenerateAssociationOptions {
    const defaults = defaultAssociationOptions(mode);
    if (!value?.trim()) return defaults;

    try {
        const parsed = JSON.parse(value) as GroupAutoGenerateAssociationOptions;
        const next = { ...defaults };
        ASSOCIATION_OPTION_KEYS.forEach((key) => {
            if (typeof parsed[key] === 'boolean') next[key] = parsed[key];
        });
        return next;
    } catch {
        return defaults;
    }
}

export function parseManualAliases(value: string | undefined): GroupAutoGenerateManualAlias[] {
    if (!value?.trim()) return [];

    try {
        const parsed = JSON.parse(value) as GroupAutoGenerateManualAlias[];
        if (!Array.isArray(parsed)) return [];

        return parsed
            .map((item) => ({
                alias: typeof item?.alias === 'string' ? item.alias.trim() : '',
                target: typeof item?.target === 'string' ? item.target.trim() : '',
            }))
            .filter((item) => item.alias && item.target);
    } catch {
        return [];
    }
}

export function parseSavedAssociationState(settings: Setting[]): SavedAssociationState {
    const associationMode = parseAssociationMode(
        settings.find((item) => item.key === SettingKey.GroupAutoGenerateAssociationMode)?.value,
    );

    return {
        associationMode,
        associationOptions: parseAssociationOptions(
            settings.find((item) => item.key === SettingKey.GroupAutoGenerateAssociationOptions)?.value,
            associationMode,
        ),
        manualAliases: parseManualAliases(
            settings.find((item) => item.key === SettingKey.GroupAutoGenerateManualAliases)?.value,
        ),
    };
}

export function associationOptionsEqual(
    left: GroupAutoGenerateAssociationOptions,
    right: GroupAutoGenerateAssociationOptions,
): boolean {
    return ASSOCIATION_OPTION_KEYS.every((key) => Boolean(left[key]) === Boolean(right[key]));
}

export function manualAliasesEqual(
    left: GroupAutoGenerateManualAlias[],
    right: GroupAutoGenerateManualAlias[],
): boolean {
    if (left.length !== right.length) return false;
    return left.every((item, index) => item.alias === right[index]?.alias && item.target === right[index]?.target);
}
