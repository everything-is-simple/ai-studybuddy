import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './app';
import './styles/global.css';
import 'katex/dist/katex.min.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('找不到挂载点 #root');
}

createRoot(container).render(
  <StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
    </BrowserRouter>
  </StrictMode>
);
