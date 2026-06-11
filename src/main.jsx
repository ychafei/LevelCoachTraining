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
  ReactDOM.hydrateRoot(rootEl, <App />)
} else {
  ReactDOM.createRoot(rootEl).render(<App />)
}
