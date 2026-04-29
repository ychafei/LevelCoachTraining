import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import { client } from '@/api/appwriteClient'
import '@/index.css'

// Verifies the SDK can reach the Appwrite backend. Output appears in the
// browser console on every app load.
client.ping()
  .then(() => console.log('[appwrite] ping ok'))
  .catch((err) => console.error('[appwrite] ping failed:', err));

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
