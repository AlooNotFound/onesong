import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signInAnonymously, 
  signOut 
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyBjf3xRygocKZDcQHLfP2VUAQeQHYzUs8w',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'one-song-internet.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'one-song-internet',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:576822389770:web:ccb31948d923b9cae383f3',
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export async function loginWithGoogle() {
  return signInWithPopup(auth, googleProvider);
}

export async function loginAnonymously() {
  return signInAnonymously(auth);
}

export async function logout() {
  return signOut(auth);
}

export default app;
