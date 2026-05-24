'use client';

export function APIKeyDashboard() {
    return (
        <div className="flex min-h-screen flex-col items-center justify-center p-6 text-foreground">
            <div className="max-w-md w-full text-center space-y-4">
                <h1 className="text-3xl font-bold tracking-tight">API Key Dashboard</h1>
                <p className="text-muted-foreground">You are authenticated via API Key. The custom dashboard will be implemented in a later phase.</p>
                <div className="pt-4">
                    <button 
                        onClick={() => window.location.reload()}
                        className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
                    >
                        Refresh Page
                    </button>
                </div>
            </div>
        </div>
    );
}
