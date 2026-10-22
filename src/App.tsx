import {
  ArrowUpDown,
  Bell,
  BookOpen,
  Calendar,
  Check,
  Clock,
  ExternalLink,
  Info,
  Loader2,
  Music,
  Newspaper,
  RefreshCw,
  Search,
  Settings,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { SettingsPanel } from './components/SettingsPanel'
import {
  loadUpdates,
  markItemsRead,
  subscribeToInserts,
  triggerFetch,
  usingSupabase,
} from './lib/api'
import { categoryIcon } from './lib/categories'
import { formatPublishedDate, formatRelativeTime } from './lib/dates'
import { listenForInstallPrompt } from './lib/install'
import {
  isCategoryEnabled,
  isInQuietHours,
  loadPreferences,
  savePreferences,
} from './lib/preferences'
import {
  pushConfigured,
  subscribeToPush,
  syncPushPreferences,
} from './lib/push'
import type {
  AppPreferences,
  FetchLog,
  FilterValue,
  JwUpdate,
  SortValue,
  ToastMessage,
} from './lib/types'

const FILTERS: {
  value: FilterValue
  label: string
  icon: typeof Bell
}[] = [
  { value: 'unread', label: 'Non lette', icon: Bell },
  { value: 'all', label: 'Tutte', icon: Newspaper },
  { value: 'news', label: 'Notizie', icon: Newspaper },
  { value: 'articles', label: 'Articoli', icon: BookOpen },
  { value: 'magazines', label: 'Riviste', icon: BookOpen },
  { value: 'music', label: 'Musica', icon: Music },
]

const notificationsSupported =
  typeof window !== 'undefined' && 'Notification' in window

function filterUpdates(items: JwUpdate[], filter: FilterValue): JwUpdate[] {
  switch (filter) {
    case 'unread':
      return items.filter((item) => !item.read)
    case 'news':
      return items.filter(
        (item) =>
          item.category?.toUpperCase().includes('NEWS') ||
          item.url.includes('/news/'),
      )
    case 'articles':
      return items.filter(
        (item) =>
          item.url.includes('/articoli/') ||
          item.url.includes('/altri-argomenti/') ||
          item.url.includes('/bible-teachings/'),
      )
    case 'magazines':
      return items.filter(
        (item) =>
          item.url.includes('/riviste/') || item.url.includes('/magazines/'),
      )
    case 'music':
      return items.filter(
        (item) =>
          item.url.includes('/musica/') ||
          item.url.includes('/music/') ||
          item.category?.toUpperCase().includes('CANZON') ||
          item.category?.toUpperCase().includes('SONG'),
      )
    default:
      return items
  }
}

export default function App() {
  const [updates, setUpdates] = useState<JwUpdate[]>([])
  const [lastFetch, setLastFetch] = useState<FetchLog | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter] = useState<FilterValue>('unread')
  const [sort, setSort] = useState<SortValue>('newest')
  const [query, setQuery] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const [prefs, setPrefs] = useState<AppPreferences>(() => loadPreferences())
  const [permission, setPermission] = useState<
    NotificationPermission | 'unsupported'
  >(notificationsSupported ? Notification.permission : 'unsupported')
  const [pushReady, setPushReady] = useState(false)
  const [offline, setOffline] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false,
  )

  const showToast = useCallback((text: string, type: ToastMessage['type']) => {
    setToast({ text, type })
    window.setTimeout(() => setToast(null), 3500)
  }, [])

  const unreadCount = useMemo(
    () => updates.filter((item) => !item.read).length,
    [updates],
  )

  const refreshLists = useCallback(async () => {
    const data = await loadUpdates()
    setUpdates(data.updates)
    setLastFetch(data.lastFetch)
  }, [])

  const handlePrefsChange = useCallback(
    (next: AppPreferences) => {
      const langChanged = next.language !== prefs.language
      setPrefs(next)
      savePreferences(next)
      void syncPushPreferences(next)
      if (langChanged) {
        void (async () => {
          setLoading(true)
          await triggerFetch()
          await refreshLists()
          setLoading(false)
          showToast('Lingua aggiornata', 'success')
        })()
      }
    },
    [prefs.language, refreshLists, showToast],
  )

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const result = await triggerFetch()
      await refreshLists()
      if (!result.success && result.error?.includes('Offline')) {
        showToast(result.error, 'info')
      } else if (!result.success) {
        showToast(`Errore: ${result.error}`, 'error')
      } else if (result.newCount > 0) {
        const fresh = (result.updates || []).filter((u) => !u.read)
        const notifiable = fresh.filter((u) =>
          isCategoryEnabled(prefs, u.url, u.category),
        )
        if (
          permission === 'granted' &&
          !isInQuietHours(prefs) &&
          prefs.frequency === 'instant' &&
          notifiable[0]
        ) {
          try {
            new Notification('Nuova novità su jw.org', {
              body: notifiable[0].title,
              icon: '/icon-192.png',
            })
          } catch {
            // ignore
          }
        }
        showToast(
          result.newCount === 1
            ? '1 nuova novità trovata'
            : `${result.newCount} nuove novità trovate`,
          'success',
        )
      } else {
        showToast('Nessuna nuova novità. Controllo completato.', 'info')
      }
    } catch (err) {
      showToast(
        `Errore: ${err instanceof Error ? err.message : 'sconosciuto'}`,
        'error',
      )
    } finally {
      setRefreshing(false)
    }
  }, [permission, prefs, refreshLists, showToast])

  const markOneRead = useCallback(async (id: string) => {
    await markItemsRead([id])
    setUpdates((prev) =>
      prev.map((item) => (item.id === id ? { ...item, read: true } : item)),
    )
  }, [])

  const markAllRead = useCallback(async () => {
    const ids = updates.filter((item) => !item.read).map((item) => item.id)
    if (!ids.length) return
    await markItemsRead(ids)
    setUpdates((prev) => prev.map((item) => ({ ...item, read: true })))
    showToast('Tutte le novità segnate come lette', 'success')
  }, [updates, showToast])

  const enableNotifications = useCallback(async () => {
    if (!notificationsSupported) {
      showToast(
        'Le notifiche del browser non sono disponibili in questo ambiente.',
        'info',
      )
      return
    }
    const next = await Notification.requestPermission()
    setPermission(next)
    if (next === 'granted') {
      if (pushConfigured()) {
        try {
          await subscribeToPush(prefs)
          setPushReady(true)
          showToast(
            'Web Push attivo: riceverai avvisi anche a scheda chiusa.',
            'success',
          )
        } catch {
          showToast(
            'Notifiche attivate (locale). Web Push non disponibile.',
            'info',
          )
        }
      } else {
        showToast(
          'Notifiche attivate! Riceverai un avviso per ogni nuova novità.',
          'success',
        )
      }
      new Notification('Notifiche attivate', {
        body: 'Riceverai una notifica per ogni nuova novità su jw.org.',
        icon: '/icon-192.png',
      })
    } else {
      showToast(
        'Notifiche non attivate. Puoi abilitarle dalle impostazioni del browser.',
        'info',
      )
    }
  }, [prefs, showToast])

  useEffect(() => {
    listenForInstallPrompt()
    const onOnline = () => setOffline(false)
    const onOffline = () => setOffline(true)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      try {
        await refreshLists()
        const result = await triggerFetch()
        if (result.success) await refreshLists()
        if (pushConfigured() && Notification.permission === 'granted') {
          try {
            await subscribeToPush(prefs)
            setPushReady(true)
          } catch {
            setPushReady(false)
          }
        }
      } catch (err) {
        showToast(
          `Errore: ${err instanceof Error ? err.message : 'sconosciuto'}`,
          'error',
        )
      } finally {
        setLoading(false)
      }
    })()

    const interval = window.setInterval(() => {
      void refreshLists()
    }, 60_000)

    const unsubscribe = subscribeToInserts(() => {
      void refreshLists()
    })

    return () => {
      window.clearInterval(interval)
      unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if ('setAppBadge' in navigator) {
      const badge = navigator as Navigator & {
        setAppBadge?: (n?: number) => Promise<void>
        clearAppBadge?: () => Promise<void>
      }
      if (unreadCount > 0) void badge.setAppBadge?.(unreadCount)
      else void badge.clearAppBadge?.()
    }
  }, [unreadCount])

  const visible = useMemo(() => {
    let list = filterUpdates(updates, filter)
    const q = query.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.category?.toLowerCase().includes(q) ||
          item.description?.toLowerCase().includes(q),
      )
    }
    list = [...list].sort((a, b) => {
      if (sort === 'title') return a.title.localeCompare(b.title, 'it')
      const da = `${a.published_date || ''}${a.first_seen_at}`
      const db = `${b.published_date || ''}${b.first_seen_at}`
      return sort === 'oldest' ? da.localeCompare(db) : db.localeCompare(da)
    })
    return list
  }, [updates, filter, query, sort])

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-amber-500 focus:px-3 focus:py-2 focus:text-white"
      >
        Vai al contenuto
      </a>

      <header className="sticky top-0 z-40 border-b border-stone-200 bg-white/90 backdrop-blur-lg">
        <div className="mx-auto max-w-4xl px-4 py-4 sm:px-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="relative">
                <img
                  src="/favicon.svg"
                  alt=""
                  className="h-11 w-11 rounded-xl shadow-sm"
                  width={44}
                  height={44}
                />
                {unreadCount > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </div>
              <div>
                <h1 className="text-lg font-bold leading-tight text-stone-900">
                  JW Hub Notifiche
                </h1>
                <p className="text-xs text-stone-500">
                  Novità da jw.org · {prefs.language.toUpperCase()}
                  {offline ? ' · Offline' : ''}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {permission !== 'granted' && permission !== 'unsupported' && (
                <button
                  type="button"
                  onClick={() => void enableNotifications()}
                  className="hidden items-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600 sm:flex"
                >
                  <Bell className="h-4 w-4" />
                  Attiva notifiche
                </button>
              )}
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="flex h-10 w-10 items-center justify-center rounded-lg transition-colors hover:bg-stone-100"
                aria-label="Impostazioni"
              >
                <Settings className="h-5 w-5 text-stone-600" />
              </button>
              <button
                type="button"
                onClick={() => void handleRefresh()}
                disabled={refreshing}
                className="flex h-10 w-10 items-center justify-center rounded-lg transition-colors hover:bg-stone-100 disabled:opacity-50"
                aria-label="Aggiorna"
              >
                {refreshing ? (
                  <Loader2 className="h-5 w-5 animate-spin text-stone-600" />
                ) : (
                  <RefreshCw className="h-5 w-5 text-stone-600" />
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      <main
        id="main-content"
        className="mx-auto max-w-4xl px-4 py-6 pb-20 sm:px-6"
      >
        {offline && (
          <div
            className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            role="status"
          >
            Sei offline. Mostro l’ultima cache disponibile.
          </div>
        )}

        {permission !== 'granted' && (
          <div className="mb-6 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-amber-500">
                <Bell className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1">
                <h2 className="text-sm font-semibold text-stone-900 sm:text-base">
                  {permission === 'unsupported'
                    ? 'Notifiche in-app attive'
                    : 'Attiva le notifiche del browser'}
                </h2>
                <p className="mt-1 text-sm text-stone-600">
                  {permission === 'unsupported'
                    ? 'Le notifiche del browser non sono disponibili in questo ambiente, ma tutte le novità appariranno automaticamente in questa dashboard.'
                    : 'Ricevi una notifica ogni volta che viene pubblicato un nuovo contenuto su jw.org.'}
                </p>
                {permission !== 'unsupported' && (
                  <button
                    type="button"
                    onClick={() => void enableNotifications()}
                    className="mt-3 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600"
                  >
                    Attiva ora
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="mb-6 grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-stone-200 bg-white p-3 sm:p-4">
            <div className="mb-1 flex items-center gap-1.5 text-xs text-stone-500">
              <Bell className="h-3.5 w-3.5" />
              Non lette
            </div>
            <p className="text-2xl font-bold text-stone-900">{unreadCount}</p>
          </div>
          <div className="rounded-xl border border-stone-200 bg-white p-3 sm:p-4">
            <div className="mb-1 flex items-center gap-1.5 text-xs text-stone-500">
              <Newspaper className="h-3.5 w-3.5" />
              Totale
            </div>
            <p className="text-2xl font-bold text-stone-900">{updates.length}</p>
          </div>
          <div className="rounded-xl border border-stone-200 bg-white p-3 sm:p-4">
            <div className="mb-1 flex items-center gap-1.5 text-xs text-stone-500">
              <Clock className="h-3.5 w-3.5" />
              Ultimo check
            </div>
            <p className="text-sm font-semibold text-stone-900 sm:text-base">
              {lastFetch
                ? formatRelativeTime(lastFetch.fetched_at)
                : loading
                  ? '…'
                  : '—'}
            </p>
          </div>
        </div>

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Cerca novità</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cerca titolo o categoria…"
              className="w-full rounded-xl border border-stone-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none ring-amber-400 focus:ring-2"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-stone-600">
            <ArrowUpDown className="h-4 w-4" />
            <span className="sr-only">Ordina</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortValue)}
              className="rounded-lg border border-stone-200 bg-white px-2 py-2 text-sm"
            >
              <option value="newest">Più recenti</option>
              <option value="oldest">Più vecchie</option>
              <option value="title">Titolo A–Z</option>
            </select>
          </label>
        </div>

        <div className="mb-4 flex items-center justify-between gap-3">
          <div
            className="flex gap-2 overflow-x-auto pb-1"
            role="tablist"
            aria-label="Filtri"
          >
            {FILTERS.map((item) => {
              const Icon = item.icon
              const active = filter === item.value
              return (
                <button
                  key={item.value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFilter(item.value)}
                  className={`flex flex-shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                    active
                      ? 'bg-stone-900 text-white'
                      : 'border border-stone-200 bg-white text-stone-600 hover:bg-stone-100'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </button>
              )
            })}
          </div>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => void markAllRead()}
              className="flex-shrink-0 text-sm font-medium text-amber-700 hover:text-amber-800"
            >
              Segna tutte lette
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-stone-500">
            <Loader2 className="mb-3 h-8 w-8 animate-spin" />
            <p className="text-sm">Caricamento novità...</p>
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-16 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-stone-100">
              <Check className="h-8 w-8 text-stone-400" />
            </div>
            <h3 className="font-semibold text-stone-700">Tutto aggiornato</h3>
            <p className="mt-1 max-w-xs text-sm text-stone-500">
              {query
                ? 'Nessun risultato per questa ricerca.'
                : filter === 'unread'
                  ? "Non ci sono novità non lette. Premi l'icona di aggiornamento per controllare ora."
                  : 'Nessuna novità in questa categoria.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {visible.map((item) => {
              const Icon = categoryIcon(item.category)
              return (
                <article
                  key={item.id}
                  className={`group rounded-2xl border transition-all hover:shadow-md ${
                    item.read
                      ? 'border-stone-200 bg-white'
                      : 'border-stone-200 border-l-4 border-l-amber-400 bg-white shadow-sm'
                  }`}
                >
                  <div className="flex gap-3 p-3 sm:gap-4 sm:p-4">
                    {item.image_url ? (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-shrink-0"
                      >
                        <img
                          src={item.image_url}
                          alt=""
                          className="h-16 w-16 rounded-xl bg-stone-100 object-cover sm:h-20 sm:w-20"
                          loading="lazy"
                        />
                      </a>
                    ) : (
                      <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-xl bg-stone-100 sm:h-20 sm:w-20">
                        <Icon className="h-7 w-7 text-stone-400" />
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-2">
                        {item.category && (
                          <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                            {item.category}
                          </span>
                        )}
                        {!item.read && (
                          <span className="h-2 w-2 flex-shrink-0 rounded-full bg-amber-400" />
                        )}
                      </div>
                      <h3 className="mb-1 text-sm font-semibold leading-snug text-stone-900 sm:text-base">
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => void markOneRead(item.id)}
                          className="transition-colors hover:text-amber-700"
                        >
                          {item.title}
                        </a>
                      </h3>
                      {item.description && (
                        <p className="mb-2 line-clamp-2 text-sm text-stone-600">
                          {item.description}
                        </p>
                      )}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-3 text-xs text-stone-400">
                          {item.published_date && (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {formatPublishedDate(item.published_date)}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatRelativeTime(item.first_seen_at)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          {!item.read && (
                            <button
                              type="button"
                              onClick={() => void markOneRead(item.id)}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600"
                              aria-label="Segna come letta"
                              title="Segna come letta"
                            >
                              <Check className="h-4 w-4" />
                            </button>
                          )}
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => void markOneRead(item.id)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600"
                            aria-label="Apri su jw.org"
                            title="Apri su jw.org"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}

        <footer className="mt-8 text-center">
          <p className="text-xs text-stone-400">
            Controllo automatico ogni 15 minuti (cron) + refresh manuale.
            <br />
            Preferenze, sync e stato letto restano su questo dispositivo
            {!usingSupabase ? ' (o sul codice sync)' : ' / Supabase'}.
          </p>
        </footer>
      </main>

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        prefs={prefs}
        onPrefsChange={handlePrefsChange}
        permission={permission}
        onEnableNotifications={() => void enableNotifications()}
        onToast={showToast}
        pushEnabled={pushReady}
      />

      {toast && (
        <div
          className="animate-in fixed bottom-6 left-1/2 z-50 -translate-x-1/2"
          role="status"
          aria-live="polite"
        >
          <div
            className={`flex items-center gap-3 rounded-xl px-4 py-3 shadow-lg ${
              toast.type === 'success'
                ? 'bg-green-600 text-white'
                : toast.type === 'error'
                  ? 'bg-red-600 text-white'
                  : 'bg-stone-800 text-white'
            }`}
          >
            {toast.type === 'success' ? (
              <Check className="h-4 w-4" />
            ) : toast.type === 'error' ? (
              <X className="h-4 w-4" />
            ) : (
              <Info className="h-4 w-4" />
            )}
            <span className="text-sm font-medium">{toast.text}</span>
          </div>
        </div>
      )}
    </div>
  )
}
