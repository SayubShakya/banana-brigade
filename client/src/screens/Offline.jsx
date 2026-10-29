// Shown when the game server cannot be reached. It asks GET /api/status every five
// seconds and carries on by itself as soon as the server answers again.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Panel } from './common.jsx';

const EVERY_MS = 5000;

export default function Offline({ onBack }) {
  const [tries, setTries] = useState(0);
  const [checking, setChecking] = useState(false);

  async function check() {
    setChecking(true);
    try {
      await api.status();
      onBack();               // the server is back
    } catch {
      setTries((n) => n + 1);
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    const timer = setInterval(check, EVERY_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <Panel narrow title="Server down" subtitle="The Banana Brigade server is not answering."
      footer={<button className="mbtn primary" onClick={check} disabled={checking}>{checking ? 'Checking…' : 'Try again now'}</button>}>
      <div className="legal">
        <p>Your connection works, but the game server did not reply. It may be restarting. This page checks again every
          5 seconds and opens the game by itself when the server is back{tries ? ` (${tries} ${tries === 1 ? 'check' : 'checks'} so far)` : ''}.</p>
        <p>Running it yourself? Start it with <code>./run.sh</code> in the <code>banana-brigade</code> folder.</p>
      </div>
    </Panel>
  );
}
