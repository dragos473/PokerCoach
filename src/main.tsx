import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './app/App'
import { useSettings } from './store/settings'
import { registerServiceWorker } from './app/pwa'
import { useRanges } from './store/ranges'

// Load persisted settings before the first paint so the theme doesn't flash.
void Promise.all([useSettings.getState().load(), useRanges.getState().load()]).finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})

registerServiceWorker()
