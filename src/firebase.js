import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAmF0G0bFksF8tc3tYlIYqAG1SDzZcA05g",
  authDomain: "lure-log.firebaseapp.com",
  projectId: "lure-log",
  storageBucket: "lure-log.firebasestorage.app",
  messagingSenderId: "279179424592",
  appId: "1:279179424592:web:640971c0d5b7b7eea73255"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// すべてのデータを1つのドキュメントにまとめて保存する設計
// コレクション: lurelog / ドキュメントID: main-data
const DOC_REF = doc(db, "lurelog", "main-data");

export async function loadData() {
  try {
    const snap = await getDoc(DOC_REF);
    if (snap.exists()) {
      return snap.data();
    }
    return null;
  } catch (e) {
    console.error("Firestore load error", e);
    return null;
  }
}

export async function saveData(data) {
  try {
    await setDoc(DOC_REF, data);
  } catch (e) {
    console.error("Firestore save error", e);
  }
}
