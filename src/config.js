// Configuration for Firebase and Supabase
// Replace these with your actual values

export const config = {
  // Firebase Configuration
  firebase: {
    apiKey: process.env.REACT_APP_FIREBASE_API_KEY || "your-api-key",
    authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || "your-project.firebaseapp.com",
    projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || "your-project-id",
    storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || "your-project.appspot.com",
    messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || "123456789",
    appId: process.env.REACT_APP_FIREBASE_APP_ID || "your-app-id"
  },
  
  // Supabase Configuration
  supabase: {
    url: process.env.REACT_APP_SUPABASE_URL || "https://your-project.supabase.co",
    anonKey: process.env.REACT_APP_SUPABASE_ANON_KEY || "your-anon-key"
  },
  
  // App Configuration
  appId: process.env.REACT_APP_APP_ID || "pdf-annotator"
};

// Set global variables for backward compatibility
if (typeof window !== 'undefined') {
  window.__firebase_config = config.firebase;
  window.__app_id = config.appId;
}