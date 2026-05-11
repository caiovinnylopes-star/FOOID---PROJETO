import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDummyKeyForBuildToSucceed12345678",
  authDomain: "gen-lang-client-0666268988.firebaseapp.com",
  projectId: "gen-lang-client-0666268988",
  storageBucket: "gen-lang-client-0666268988.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef1234567890"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
