import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PanelApp } from './PanelApp'
import { initializePanelTheme } from './theme'
import './panel.css'
import './panel-scrollbar.css'
import './panel-compose.css'
import './panel-attachments.css'
import './panel-recent.css'
import './panel-inbox.css'
import './panel-settings.css'
import './panel-source-nav.css'

document.documentElement.classList.toggle('is-embedded', window.top !== window)

void initializePanelTheme().catch(() => undefined)
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PanelApp />
  </StrictMode>,
)
