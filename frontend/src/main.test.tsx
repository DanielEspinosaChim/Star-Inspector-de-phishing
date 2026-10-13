import { screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

beforeEach(() => {
  vi.resetModules()
  document.body.innerHTML = '<div id="root"></div>'
  // Gateway inalcanzable: basta para comprobar el montaje
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('sin red')))
})
afterEach(() => {
  document.body.innerHTML = ''
})

it('main.tsx monta App en #root', async () => {
  await import('./main.tsx')
  expect(await screen.findByText('Inspector de phishing')).toBeInTheDocument()
  expect(document.getElementById('root')?.children.length).toBeGreaterThan(0)
})
