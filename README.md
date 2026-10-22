# JW Hub Notifiche

Dashboard per le novità pubbliche di [jw.org](https://www.jw.org) con notifiche browser / Web Push, preferenze e sync tra dispositivi.

- **GitHub:** https://github.com/Andrew231716/jw-hub-notifiche
- **Live:** https://jw-hub-notifiche.vercel.app

## Funzionalità

- Feed novità da jw.org (IT/EN/FR/DE/ES/PT)
- Filtri, ricerca, ordinamento
- Stato letto/non letto (localStorage)
- Preferenze: categorie, ore silenziose, frequenza
- Web Push (service worker + VAPID) + badge app
- Sync multi-dispositivo tramite codice
- PWA installabile + cache offline
- Cron Vercel ogni 15 minuti (`/api/cron`)
- Storage durable su Vercel Blob (subscription/sync)

## Avvio locale

```bash
npm install
cp .env.example .env   # inserisci VAPID keys
npm run dev
```

```bash
npm run test:e2e
```

## Variabili ambiente

Vedi `.env.example`. Su Vercel servono almeno:

- `VITE_VAPID_PUBLIC_KEY` / `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`
- `BLOB_READ_WRITE_TOKEN` (store collegato al progetto)
- `CRON_SECRET` (opzionale)

## Stack

React + Vite + Tailwind · PWA (vite-plugin-pwa) · Vercel Serverless + Blob · web-push · Supabase opzionale
