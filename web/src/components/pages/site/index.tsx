'use client';

export function Site() {
    return (
        <div className="flex flex-col gap-4 p-6">
            <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold tracking-tight">Sites</h1>
                <p className="text-sm text-muted-foreground">Manage your API consumer sites.</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-6 text-card-foreground shadow-xs">
                <p className="text-sm text-muted-foreground">Site management will be implemented in Phase 3.</p>
            </div>
        </div>
    );
}
