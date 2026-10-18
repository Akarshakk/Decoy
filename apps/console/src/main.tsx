import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { Landing } from './pages/Landing';
import { ConsoleShell, Planned } from './pages/Console';
import { Investigate } from './pages/Investigate';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/app" element={<ConsoleShell />}>
          <Route index element={<Navigate to="/app/investigate/d2" replace />} />
          <Route path="investigate/:scenario" element={<Investigate />} />
          <Route path="investigate" element={<Navigate to="/app/investigate/d2" replace />} />
          <Route path="fleet" element={<Planned page="fleet" />} />
          <Route path="agents" element={<Planned page="agents" />} />
          <Route path="alerts" element={<Planned page="alerts" />} />
          <Route path="ledger" element={<Planned page="ledger" />} />
          <Route path="evals" element={<Planned page="evals" />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
