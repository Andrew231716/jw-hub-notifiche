import {
  Bell,
  Download,
  ExternalLink,
  Info,
  RefreshCw,
  Settings,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { canInstall, promptInstall } from '../lib/install'
import { LOCALES } from '../lib/locales'
import {
  CATEGORY_LABELS,
  generateSyncCode,
} from '../lib/preferences'
import { pullSyncState, pushSyncState } from '../lib/sync'
import type { AppPreferences, CategoryKey, NotifyFrequency } from '../lib/types'

type Props = {
  open: boolean
  onClose: () => void
  prefs: AppPreferences
  onPrefsChange: (prefs: AppPreferences) => void
  permission: NotificationPermission | 'unsupported'
  onEnableNotifications: () => void
  onToast: (text: string, type: 'success' | 'error' | 'info') => void
  pushEnabled: boolean
}

export function SettingsPanel({
  open,
  onClose,
  prefs,
  onPrefsChange,
  permission,
  onEnableNotifications,
  onToast,
  pushEnabled,
}: Props) {
  const [syncInput, setSyncInput] = useState(prefs.syncCode || '')
  const [busy, setBusy] = useState(false)
  const [installable, setInstallable] = useState(canInstall())

  useEffect(() => {
    setSyncInput(prefs.syncCode || '')
  }, [prefs.syncCode])

  useEffect(() => {
    const onInstallable = () => setInstallable(true)
    window.addEventListener('jw-hub-installable', onInstallable)
    return () => window.removeEventListener('jw-hub-installable', onInstallable)
  }, [])

  if (!open) return null

  const update = (patch: Partial<AppPreferences>) => {
    onPrefsChange({ ...prefs, ...patch })
  }

  const toggleCategory = (key: CategoryKey) => {
    update({
      categories: { ...prefs.categories, [key]: !prefs.categories[key] },
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-stone-200 bg-white shadow-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-stone-100 bg-white px-5 py-4">
          <h2 id="settings-title" className="text-lg font-bold text-stone-900">
            Impostazioni
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-stone-100"
            aria-label="Chiudi"
          >
            <X className="h-5 w-5 text-stone-500" />
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          <section>
            <h3 className="mb-2 text-sm font-semibold text-stone-900">Lingua</h3>
            <label className="sr-only" htmlFor="lang">
              Lingua contenuti
            </label>
            <select
              id="lang"
              value={prefs.language}
              onChange={(e) => update({ language: e.target.value })}
              className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm"
            >
              {LOCALES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-stone-900">
              Categorie da notificare
            </h3>
            <div className="space-y-2">
              {(Object.keys(CATEGORY_LABELS) as CategoryKey[]).map((key) => (
                <label
                  key={key}
                  className="flex cursor-pointer items-center justify-between rounded-lg border border-stone-200 px-3 py-2 text-sm"
                >
                  <span>{CATEGORY_LABELS[key]}</span>
                  <input
                    type="checkbox"
                    checked={prefs.categories[key]}
                    onChange={() => toggleCategory(key)}
                    className="h-4 w-4 accent-amber-500"
                  />
                </label>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-stone-900">
              Frequenza notifiche
            </h3>
            <select
              value={prefs.frequency}
              onChange={(e) =>
                update({ frequency: e.target.value as NotifyFrequency })
              }
              className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm"
            >
              <option value="instant">Subito (ogni novità)</option>
              <option value="hourly">Riassunto orario</option>
              <option value="daily">Riassunto giornaliero</option>
            </select>
          </section>

          <section className="rounded-xl border border-stone-200 p-4">
            <label className="mb-3 flex items-center justify-between text-sm font-semibold text-stone-900">
              Ore silenziose
              <input
                type="checkbox"
                checked={prefs.quietHoursEnabled}
                onChange={(e) =>
                  update({ quietHoursEnabled: e.target.checked })
                }
                className="h-4 w-4 accent-amber-500"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-stone-500">
                Da
                <input
                  type="time"
                  value={prefs.quietStart}
                  onChange={(e) => update({ quietStart: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-stone-200 px-2 py-1.5 text-sm text-stone-900"
                />
              </label>
              <label className="text-xs text-stone-500">
                A
                <input
                  type="time"
                  value={prefs.quietEnd}
                  onChange={(e) => update({ quietEnd: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-stone-200 px-2 py-1.5 text-sm text-stone-900"
                />
              </label>
            </div>
          </section>

          <section className="rounded-xl border border-stone-200 p-4">
            <div className="flex items-center gap-3">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                  permission === 'granted' ? 'bg-amber-100' : 'bg-stone-100'
                }`}
              >
                <Bell
                  className={`h-5 w-5 ${
                    permission === 'granted'
                      ? 'text-amber-600'
                      : 'text-stone-500'
                  }`}
                />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-stone-900">
                  Notifiche{pushEnabled ? ' (Web Push)' : ' browser'}
                </h3>
                <p className="text-xs text-stone-500">
                  {permission === 'granted'
                    ? pushEnabled
                      ? 'Attive anche a scheda chiusa'
                      : 'Attive in questa sessione'
                    : permission === 'denied'
                      ? 'Bloccate dal browser'
                      : permission === 'unsupported'
                        ? 'Non disponibili qui'
                        : 'Non ancora attivate'}
                </p>
              </div>
            </div>
            {permission !== 'granted' &&
              permission !== 'denied' &&
              permission !== 'unsupported' && (
                <button
                  type="button"
                  onClick={onEnableNotifications}
                  className="mt-2 w-full rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600"
                >
                  Attiva notifiche
                </button>
              )}
          </section>

          <section className="rounded-xl border border-stone-200 p-4">
            <h3 className="mb-2 text-sm font-semibold text-stone-900">
              Sync tra dispositivi
            </h3>
            <p className="mb-3 text-xs text-stone-500">
              Genera un codice e usalo su un altro dispositivo per allineare
              preferenze e novità lette.
            </p>
            <div className="flex gap-2">
              <input
                value={syncInput}
                onChange={(e) => setSyncInput(e.target.value.toUpperCase())}
                placeholder="Codice"
                className="flex-1 rounded-lg border border-stone-200 px-3 py-2 text-sm tracking-widest"
                aria-label="Codice sync"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  const code = generateSyncCode()
                  setSyncInput(code)
                  update({ syncCode: code })
                  onToast(`Codice creato: ${code}`, 'success')
                }}
                className="rounded-lg border border-stone-200 px-3 py-2 text-sm hover:bg-stone-50"
              >
                Nuovo
              </button>
            </div>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                disabled={busy || !syncInput}
                onClick={async () => {
                  setBusy(true)
                  const next = { ...prefs, syncCode: syncInput }
                  onPrefsChange(next)
                  const result = await pushSyncState(next)
                  setBusy(false)
                  onToast(
                    result.ok
                      ? 'Stato caricato sul cloud'
                      : result.error || 'Errore',
                    result.ok ? 'success' : 'error',
                  )
                }}
                className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-stone-900 px-3 py-2 text-sm text-white disabled:opacity-50"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Carica
              </button>
              <button
                type="button"
                disabled={busy || !syncInput}
                onClick={async () => {
                  setBusy(true)
                  const result = await pullSyncState(syncInput)
                  setBusy(false)
                  if (result.ok && result.preferences) {
                    onPrefsChange(result.preferences)
                    onToast('Stato scaricato', 'success')
                  } else {
                    onToast(result.error || 'Errore', 'error')
                  }
                }}
                className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-stone-200 px-3 py-2 text-sm disabled:opacity-50"
              >
                Scarica
              </button>
            </div>
          </section>

          <button
            type="button"
            onClick={async () => {
              const outcome = await promptInstall()
              if (outcome === 'accepted') onToast('App installata', 'success')
              else if (outcome === 'unavailable') {
                onToast(
                  'Usa il menu del browser → Installa app / Aggiungi a Home',
                  'info',
                )
              }
              setInstallable(canInstall())
            }}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-stone-200 px-4 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-50"
          >
            <Download className="h-4 w-4" />
            {installable ? 'Installa l’app' : 'Come installare l’app'}
          </button>

          <ul className="space-y-2 text-sm text-stone-600">
            <li className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-stone-400" />
              Le novità provengono dalla sezione pubblica di jw.org
            </li>
            <li className="flex items-start gap-2">
              <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-stone-400" />
              Offline: vedi l’ultima cache salvata su questo dispositivo
            </li>
          </ul>

          <a
            href={`https://www.jw.org/${prefs.language}/`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-stone-200 px-4 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-50"
          >
            <Settings className="h-4 w-4" />
            Apri jw.org
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </div>
  )
}
