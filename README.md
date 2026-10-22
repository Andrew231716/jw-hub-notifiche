# JW Hub Notifiche

Riproduzione dell’app [JW Hub Notifiche](https://personal-area-notifi-oo7w.bolt.host/): dashboard che monitora le novità pubbliche di [jw.org/it/cosa-nuovo](https://www.jw.org/it/cosa-nuovo/) e offre notifiche browser, filtri e stato letto/non letto.

- **GitHub:** https://github.com/Andrew231716/jw-hub-notifiche
- **Live (Vercel):** https://jw-hub-notifiche.vercel.app

## Stack

- React + TypeScript + Vite
- Tailwind CSS v4
- Lucide icons
- Modalità locale: API Vite che scrapa jw.org e salva in `server/.data/`
- Modalità produzione: Supabase (`jw_updates`, `jw_fetch_log`) + edge function `fetch-jw-updates`

## Avvio locale

```bash
npm install
npm run dev
```

Apri `http://localhost:5173`. Al primo caricamento l’API scarica le novità da jw.org.

## Funzionalità

- Banner e CTA per attivare le notifiche del browser
- Statistiche: non lette / totale / ultimo check
- Filtri: Non lette, Tutte, Notizie, Articoli, Riviste, Musica
- Feed con thumbnail, categoria, date relative, segna come letta
- Pannello Impostazioni
- Refresh manuale + poll periodico
- PWA (`manifest.json` + icone)

## Supabase (opzionale)

1. Applica `supabase/migrations/001_jw_hub.sql`
2. Deploy di `supabase/functions/fetch-jw-updates`
3. Copia `.env.example` in `.env` e imposta URL + anon key
4. Riavvia `npm run dev`

Con le variabili presenti il frontend usa Supabase al posto dell’API locale.
