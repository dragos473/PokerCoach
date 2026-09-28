/** Service worker registration (vite-plugin-pwa). Auto-updates in the background. */
import { registerSW } from 'virtual:pwa-register'

export function registerServiceWorker(): void {
  if (import.meta.env.DEV) return
  registerSW({ immediate: true })
}
