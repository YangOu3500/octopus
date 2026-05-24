'use client';

export function ModelHealth() {
    return (
        <div className="flex flex-col gap-4 p-6">
            <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold tracking-tight">Model Health</h1>
                <p className="text-sm text-muted-foreground">Monitor provider health scores and response rates.</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-6 text-card-foreground shadow-xs">
                <p className="text-sm text-muted-foreground">Model health dashboard will be implemented in Phase 5.</p>
            </div>
        </div>
    );
}
