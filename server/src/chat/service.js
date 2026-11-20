import { db } from "../firebase.js";
import { publishEvent } from "../realtime/events.js";

const chatMessages = [];
const MAX_MESSAGES = 100;

async function initChatHistory() {
    try {
        const snap = await db.collection('chat_messages').orderBy('timestamp', 'desc').limit(50).get();
        if (!snap.empty) {
            const loaded = [];
            snap.forEach(doc => {
                loaded.push(doc.data());
            });
            loaded.reverse();
            for (const item of loaded) {
                chatMessages.push(item);
            }
        }
    } catch {}
}

initChatHistory();

export async function getRecentMessages(limit = 50) {
    return chatMessages.slice(-limit);
}

export async function addMessage({ text, uid, displayName, username, isGuest }) {
    const msg = {
        id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        text: text.trim(),
        uid: uid || null,
        displayName: (displayName || 'Guest').slice(0, 30),
        username: username ? username.slice(0, 30) : null,
        isGuest: Boolean(isGuest),
        timestamp: Date.now()
    };

    chatMessages.push(msg);
    if (chatMessages.length > MAX_MESSAGES) {
        chatMessages.shift();
    }

    try {
        db.collection('chat_messages').doc(msg.id).set(msg).catch(() => {});
    } catch {}

    publishEvent('chat', msg);
    return msg;
}