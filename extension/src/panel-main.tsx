import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PanelApp } from './PanelApp'
import { initializePanelTheme } from './theme'
import './panel.css'
import './panel-scrollbar.css'
import './panel-compose.css'
import './panel-recent.css'
import './panel-inbox.css'
import './panel-settings.css'

document.documentElement.classList.toggle('is-embedded', window.top !== window)

void initializePanelTheme().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <PanelApp />
    </StrictMode>,
  )
})
