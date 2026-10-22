import { expect, test } from '@playwright/test'

test('dashboard loads and settings open', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'JW Hub Notifiche' })).toBeVisible()
  await page.getByRole('button', { name: 'Impostazioni' }).click()
  await expect(page.getByRole('heading', { name: 'Impostazioni' })).toBeVisible()
  await expect(page.getByText('Categorie da notificare')).toBeVisible()
  await expect(page.getByText('Ore silenziose')).toBeVisible()
  await page.getByRole('button', { name: 'Chiudi' }).click()
})

test('search and filters work', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByPlaceholder('Cerca titolo o categoria…')).toBeVisible({
    timeout: 60_000,
  })
  const tutte = page.getByRole('tab', { name: 'Tutte' })
  await expect(tutte).toBeVisible({ timeout: 60_000 })
  await tutte.click()
  await expect(tutte).toHaveAttribute('aria-selected', 'true')
  await page.getByPlaceholder('Cerca titolo o categoria…').fill('zzzz-no-match')
  await expect(page.getByText('Nessun risultato per questa ricerca.')).toBeVisible()
})
