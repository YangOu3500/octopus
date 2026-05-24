'use client';

export function Model() {
    return (
        <div className="flex flex-col gap-4 p-6">
            <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold tracking-tight">Model Pricing</h1>
                <p className="text-sm text-muted-foreground">List and configure pricing models.</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-6 text-card-foreground shadow-xs">
                <p className="text-sm text-muted-foreground">Model pricing will be implemented in Phase 4.</p>
            </div>
        </div>
    );
}
