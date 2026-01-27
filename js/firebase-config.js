// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// TODO: Replace the following with your app's Firebase project configuration
const firebaseConfig = {
  apiKey: "AIzaSyDqzH1XbWpgCYHXvAXDBDf5E8jVRuha4hA",
  authDomain: "pilatesflow-manager-ed72b.firebaseapp.com",
  projectId: "pilatesflow-manager-ed72b",
  storageBucket: "pilatesflow-manager-ed72b.firebasestorage.app",
  messagingSenderId: "269840334693",
  appId: "1:269840334693:web:1cc9167f946a882d326b8c"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { auth, db };
