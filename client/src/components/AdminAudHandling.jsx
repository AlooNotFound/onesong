import { useState, useEffect, useCallback } from 'react';
import { auth } from '../lib/firebase.js';

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default function adminAudHandling() {
  const [isOpen, setIsOpen] = useState(false);
  const [adminKey, setAdminKey] = useState(() => localStorage.getItem('onesong_admin_key') || 'onesong-admin');
  const [stats, setStats] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionTrackId, setActionTrackId] = useState(null);
  const [statusMessage, setStatusMessage] = useState(null);
  const [uploadProgress, setUploadProgress] = useState({});

  const handleAdminKeyChange = (e) => {
    const val = e.target.value;
    setAdminKey(val);
    localStorage.setItem('onesong_admin_key', val);
  };

  const getHeaders = useCallback(async () => {
    const h = { 'x-admin-key': adminKey };
    try {
      const u = auth.currentUser;
      if (u) {
        const token = await u.getIdToken();
        h['Authorization'] = `Bearer ${token}`;
      }
    } catch {}
    return h;
  }, [adminKey]);

  const fetchStatus = useCallback(async () => {
    try {
      const headers = await getHeaders();
      const res = await fetch('/api/admin/audio/status', { headers });
      const data = await res.json();
      if (data.ok) {
        setStats(data.stats);
      }
    } catch (err) {
      console.warn('Could not fetch audio stats:', err);
    }
  }, [getHeaders]);

  const fetchTracks = useCallback(async () => {
    try {
      const headers = await getHeaders();
      const res = await fetch('/api/admin/audio/tracks', { headers });
      const data = await res.json();
      if (data.ok) {
        setTracks(data.tracks);
      }
    } catch (err) {
      console.warn('Could not fetch acquisition tracks:', err);
    }
  }, [getHeaders]);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchStatus(), fetchTracks()]);
    setLoading(false);
  }, [fetchStatus, fetchTracks]);

  useEffect(() => {
    if (isOpen) {
      refreshAll();
    }
  }, [isOpen, refreshAll]);

  const handleAcquire = async (trackId) => {
    setActionTrackId(trackId);
    setStatusMessage(`Acquiring audio for ${trackId}...`);
    try {
      const headers = await getHeaders();
      const res = await fetch(`/api/admin/audio/acquire/${trackId}`, {
        method: 'POST',
        headers,
      });
      const data = await res.json();
      if (data.ok) {
        setStatusMessage(`Successfully acquired!`);
        await refreshAll();
      } else {
        setStatusMessage(`error: ${data.error}`);
      }
    } catch (err) {
      setStatusMessage(`error: ${err.message}`);
    } finally {
      setActionTrackId(null);
    }
  };

  const handleRetryFailed = async () => {
    setLoading(true);
    setStatusMessage('retrying failed tracks...');
    try {
      const headers = await getHeaders();
      const res = await fetch('/api/admin/audio/retry-failed', {
        method: 'POST',
        headers,
      });
      const data = await res.json();
      if (data.ok) {
        setStatusMessage(`Retry finished: ${data.retriedCount} succeeded, ${data.failedCount} failed.`);
        await refreshAll();
      } else {
        setStatusMessage(`error: ${data.error}`);
      }
    } catch (err) {
      setStatusMessage(`error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (trackId) => {
    setActionTrackId(trackId);
    try {
      const headers = await getHeaders();
      const res = await fetch(`/api/admin/audio/${trackId}`, {
        method: 'DELETE',
        headers,
      });
      const data = await res.json();
      if (data.ok) {
        setStatusMessage(`Evicted audio for track ${trackId}`);
        await refreshAll();
      } else {
        setStatusMessage(`Delete failed: ${data.error}`);
      }
    } catch (err) {
      setStatusMessage(`Delete error: ${err.message}`);
    } finally {
      setActionTrackId(null);
    }
  };

  const handleUploadFile = async (trackId, e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setActionTrackId(trackId);
    setUploadProgress((prev) => ({ ...prev, [trackId]: 'Uploading...' }));
    setStatusMessage(`Uploading ${file.name} for ${trackId}...`);

    try {
      const headers = await getHeaders();
      const res = await fetch(`/api/admin/audio/upload/${trackId}?fName=${encodeURIComponent(file.name)}`, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': file.type || 'audio/mpeg',
        },
        body: file,
      });
      const data = await res.json();
      if (data.ok) {
        setStatusMessage(`Uploaded ${file.name}!`);
        await refreshAll();
      } else {
        setStatusMessage(`failed upload: ${data.error}`);
      }
    } catch (err) {
      setStatusMessage(`error: ${err.message}`);
    } finally {
      setActionTrackId(null);
      setUploadProgress((prev) => {
        const copy = { ...prev };
        delete copy[trackId];
        return copy;
      });
      e.target.value = '';
    }
  };

  const handleCleanup = async () => {
    setLoading(true);
    setStatusMessage('cleanup started...');
    try {
      const headers = await getHeaders();
      const res = await fetch('/api/admin/audio/cleanup', {
        method: 'POST',
        headers,
      });
      const data = await res.json();
      if (data.ok) {
        setStatusMessage(`cleanup finished: ${data.cleanedPlayed} tracks, ${data.cleanedStale} stales removed`);
        await refreshAll();
      } else {
        setStatusMessage(`cleanip failed: ${data.error}`);
      }
    } catch (err) {
      setStatusMessage(`error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="card admin-audio-card">
      <div className="admin-header-row">
        <h2 className="admin-title">
          <span>Audio Handling</span>
          <span className="badge-pill">{stats?.activeCount ?? 0} / 10 cached</span>
        </h2>
        <button type="button" className="admin-toggle-btn" onClick={() => setIsOpen(!isOpen)}>
          {isOpen ? 'Hide Panel' : 'Manage Audio'}
        </button>
      </div>
      {isOpen && (
        <div className="admin-content">
          <div className="admin-controls-bar">
            <div className="admin-input-group">
              <label htmlFor="adminKeyInput">Admin Key:</label>
              <input id="adminKeyInput" type="password" className="admin-key-input" value={adminKey} onChange={handleAdminKeyChange} placeholder="onesong-admin"/>
            </div>
            <div className="admin-button-group">
              <button type="button" className="btn-action" onClick={refreshAll} disabled={loading}>
                Refresh
              </button>
              <button type="button" className="btn-action" onClick={handleRetryFailed} disabled={loading}>
                Retry Failed
              </button>
              <button type="button" className="btn-action btn-outline" onClick={handleCleanup} disabled={loading}>
                Clean Storage
              </button>
            </div>
          </div>

          {stats && (
            <div className="stats-grid">
              <div className="stat-box">
                <span className="stat-lable">Cache limit</span>
                <span className="stat-val">{stats.TCacheLim || 10} tracks</span>
              </div>
              <div className="stat-box">
                <span className="stat-lbl">Active in cache</span>
                <span className="stat-val">{stats.activeCount || 0}</span>
              </div>
              <div className="stat-box">
                <span className="stat-lbl">Pending</span>
                <span className="stat-val">{stats.pending || 0}</span>
              </div>
              <div className="stat-box">
                <span className="stat-lbl">Failed</span>
                <span className="stat-val stat-error"> {stats.failed || 0}</span>
              </div>
              <div className="stat-box">
                <span className="stat-lbl">Disc storage</span>
                <span className="stat-val">{formatBytes(stats.totalDiscBytes)}</span>
              </div>
            </div>
          )}

          {statusMessage && (
            <div className="admin-status-banner" role="status">
              {statusMessage}
            </div>
          )}

          <div className="admin-tracks-section">
            <h3>Track Audio adding queue</h3>
            {tracks.length === 0 ? (
              <p className="empty-notice"> No tracks found</p>
            ) : (
              <div className="table-responsive">
                <table className="admin-tracks-table">
                  <thead>
                    <tr>
                      <th>Track</th>
                      <th>Status</th>
                      <th>storage</th>
                      <th>actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tracks.map((t) => {
                      const isBusy = actionTrackId === t.canonicalTrackId || loading;
                      return (
                        <tr key={t.canonicalTrackId}>
                          <td>
                            <div className="track-title-cell">
                              <strong> {t.title}</strong>
                              <span className="track-artist">{t.artist}</span>
                              <span className="track-id">{t.canonicalTrackId}</span>
                            </div>
                          </td>
                          <td>
                            <span className={`status-pill status-${t.status}`}>
                              {t.status}
                            </span>
                            {t.error && <span className="error-hint" title={t.error}>Error</span>}
                          </td>
                          <td>
                            {t.fSize ? formatBytes(t.fSize) : '—'}
                          </td>
                          <td>
                            <div className="action-row">
                              {['pending', 'failed'].includes(t.status) && (
                                <button type="button" className="btn-tiny btn-primary" onClick={() => handleAcquire(t.canonicalTrackId)} disabled={isBusy}>
                                  {isBusy ? 'Acquiring...' : 'Acquire'}
                                </button>
                              )}
                              {['ready', 'playing'].includes(t.status) && (
                                <>
                                  <audio className="audio-preview-player" controls preload="none" src={t.audioUrl} />
                                  <button type="button" className="btn-tiny btn-danger" onClick={() => handleDelete(t.canonicalTrackId)} disabled={isBusy}>
                                    Delete
                                  </button>
                                </>
                              )}
                              <label className="btn-tiny btn-upload">
                                {uploadProgress[t.canonicalTrackId] || 'Upload'}
                                <input type="file" accept="audio/*" style={{ display: 'none' }} onChange={(e) => handleUploadFile(t.canonicalTrackId, e)} disabled={isBusy}/>
                              </label>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}