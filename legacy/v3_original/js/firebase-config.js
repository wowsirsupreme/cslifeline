// js/firebase-config.js
import { initializeApp }              from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore }               from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth }                    from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey:            "AIzaSyCPdz5f1MqwPzw6RYRxDfYrSJ5ur96Ch_0",
  authDomain:        "cslifeline-63e76.firebaseapp.com",
  projectId:         "cslifeline-63e76",
  storageBucket:     "cslifeline-63e76.firebasestorage.app",
  messagingSenderId: "209375265757",
  appId:             "1:209375265757:web:927002d3a2b6f25a03ec34"
};

const app  = initializeApp(firebaseConfig);
export const db   = getFirestore(app);
export const auth = getAuth(app);
