import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCFKQYJI8WuiLXWdiFmMiVB_YTvJm2VUpg",
  authDomain: "gen-lang-client-0666268988.firebaseapp.com",
  projectId: "gen-lang-client-0666268988",
  storageBucket: "gen-lang-client-0666268988.firebasestorage.app",
  messagingSenderId: "1053594802498",
  appId: "1:1053594802498:web:001475f5ca348149f850db"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
