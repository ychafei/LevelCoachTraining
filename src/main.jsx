import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

const rootEl = document.getElementById('root')

// Prerendered documents (npm run build:seo) arrive with the marketing page
// already in the DOM. hydrateRoot attaches to that markup instead of
// discarding and repainting it — the first paint IS the LCP. Plain SPA
// loads (empty #root) fall back to a normal client render.
if (rootEl.firstElementChild) {
  ReactDOM.hydrateRoot(rootEl, <App />, {
    // Hydration mismatches recover by client-rendering; surface them as a
    // single warning with the component stack so regressions stay visible
    // without spraying uncaught errors into the console.
    onRecoverableError(error, errorInfo) {
      console.warn('[hydration]', error?.message, errorInfo?.componentStack?.split('\n').slice(0, 5).join(' '))
    },
  })
} else {
  ReactDOM.createRoot(rootEl).render(<App />)
}
