// application/frontend/src/explore-main.jsx
//
// Entry point for the public data explorer — the only part of this
// application that is meant to run from this repository.
//
// The study app's own entry (main.jsx -> App.jsx) stays in the tree as the
// record of what Prolific participants actually used, but it is deliberately
// not the one built here. App.jsx creates a Supabase client at module scope,
// so it cannot even start without credentials that do not belong in a public
// repo, and its chat/study/admin routes need serverless functions that
// GitHub Pages cannot host. The explorer needs none of that — its data is
// bundled JSON and its only dependencies are react and react-router-dom — so
// it runs anywhere with no configuration at all.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import Explore from './explore/Explore'
import './explore-base.css'

// BASE_URL is vite.config.js's `base` verbatim, so the router's basename and
// the asset base cannot drift apart — serving this from a different path is
// a one-line change in the config, with nothing to remember to update here.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Explore />
    </BrowserRouter>
  </StrictMode>,
)
