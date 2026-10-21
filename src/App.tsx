import {
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
  Settings,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import {
  loadUpdates,
  markItemsRead,
  subscribeToInserts,
  triggerFetch,
  usingSupabase,
} from './lib/api'
import { categoryIcon } from './lib/categories'
import { formatPublishedDate, formatRelativeTime } from './lib/dates'
import type {
  FetchLog,
  FilterValue,
  JwUpdate,
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
          item.url.includes('/altri-argomenti/'),
      )
    case 'magazines':
      return items.filter((item) => item.url.includes('/riviste/'))
    case 'music':
      return items.filter(
        (item) =>
          item.url.includes('/musica/') ||
          item.category?.toUpperCase().includes('CANZON'),
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
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const [permission, setPermission] = useState<
    NotificationPermission | 'unsupported'
  >(notificationsSupported ? Notification.permission : 'unsupported')
  const [unreadCount, setUnreadCount] = useState(0)

  const showToast = useCallback((text: string, type: ToastMessage['type']) => {
    setToast({ text, type })
    window.setTimeout(() => setToast(null), 3500)
  }, [])

  const refreshLists = useCallback(async () => {
    const data = await loadUpdates()
    setUpdates(data.updates)
    setLastFetch(data.lastFetch)
    setUnreadCount(data.updates.filter((item) => !item.read).length)
  }, [])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const result = await triggerFetch()
      await refreshLists()
      if (!result.success) {
        showToast(`Errore: ${result.error}`, 'error')
      } else if (result.newCount > 0) {
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
  }, [refreshLists, showToast])

  const markOneRead = useCallback(async (id: string) => {
    await markItemsRead([id])
    setUpdates((prev) =>
      prev.map((item) => (item.id === id ? { ...item, read: true } : item)),
    )
    setUnreadCount((count) => Math.max(0, count - 1))
  }, [])

  const markAllRead = useCallback(async () => {
    const ids = updates.filter((item) => !item.read).map((item) => item.id)
    if (!ids.length) return
    await markItemsRead(ids)
    setUpdates((prev) => prev.map((item) => ({ ...item, read: true })))
    setUnreadCount(0)
    showToast('Tutte le novità segnate come lette', 'success')
  }, [updates, showToast])

  const enableNotifications = useCallback(async () => {
    if (!notificationsSupported) {
      showToast(
        'Le notifiche del browser non sono disponibili in questo ambiente, ma le novità appariranno comunque in questa dashboard.',
        'info',
      )
      return
    }
    const next = await Notification.requestPermission()
    setPermission(next)
    if (next === 'granted') {
      showToast(
        'Notifiche attivate! Riceverai un avviso per ogni nuova novità.',
        'success',
      )
      new Notification('Notifiche attivate', {
        body: 'Riceverai una notifica per ogni nuova novità su jw.org.',
      })
    } else {
      showToast(
        'Notifiche non attivate. Puoi abilitarle dalle impostazioni del browser.',
        'info',
      )
    }
  }, [showToast])

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      try {
        await refreshLists()
        const result = await triggerFetch()
        if (result.success) await refreshLists()
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
  }, [refreshLists, showToast])

  const filtered = filterUpdates(updates, filter)

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <header className="sticky top-0 z-40 border-b border-stone-200 bg-white/90 backdrop-blur-lg">
        <div className="mx-auto max-w-4xl px-4 py-4 sm:px-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-stone-800 to-stone-600 shadow-sm">
                  <Bell className="h-5 w-5 text-amber-200" />
                </div>
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
                <p className="text-xs text-stone-500">Novità da jw.org</p>
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

      <main className="mx-auto max-w-4xl px-4 py-6 pb-20 sm:px-6">
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
                    ? 'Le notifiche del browser non sono disponibili in questo ambiente, ma tutte le novità appariranno automaticamente in questa dashboard con un badge di avviso.'
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

        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {FILTERS.map((item) => {
              const Icon = item.icon
              const active = filter === item.value
              return (
                <button
                  key={item.value}
                  type="button"
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
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-16 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-stone-100">
              <Check className="h-8 w-8 text-stone-400" />
            </div>
            <h3 className="font-semibold text-stone-700">Tutto aggiornato</h3>
            <p className="mt-1 max-w-xs text-sm text-stone-500">
              {filter === 'unread'
                ? "Non ci sono novità non lette. Premi l'icona di aggiornamento per controllare ora."
                : 'Nessuna novità in questa categoria.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((item) => {
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
            I dati vengono controllati automaticamente ogni 15 minuti dal sito
            pubblico jw.org.
            <br />
            Premi l&apos;icona di aggiornamento per un controllo manuale.
            {!usingSupabase && (
              <>
                <br />
                Modalità locale (API Vite) — configura Supabase per la
                produzione.
              </>
            )}
          </p>
        </footer>
      </main>

      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
              <h2 className="text-lg font-bold text-stone-900">Impostazioni</h2>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-stone-100"
                aria-label="Chiudi"
              >
                <X className="h-5 w-5 text-stone-500" />
              </button>
            </div>

            <div className="space-y-5 px-5 py-5">
              <div className="rounded-xl border border-stone-200 p-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                      permission === 'granted' ? 'bg-amber-100' : 'bg-stone-100'
                    }`}
                  >
                    {permission === 'granted' ? (
                      <Bell className="h-5 w-5 text-amber-600" />
                    ) : (
                      <Bell className="h-5 w-5 text-stone-500" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-stone-900">
                      Notifiche browser
                    </h3>
                    <p className="text-xs text-stone-500">
                      {permission === 'granted'
                        ? 'Attive — riceverai notifiche per ogni nuova novità'
                        : permission === 'denied'
                          ? 'Bloccate — abilita le notifiche dalle impostazioni del browser'
                          : permission === 'unsupported'
                            ? 'Non disponibili in questo ambiente — le novità appariranno nella dashboard'
                            : 'Non ancora attivate'}
                    </p>
                  </div>
                </div>
                {permission !== 'granted' &&
                  permission !== 'denied' &&
                  permission !== 'unsupported' && (
                    <button
                      type="button"
                      onClick={() => void enableNotifications()}
                      className="mt-2 w-full rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600"
                    >
                      Attiva notifiche
                    </button>
                  )}
                {permission === 'denied' && (
                  <p className="mt-2 flex items-start gap-2 text-xs text-stone-500">
                    <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    Vai nelle impostazioni del browser, cerca le autorizzazioni
                    per questo sito e abilita le notifiche.
                  </p>
                )}
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold text-stone-900">
                  Informazioni
                </h3>
                <ul className="space-y-2 text-sm text-stone-600">
                  <li className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-stone-400" />
                    Con le notifiche attive, riceverai un avviso nel browser per
                    ogni novità
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-stone-400" />
                    Le novità provengono dalla sezione pubblica di jw.org
                  </li>
                </ul>
              </div>

              <a
                href="https://www.jw.org/it/cosa-nuovo/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-stone-200 px-4 py-2.5 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50"
              >
                <Settings className="h-4 w-4" />
                Apri jw.org/cosa-nuovo
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="animate-in fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
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
