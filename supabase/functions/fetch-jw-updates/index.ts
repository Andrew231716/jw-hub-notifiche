import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const JW_URL = 'https://www.jw.org/it/cosa-nuovo/'

type ParsedItem = {
  url: string
  title: string
  category: string | null
  published_date: string | null
  image_url: string | null
  description: string | null
}

function absoluteUrl(href: string): string {
  if (href.startsWith('http')) return href
  return `https://www.jw.org${href.startsWith('/') ? '' : '/'}${href}`
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
}

function parseWhatsNewHtml(html: string): ParsedItem[] {
  const items: ParsedItem[] = []
  const blockRe =
    /<div class="synopsis\s+([^"]*)"[\s\S]*?<\/div>\s*<\/div>/g
  let match: RegExpExecArray | null

  while ((match = blockRe.exec(html))) {
    const classes = match[1]
    const block = match[0]
    if (classes.includes('WhatsNewPage')) continue

    const titleMatch = block.match(
      /<h3>\s*<a href="([^"]+)"[^>]*>\s*([\s\S]*?)\s*<\/a>/,
    )
    if (!titleMatch) continue

    const href = titleMatch[1]
    const title = decodeEntities(titleMatch[2].replace(/\s+/g, ' ').trim())
    if (!title || href.includes('/cosa-nuovo/')) continue

    const contextTitle = block.match(
      /<p class="contextTitle">\s*([\s\S]*?)\s*<\/p>/,
    )
    const category = contextTitle
      ? decodeEntities(contextTitle[1].replace(/\s+/g, ' ').trim())
      : classes.includes('news')
        ? 'NEWS'
        : null

    const dateMatch = block.match(/<p class="meta pubDate">\s*([^<]+)\s*<\/p>/)
    const published_date = dateMatch ? dateMatch[1].trim() : null

    const imgMatch =
      block.match(/data-img-size-xs='([^']+)'/) ||
      block.match(/data-img-size-xs="([^"]+)"/) ||
      block.match(/<img[^>]+src=['"]([^'"]+)['"]/)

    const descMatch = block.match(/<p class="desc">\s*([\s\S]*?)\s*<\/p>/)
    const description = descMatch
      ? decodeEntities(descMatch[1].replace(/\s+/g, ' ').trim()) || null
      : null

    items.push({
      url: absoluteUrl(href),
      title,
      category,
      published_date,
      image_url: imgMatch ? imgMatch[1] : null,
      description,
    })
  }

  return items
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers':
          'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const client = createClient(supabaseUrl, serviceKey)

  try {
    const res = await fetch(JW_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; JWHubNotifiche/1.0)',
        Accept: 'text/html',
      },
    })
    if (!res.ok) {
      await client.from('jw_fetch_log').insert({
        new_count: 0,
        status: 'error',
        error_message: `HTTP ${res.status}`,
      })
      return Response.json(
        { success: false, newCount: 0, error: `HTTP ${res.status}` },
        { headers: { 'Access-Control-Allow-Origin': '*' } },
      )
    }

    const html = await res.text()
    const parsed = parseWhatsNewHtml(html)

    if (!parsed.length) {
      await client.from('jw_fetch_log').insert({
        new_count: 0,
        status: 'success',
        error_message: 'No items parsed from page',
      })
      return Response.json(
        {
          success: true,
          newCount: 0,
          totalParsed: 0,
          newItems: [],
        },
        { headers: { 'Access-Control-Allow-Origin': '*' } },
      )
    }

    const { data: existing } = await client
      .from('jw_updates')
      .select('url')
      .in(
        'url',
        parsed.map((item) => item.url),
      )

    const existingUrls = new Set((existing || []).map((row) => row.url))
    const newItems = parsed.filter((item) => !existingUrls.has(item.url))

    if (newItems.length) {
      await client.from('jw_updates').insert(
        newItems.map((item) => ({
          url: item.url,
          title: item.title,
          category: item.category,
          published_date: item.published_date,
          image_url: item.image_url,
          description: item.description,
          notified: false,
          read: false,
        })),
      )
    }

    await client.from('jw_fetch_log').insert({
      new_count: newItems.length,
      status: 'success',
      error_message: null,
    })

    return Response.json(
      {
        success: true,
        newCount: newItems.length,
        totalParsed: parsed.length,
        newItems: newItems.map((item) => item.title),
      },
      { headers: { 'Access-Control-Allow-Origin': '*' } },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    await client.from('jw_fetch_log').insert({
      new_count: 0,
      status: 'error',
      error_message: message,
    })
    return Response.json(
      { success: false, newCount: 0, error: message },
      { headers: { 'Access-Control-Allow-Origin': '*' } },
    )
  }
})
