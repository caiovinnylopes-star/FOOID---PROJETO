import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";

export const firebaseConfig = {
  apiKey: "AIzaSyCFKQYJI8WuiLXWdiFmMiVB_YTvJm2VUpg",
  authDomain: "gen-lang-client-0666268988.firebaseapp.com",
  projectId: "gen-lang-client-0666268988",
  storageBucket: "gen-lang-client-0666268988.firebasestorage.app",
  messagingSenderId: "1053594802498",
  appId: "1:1053594802498:web:001475f5ca348149f850db"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true
}, "ai-studio-bfbe49e9-cabd-47ed-89ed-ad423e79eeb8");
