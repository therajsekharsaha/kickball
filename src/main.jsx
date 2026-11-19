import React from 'react'
import { createRoot } from 'react-dom/client'
import { library } from '@fortawesome/fontawesome-svg-core'
import App from './App.jsx'
import './styles.css'

library.add()
createRoot(document.getElementById('root')).render(<App />)
