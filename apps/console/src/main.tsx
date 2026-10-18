import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { Landing } from './pages/Landing';
import { ConsoleShell, Planned } from './pages/Console';
import { Investigate } from './pages/Investigate';
import { Fleet } from './pages/Fleet';
import { Agent } from './pages/Agent';
import { Alerts } from './pages/Alerts';
import { Ledger } from './pages/Ledger';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/app" element={<ConsoleShell />}>
          <Route index element={<Navigate to="/app/fleet" replace />} />
          <Route path="fleet" element={<Fleet />} />
          <Route path="investigate/:scenario" element={<Investigate />} />
          <Route path="investigate" element={<Navigate to="/app/investigate/d2" replace />} />
          <Route path="agents" element={<Agent />} />
          <Route path="agents/:id" element={<Agent />} />
          <Route path="alerts" element={<Alerts />} />
          <Route path="alerts/:id" element={<Alerts />} />
          <Route path="ledger" element={<Ledger />} />
          <Route path="evals" element={<Planned page="evals" />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
