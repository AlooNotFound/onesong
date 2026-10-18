import { useEffect, useState } from 'react';

export default function App() {
  const [apiOk, setApiOk] = useState(null);

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => setApiOk(data.ok))
      .catch(() => setApiOk(false));
  }, []);

  const status = apiOk === null ? 'checking…' : apiOk ? 'online' : 'offline';

  return (
    <main className="home">
      <h1>OneSong</h1>
      <p className="tagline">One song. Everyone. Right now.</p>
      <p className="api-status">server: {status}</p>
    </main>
  );
}