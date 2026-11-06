import {auth} from '../firebase.js';

async function authReq(url, options = {}) {
    const user = auth.currentUser;
    if (!user) {
        throw new Error('Not signed in');
    }
    const token = await user.getIdToken();
    const resp = await fetch(url, {
        ...options,
        headers: {
            ...options.headers,
            Authorization: `Bearer ${token}`,
        },
    });
    if (!resp.ok) {
        const data = await resp.json();
        throw new Error(data.error || 'Request failed');
    }
    return resp.json();
}

export async function getProfile() {
    const data = await authenticatedRequest('/api/users/me');
    return data.profile;
}

export async function createProfile(profileData) {
    const data = await authReq('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileData),
    });
    return data.profile;
}

export async function updateProfile(profileData) {
    const data = await authReq('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileData),
    });
    return data.profile;
}

export async function changeUsername(newUsername) {
    const data = await authReq('/api/users/me/username', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: newUsername }),
    });
    return data.profile;
}

export async function getPublicProfile(username) {
    const resp = await fetch(`/api/users/${encodeURIComponent(username)}`);
    if (!resp.ok) {
        const data = await resp.json();
        throw new Error(data.error || 'Failed to fetch public profile');
    }
    const data = await resp.json();
    return data;
}