import { useState, useEffect, useRef } from 'react';
import { auth } from '../lib/firebase.js';
import { Send, X, MessageSquare } from "lucide-react";

function getAvatarColor(name) {
    let hash = 0;
    const str = name || 'User';
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash) % 360;
    return `hsl(${h}, 65%, 55%)`;
}

function formatChatTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
export default function LiveChat({ user, profile, onRequireLogin }) {
    const [isOpen, setIsOpen] = useState(false);
    const [msgs, setMsgs] = useState([]);
    const [text, setText] = useState('');
    const [guestName, setGuestName] = useState(() => {
        return localStorage.getItem('onesong_chat_guest') || `Guest${Math.floor(1000 + Math.random() * 9000)}`;
    });
    const [isEditingGuest, setIsEditingGuest] = useState(false);
    const [guestInput, setGuestInput] = useState('');
    const [unreadCount, setUnreadCount] = useState(0);
    const [sending, setSending] = useState(false);
    const msgsEndRef = useRef(null);
    const scrollContainerRef = useRef(null);
    const isOpenRef = useRef(isOpen);

    useEffect(() => {
        isOpenRef.current = isOpen;
        if (isOpen) {
            setUnreadCount(0);
            setTimeout(() => {
                msgsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            }, 100);
        }
    }, [isOpen]);
    useEffect(() => {
        let isMounted = true;
        async function fetchHistory() {
            try {
                const res = await fetch('/api/chat');
                if (!res.ok) return;
                const data = await res.json();
                if (isMounted && Array.isArray(data.msgs)) {
                    setMsgs(data.msgs);
                }
            } catch {}
        }
        fetchHistory();

        const src = new EventSource('/api/events');
        src.addEventListener('chat', (e) => {
            try {
                const msg = JSON.parse(e.data);
                setMsgs((prev) => {
                    if (prev.some((m) => m.id === msg.id)) return prev;
                    return [...prev, msg];
                });
                if (!isOpenRef.current) {
                    setUnreadCount((c) => c + 1);
                }
            } catch {}
        });

        return () => {
            isMounted = false;
            src.close();
        };
    }, []);

    useEffect(() => {
        if (isOpen) {
            msgsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [msgs, isOpen]);
    async function handleSend(e) {
        e.preventDefault();
        const trimmed = text.trim();
        if (!trimmed || sending) return;
        setSending(true);
        try {
            const headers = { 'Content-Type': 'application/json' };
            const currentUser = auth.currentUser;
            if (currentUser) {
                const token = await currentUser.getIdToken();
                headers.Authorization = `Bearer ${token}`;
            }
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    text: trimmed,
                    guestName: !currentUser ? guestName : undefined
                })
            });

            if (res.ok) {
                setText('');
            }
        } catch {} finally {
            setSending(false);
        }
    }

    function handleSaveGuestName(e) {
        e.preventDefault();
        const trimmed = guestInput.trim().slice(0, 20);
        if (trimmed) {
            setGuestName(trimmed);
            localStorage.setItem('onesong_chat_guest', trimmed);
        }
        setIsEditingGuest(false);
    }
    const currSenderName = user ? (profile?.displayName || profile?.username || user.displayName || 'You') : guestName;

    return (
        <div className="live-chat-wrapper">
            {isOpen && (
                <div className="live-chat-card">
                    <div className="live-chat-header">
                        <div className="live-chat-title-row">
                            <span className="live-chat-dot" />
                            <h3 className="live-chat-title">Live Chat</h3>
                        </div>
                        <button type="button" className="live-chat-close-btn" onClick={() => setIsOpen(false)} aria-label="Close Chat">
                            <X size={18} strokeWidth={2} className="text-current" />
                        </button>
                    </div>

                    <div className="live-chat-messages" ref={scrollContainerRef}>
                        {msgs.length === 0 ? (
                            <div className="live-chat-empty">
                                <span>No msgs yet.</span>
                                <span>Say hi to everyone listening!</span>
                            </div>
                        ) : (
                            msgs.map((m) => {
                                const isMe = (user && m.uid && m.uid === user.uid) || (!user && m.displayName === guestName);
                                const initial = (m.displayName || 'U')[0].toUpperCase();
                                const avatarColor = getAvatarColor(m.displayName || m.uid);
                                return (
                                    <div key={m.id} className={`live-chat-msg ${isMe ? 'live-chat-msg--me' : ''}`}>
                                        <div className="live-chat-avatar" style={{ backgroundColor: avatarColor }}>
                                            {initial}
                                        </div>
                                        <div className="live-chat-body">
                                            <div className="live-chat-meta">
                                                <span className="live-chat-sender">{m.displayName}</span>
                                                {m.isGuest && <span className="live-chat-guest-tag">guest</span>}
                                                <span className="live-chat-time">{formatChatTime(m.timestamp)}</span>
                                            </div>
                                            <div className="live-chat-bubble">{m.text}</div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                        <div ref={msgsEndRef} />
                    </div>
                    <div className="live-chat-footer">
                        {!user && (
                            <div className="live-chat-guest-bar">
                                {isEditingGuest ? (
                                    <form onSubmit={handleSaveGuestName} className="live-chat-guest-form">
                                        <input type="text" value={guestInput} onChange={(e) => setGuestInput(e.target.value)} placeholder="Enter nickname..." maxLength={20} autoFocus className="live-chat-guest-input" />
                                        <button type="submit" className="live-chat-guest-save">Save</button>
                                        <button type="button" onClick={() => setIsEditingGuest(false)} className="live-chat-guest-cancel">Cancel</button>
                                    </form>
                                ) : (
                                    <div className="live-chat-guest-info">
                                        <span>Chatting as <button type="button" className="live-chat-name-btn" onClick={() => { setGuestInput(guestName); setIsEditingGuest(true); }}>{guestName} (edit)</button></span>
                                        <button type="button" className="live-chat-signin-btn" onClick={onRequireLogin}>Sign in</button>
                                    </div>
                                )}
                            </div>
                        )}
                        <form onSubmit={handleSend} className="live-chat-input-row">
                            <input type="text" className="live-chat-input" placeholder={`Say smtg, ${currSenderName}...`} value={text} onChange={(e) => setText(e.target.value)} maxLength={280} />
                            <button type="submit" className="live-chat-send-btn" disabled={!text.trim() || sending} aria-label="Send Message">
                                <Send size={18} strokeWidth={2} className="text-current" />
                            </button>
                        </form>
                    </div>
                </div>
            )}
            <button type="button" className={`live-chat-fab ${isOpen ? 'live-chat-fab--active' : ''}`} onClick={() => setIsOpen((prev) => !prev)} aria-label={isOpen ? "Close live chat" : "Open live chat"} title={isOpen ? "Close chat" : "Open live chat"} >
                {isOpen ? (
                    <X size={22} strokeWidth={2} />
                ) : (
                    <MessageSquare size={22} strokeWidth={2} />
                )}
                {!isOpen && unreadCount > 0 && (
                    <span className="live-chat-badge">
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </button>
        </div>
    );
}