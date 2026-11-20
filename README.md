# OneSong
One song playing for everyone on the internet at the exact same second. *(PS: i realized later that normal radios literally do the same thing, but radios play boring ads and never play what you actually want)*

<img width="2560" height="1388" alt="image" src="https://github.com/user-attachments/assets/b0e5df33-4c54-4b2a-bd6b-25fa8372d1ab" />

---

### why I made this

yk that feeling where you open spotify or yt and spend alot of time just scrolling trying to decide what to listen to? i have it alottt so now oneSong fixes that. you literally just open the website and music is already playing.

---

### what you can do

- **vote to skip** - if a song comes on and majority of the people hate it, everyone can vote to skip and it immediately jumps to the next track.
- **live chat** - chat room right beside the player so you can talk to whoever's listening with you in real time.
- **suggest music** - drop any youtube link (or even an entire playlist link). it gets sent to the queue for the admin to review and add into the broadcast rotation.
---

### tech stack

- **Frontend:** React + Vite
- **Backend:** Node.js + Express
- **Database & Auth:** Firebase Firestore & Auth
- **Audio pipeline:** yt-dlp + ffmpeg

---

### running locally

1. **clone the repo**
   ```bash
   git clone https://github.com/AlooNotFound/onesong.git
   cd onesong
   ```

2. **install dependencies**
   ```bash
   npm install
   ```

3. **start dev mode** (runs both client & server)
   ```bash
   npm run dev
   ```

client runs on `http://localhost:5173` and backend runs on `http://localhost:5387`.

---
