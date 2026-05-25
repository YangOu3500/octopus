'use client';

import { useState } from "react"
import { useTranslations } from 'next-intl'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { useLogin } from "@/api/endpoints/user"
import { useAPIKeyLogin } from "@/api/endpoints/apikey"
import { KeyRound, User } from "lucide-react"

type LoginMode = 'user' | 'apikey';

export function LoginForm({ onLoginSuccess }: { onLoginSuccess?: () => void }) {
  const t = useTranslations('login')
  const [mode, setMode] = useState<LoginMode>('user')
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [error, setError] = useState<string | null>(null)

  const loginMutation = useLogin()
  const apiKeyLoginMutation = useAPIKeyLogin()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    try {
      if (mode === 'user') {
        await loginMutation.mutateAsync({
          username,
          password,
          expire: 86400,
        })
      } else {
        await apiKeyLoginMutation.mutateAsync(apiKey)
      }

      onLoginSuccess?.()
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : t('error.generic')
      setError(errorMessage)
    }
  }

  const isPending = loginMutation.isPending || apiKeyLoginMutation.isPending

  const handleModeChange = (value: string) => {
    setMode(value as LoginMode)
    setError(null)
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-background text-foreground transition-colors duration-150">
      <div className="w-full max-w-sm space-y-6">
        <header className="flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground font-black text-xl tracking-wider">
            OCT
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Octopus</h1>
          <p className="text-xs text-muted-foreground">{t('description')}</p>
        </header>

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <Tabs value={mode} onValueChange={handleModeChange} className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-muted p-1 rounded-lg mb-6">
              <TabsTrigger
                value="user"
                className="flex items-center justify-center gap-2 py-1.5 rounded-md text-sm font-medium transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-xs"
              >
                <User className="w-4 h-4" />
                {t('mode.user')}
              </TabsTrigger>
              <TabsTrigger
                value="apikey"
                className="flex items-center justify-center gap-2 py-1.5 rounded-md text-sm font-medium transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-xs"
              >
                <KeyRound className="w-4 h-4" />
                {t('mode.apikey')}
              </TabsTrigger>
            </TabsList>

            <form onSubmit={handleSubmit} className="space-y-4">
              <TabsContent value="user" className="space-y-4 outline-none">
                <div className="space-y-2">
                  <Label htmlFor="username">{t('username')}</Label>
                  <Input
                    id="username"
                    type="text"
                    placeholder={t('usernamePlaceholder')}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required={mode === 'user'}
                    disabled={isPending}
                    className="h-9"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">{t('password')}</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder={t('passwordPlaceholder')}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required={mode === 'user'}
                    disabled={isPending}
                    className="h-9"
                  />
                </div>
              </TabsContent>

              <TabsContent value="apikey" className="space-y-4 outline-none">
                <div className="space-y-2">
                  <Label htmlFor="apikey">{t('apikey')}</Label>
                  <Input
                    id="apikey"
                    type="password"
                    placeholder={t('apikeyPlaceholder')}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    required={mode === 'apikey'}
                    disabled={isPending}
                    className="h-9"
                  />
                </div>
              </TabsContent>

              {error && (
                <p className="text-xs font-medium text-destructive mt-1">{error}</p>
              )}

              <Button type="submit" disabled={isPending} className="w-full h-9 mt-2 font-medium">
                {isPending ? t('button.loading') : t('button.submit')}
              </Button>
            </form>
          </Tabs>
        </div>
      </div>
    </div>
  )
}
