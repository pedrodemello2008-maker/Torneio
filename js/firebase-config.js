// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCDIQoUN-4fNA9p-x-x8u1Iqix8r-fiBsU",
  authDomain: "torneio-robotica.firebaseapp.com",
  projectId: "torneio-robotica",
  storageBucket: "torneio-robotica.firebasestorage.app",
  messagingSenderId: "523431995851",
  appId: "1:523431995851:web:4add844a33a1b6d683ee4e",
  measurementId: "G-WJXVTPXXFB"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
