import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The site is published at https://<user>.github.io/RLG/ — a subpath, not a
// domain root. explore-main.jsx reads this back as import.meta.env.BASE_URL
// for the router's basename, so changing it here moves both together.
const BASE = '/RLG/'

// GitHub Pages serves static files and has no rewrite rules, so a direct
// visit or a refresh on a client-side route like /RLG/a2a asks for a file
// that does not exist and gets the 404 page. Pages serves 404.html for any
// unmatched path, so emitting it as a copy of index.html boots the same app
// and lets the router resolve the URL from there.
//
// Worth knowing when testing this: both `vite dev` and `vite preview` do SPA
// history fallback of their own, so neither can tell you whether this is
// working. Only a plain static server (npx serve dist) reproduces what Pages
// actually does.
const pagesSpaFallback = () => ({
  name: 'pages-spa-fallback',
  enforce: 'post',
  generateBundle(_options, bundle) {
    const index = bundle['index.html']
    if (index) {
      this.emitFile({ type: 'asset', fileName: '404.html', source: index.source })
    }
  },
})

// Visiting the base path without its trailing slash (/RLG rather than /RLG/)
// gets a bare 404 from the dev server with no app on it, which looks exactly
// like a broken build rather than a mistyped URL. GitHub Pages redirects in
// that case, so this only ever bites in development — this makes dev behave
// the same way instead of failing in a way production never will.
const devBaseRedirect = () => ({
  name: 'dev-base-redirect',
  configureServer(server) {
    const withoutSlash = BASE.replace(/\/$/, '')
    server.middlewares.use((req, res, next) => {
      if (req.url === withoutSlash) {
        res.writeHead(301, { Location: BASE })
        return res.end()
      }
      next()
    })
  },
})

// https://vite.dev/config/
export default defineConfig({
  // The dev server honours `base` too, so `npm run dev` serves the app at
  // localhost:5173/RLG/ — deliberately the same shape as production, since a
  // base/basename mismatch is invisible at the root path and breaks every
  // asset once deployed.
  base: BASE,
  plugins: [react(), pagesSpaFallback(), devBaseRedirect()],
})
