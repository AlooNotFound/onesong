import { db, Timestamp} from '../firebase.js';

const USERNAME_RGX = /^[a-zA-Z0-9_]{3,20}$/;
const RESERVED = new Set(['admin', 'administrator', 'api', 'support', 'help', 'moderator', 'mod', 'system', 'onesong', 'root', 'null', 'undefined']);

function normUsername(username) {
    return String(username ?? '').trim().toLowerCase();
}

function validateUsername(username) {
    if(!USERNAME_RGX.test(username)) {
        throw Object.assign(new Error('Invalid username. Must be 3-20 characters, alphanumeric or underscores only.'), { status: 400 });
    }
    if(RESERVED.has(normUsername(username.toLowerCase()))) {
        throw Object.assign(new Error('Username is reserved. Please choose another.'), { status: 400 });
    }
}

function serializeProfile(data) {
    return {
        uid: data.uid,
        username: data.username,
        displayName: data.displayName,
        bio: data.bio ?? '',
        photoURL: data.photoURL ?? null,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
    };
}

export async function getProfile(uid) {
    const snap = await db.collection('users').doc(uid).get();
    if (!snap.exists) return null;
    return serializeProfile(snap.data());
}

export async function createProfile(uid, inp) {
    const username = String(inp.username ?? '').trim();
    const usernameLower = normUsername(username);
    validateUsername(username);
    const displayName = String(inp.displayName ?? username).trim();
    if (!displayName || displayName.length > 40) {
        throw Object.assign(
            new Error('Display name must be between 1 to 40 characters'), { status: 400 }
        );
    }
    const bio = String(inp.bio ?? '').trim();
    if (bio.length > 160) {
        throw Object.assign(
            new Error('Bio cannod exceed 160 chars'), { status: 400 }
        );
    }
    const userRef = db.collection('users').doc(uid);
    const usernameRef = db.collection('usernames').doc(usernameLower);
    return db.runTx(async (tx) => {
        const [userSnap, usernameSnap] = await Promise.all([
            tx.get(userRef),
            tx.get(usernameRef)
        ]);
        if (userSnap.exists) {
            throw Object.assign(new Error('User profile already exists'), { status: 400 });
        }
        if (usernameSnap.exists) {
            throw Object.assign(new Error('Username is already taken'), { status: 400 });
        }
        const now = Timestamp.now();
        const profile = {
            uid,
            username,
            usernameLower,
            displayName,
            bio,
            photoURL,
            createdAt: now,
            updatedAt: now,
        };
        tx.create(userRef, profile);
        tx.create(usernameRef, { uid, createdAt: now });
        return serializeProfile(profile);
    });
}

export async function updateProfile(uid, inp) {
    const userRef = db.collection('users').doc(uid);
    return db.runTx(async (tx) => {
        const userSnap = await tx.get(userRef);
        if (!userSnap.exists) {
            throw Object.assign(new Error('User profile not found'), { status: 404 });
        }
        const data = userSnap.data();
        const updates = {};
        if (inp.username !== undefined) {
            const username = String(inp.username ?? '').trim();
            const usernameLower = normUsername(username);
            validateUsername(username);
            if (usernameLower !== data.usernameLower) {
                const usernameRef = db.collection('usernames').doc(usernameLower);
                const usernameSnap = await tx.get(usernameRef);
                if (usernameSnap.exists) {
                    throw Object.assign(new Error('Username is already taken'), { status: 400 });
                }
                updates.username = username;
                updates.usernameLower = usernameLower;
                const oldUsernameRef = db.collection('usernames').doc(data.usernameLower);
                tx.delete(oldUsernameRef);
                tx.create(usernameRef, { uid, createdAt: Timestamp.now() });
            }
        }
        if (inp.displayName !== undefined) {
            const displayName = String(inp.displayName ?? '').trim();
            if (!displayName || displayName.length > 40) {
                throw Object.assign(
                    new Error('Display name must be between 1 to 40 characters'), { status: 400 }
                );
            }
            updates.displayName = displayName;
        }
        if (inp.bio !== undefined) {
            const bio = String(inp.bio ?? '').trim();
            if (bio.length > 160) {
                throw Object.assign(
                    new Error('Bio cannot exceed 160 chars'), { status: 400 }
                );
            }
            updates.bio = bio;
        }
        if (inp.photoURL !== undefined) {
            const photoURL = inp.photoURL ? String(inp.photoURL).trim() : null;
            updates.photoURL = photoURL;
        }
        if (Object.keys(updates).length === 0) {
            return serializeProfile(data);
        }
        updates.updatedAt = Timestamp.now();
        tx.update(userRef, updates);
        return serializeProfile({ ...data, ...updates });
    });
}

export async function changeUsername(uid, newUsername) {
    const username = String(newUsername ?? '').trim();
    const usernameLower = normUsername(username);
    validateUsername(username);
    const userRef = db.collection('users').doc(uid);
    const usernameRef = db.collection('usernames').doc(usernameLower);
    return db.runTx(async (tx) => {
        const [userSnap, usernameSnap] = await Promise.all([
            tx.get(userRef),
            tx.get(usernameRef)
        ]);
        if (!userSnap.exists) {
            throw Object.assign(new Error('User profile not found'), { status: 404 });
        }
        if (usernameSnap.exists) {
            throw Object.assign(new Error('Username is already taken'), { status: 400 });
        }
        const data = userSnap.data();
        const oldUsernameRef = db.collection('usernames').doc(data.usernameLower);
        tx.delete(oldUsernameRef);
        tx.create(usernameRef, { uid, createdAt: Timestamp.now() });
        tx.update(userRef, {
            username,
            usernameLower,
            updatedAt: Timestamp.now()
        });
        return serializeProfile({ ...data, username, usernameLower, updatedAt: Timestamp.now() });
    });
}

export async function getPublicProfile(username) {
    const usernameLower = normUsername(username);
    const usernameRef = db.collection('usernames').doc(usernameLower);
    const usernameSnap = await usernameRef.get();
    if (!usernameSnap.exists) {
        return null;
    }
    const uid = usernameSnap.data().uid;
    return serializeProfile(await getProfile(uid));
}