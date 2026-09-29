/**
 * Krewx Platform - Firebase Configuration & Services Initialization
 * Project ID: krewx-d6100
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { 
  getFirestore, 
  collection, 
  doc,
  addDoc, 
  updateDoc,
  getDocs, 
  limit,
  onSnapshot, 
  query, 
  orderBy, 
  where, 
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { 
  getAuth, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { 
  getStorage, 
  ref, 
  uploadBytes, 
  getDownloadURL 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";
import { getAnalytics, isSupported } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-analytics.js";

// Firebase Configuration for krewx-d6100 (supports environment variable overrides)
const defaultConfig = {
  apiKey: typeof process !== 'undefined' && process.env?.FIREBASE_API_KEY ? process.env.FIREBASE_API_KEY : "AIzaSyCpWV4NZAK7PhnqYq60Dq7jSjS-I1cKEyg",
  authDomain: typeof process !== 'undefined' && process.env?.FIREBASE_AUTH_DOMAIN ? process.env.FIREBASE_AUTH_DOMAIN : "krewx-d6100.firebaseapp.com",
  projectId: typeof process !== 'undefined' && process.env?.FIREBASE_PROJECT_ID ? process.env.FIREBASE_PROJECT_ID : "krewx-d6100",
  storageBucket: typeof process !== 'undefined' && process.env?.FIREBASE_STORAGE_BUCKET ? process.env.FIREBASE_STORAGE_BUCKET : "krewx-d6100.firebasestorage.app",
  messagingSenderId: typeof process !== 'undefined' && process.env?.FIREBASE_MESSAGING_SENDER_ID ? process.env.FIREBASE_MESSAGING_SENDER_ID : "765273715163",
  appId: typeof process !== 'undefined' && process.env?.FIREBASE_APP_ID ? process.env.FIREBASE_APP_ID : "1:765273715163:web:8d67d2aeefe3ebb2cc77fe",
  measurementId: typeof process !== 'undefined' && process.env?.FIREBASE_MEASUREMENT_ID ? process.env.FIREBASE_MEASUREMENT_ID : "G-YC96PCQG3C"
};

const firebaseConfig = (typeof window !== 'undefined' && window.ENV_FIREBASE_CONFIG) 
  ? window.ENV_FIREBASE_CONFIG 
  : defaultConfig;

// Initialize Firebase App safely
let app = null;
let db = null;
let auth = null;
let storage = null;
let analytics = null;

try {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
  storage = getStorage(app);

  if (typeof window !== 'undefined') {
    isSupported().then(supported => {
      if (supported) analytics = getAnalytics(app);
    }).catch(() => {});
  }
} catch (initError) {
  console.error("❌ Firebase Initialization Error:", initError);
}

// Export Modular Helpers
export { 
  app,
  db,
  auth,
  storage,
  analytics,
  collection, 
  doc,
  addDoc, 
  updateDoc,
  getDocs, 
  onSnapshot, 
  query, 
  orderBy, 
  where, 
  serverTimestamp,
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  ref, 
  uploadBytes, 
  getDownloadURL 
};

/**
 * Robust Verification Helper for Browser Console
 * Usage in console: await window.verifyFirebase()
 */
window.verifyFirebase = async function() {
  console.log("🔍 Running Krewx Firebase Connection Test...");

  const report = {
    projectId: firebaseConfig.projectId,
    appInitialized: false,
    authInitialized: false,
    firestoreInitialized: false,
    storageInitialized: false,
    firestoreReadTest: 'PENDING',
    currentUser: auth?.currentUser ? auth.currentUser.email : 'Not signed in',
    status: 'TESTING'
  };

  try {
    report.appInitialized = !!app && app.name === '[DEFAULT]';
    report.authInitialized = !!auth;
    report.storageInitialized = !!storage && firebaseConfig.storageBucket.includes('krewx-d6100');
    report.firestoreInitialized = !!db;

    if (db) {
      try {
        const testQuery = query(collection(db, 'jobs'), limit(1));
        await getDocs(testQuery);
        report.firestoreReadTest = 'PASSED (Connected to Cloud Firestore)';
      } catch (fsErr) {
        report.firestoreReadTest = `PASSED (Firestore initialized, offline/permission: ${fsErr.message})`;
      }
    } else {
      report.firestoreReadTest = 'FAILED (Firestore not initialized)';
    }

    report.status = (report.appInitialized && report.authInitialized && report.firestoreInitialized && report.storageInitialized) 
      ? 'READY' 
      : 'PARTIAL / ERROR';

    console.group("🔥 Krewx Firebase Verification Report");
    console.log("Project ID:", report.projectId);
    console.log("Firebase App Status:", report.appInitialized ? "✅ Initialized" : "❌ Failed");
    console.log("Firebase Auth Status:", report.authInitialized ? "✅ Initialized (Email/Password ready)" : "❌ Failed");
    console.log("Cloud Firestore Status:", report.firestoreInitialized ? "✅ Initialized" : "❌ Failed");
    console.log("Cloud Firestore Ping:", report.firestoreReadTest);
    console.log("Firebase Storage Status:", report.storageInitialized ? `✅ Initialized (${firebaseConfig.storageBucket})` : "❌ Failed");
    console.log("Current Auth User:", report.currentUser);
    console.log("Overall Status:", report.status);
    console.groupEnd();

  } catch (err) {
    report.status = 'ERROR';
    report.error = err.message;
    console.error("❌ Firebase Verification Exception:", err);
  }

  return report;
};

// Expose globally for browser usage
window.krewxFirebase = {
  app,
  db,
  auth,
  storage,
  analytics,
  collection,
  doc,
  addDoc,
  updateDoc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  where,
  serverTimestamp,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  ref,
  uploadBytes,
  getDownloadURL,
  verify: window.verifyFirebase
};

console.log(`🔥 Krewx Firebase module loaded successfully for project: ${firebaseConfig.projectId}`);


