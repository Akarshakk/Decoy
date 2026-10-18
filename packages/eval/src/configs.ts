// Detector configurations compared in the ablation (build_execution.md §8). The credential gate runs in every one.
import { ALL_DETECTORS, type Detectors } from '@swaroop/engine';

export interface Config { id: string; label: string; detectors: Detectors; note: string }

export const CONFIGS: Config[] = [
  { id: 'credentials', label: 'Credentials only', detectors: { factors: [], tripwire: false },
    note: 'Token signature, expiry, version and scope. What an agent platform checks today.' },
  { id: 's1', label: 'S1 role only', detectors: { factors: ['S1'], tripwire: false },
    note: 'Is this tool, data class and destination in the role charter?' },
  { id: 's2', label: 'S2 behaviour only', detectors: { factors: ['S2'], tripwire: false },
    note: 'Is this sequence or volume unusual for this agent (or its peer when it is new)?' },
  { id: 'a', label: 'Inline only (S1 S3 S5)', detectors: { factors: ['S1', 'S3', 'S5'], tripwire: true },
    note: 'The deterministic checks: role, data flow, credential context and the decoy tripwire.' },
  { id: 'full', label: 'Full', detectors: ALL_DETECTORS,
    note: 'Every detector, the drift accumulator and the tripwire.' },
];
