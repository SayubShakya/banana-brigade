// Shown when the game server cannot be reached: either this device is offline (the
// installed app still opens from the service worker's copy) or the server is down.
// It asks GET /api/status every five seconds and carries on by itself as soon as
// the server answers again.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { Panel } from '../components/common.jsx';

const EVERY_MS = 5000;

export default function Offline({ onBack }) {
  const [tries, setTries] = useState(0);
  const [checking, setChecking] = useState(false);
  const [deviceOnline, setDeviceOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setDeviceOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);

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
    <Panel narrow title={deviceOnline ? 'Server down' : 'You are offline'}
      subtitle={deviceOnline ? 'The Banana Brigade server is not answering.' : 'This device has no internet connection.'}
      footer={<button className="mbtn primary" onClick={check} disabled={checking}>{checking ? 'Checking…' : 'Try again now'}</button>}>
      <div className="legal">
        {deviceOnline
          ? <p>Your connection works, but the game server did not reply. It may be restarting.</p>
          : <p>The game opened from the copy saved on this device, but logging in, Banana puzzles and battles need the server.</p>}
        <p>This page checks again every 5 seconds and opens the game by itself when the server is back{tries ? ` (${tries} ${tries === 1 ? 'check' : 'checks'} so far)` : ''}.</p>
        {deviceOnline && import.meta.env.DEV && <p>Running it yourself? Start it with <code>./run.sh</code> in the <code>banana-brigade</code> folder.</p>}
      </div>
    </Panel>
  );
}
