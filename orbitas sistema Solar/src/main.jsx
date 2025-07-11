import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/main.css';
import App from './ui/App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)