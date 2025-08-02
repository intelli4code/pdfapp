# PDF Annotator Configuration Guide

This application requires Firebase and Supabase configurations to function properly. Follow these steps to set up your environment:

## 1. Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or select an existing one
3. Go to Project Settings > General
4. Scroll down to "Your apps" section
5. Click "Add app" and select Web
6. Register your app and copy the configuration

## 2. Supabase Setup

1. Go to [Supabase](https://supabase.com/)
2. Create a new project
3. Go to Settings > API
4. Copy your Project URL and anon/public key

## 3. Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Firebase Configuration
REACT_APP_FIREBASE_API_KEY=your-firebase-api-key
REACT_APP_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=your-project-id
REACT_APP_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=123456789
REACT_APP_FIREBASE_APP_ID=your-app-id

# Supabase Configuration
REACT_APP_SUPABASE_URL=https://your-project.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your-supabase-anon-key

# App Configuration
REACT_APP_APP_ID=pdf-annotator
```

## 4. Manual Configuration (Alternative)

If you prefer to configure directly in the code, edit `src/config.js` and replace the placeholder values:

```javascript
export const config = {
  firebase: {
    apiKey: "your-actual-api-key",
    authDomain: "your-project.firebaseapp.com",
    projectId: "your-project-id",
    storageBucket: "your-project.appspot.com",
    messagingSenderId: "123456789",
    appId: "your-app-id"
  },
  
  supabase: {
    url: "https://your-project.supabase.co",
    anonKey: "your-actual-anon-key"
  },
  
  appId: "pdf-annotator"
};
```

## 5. Supabase Storage Setup

1. In your Supabase project, go to Storage
2. Create a new bucket called `pdf_documents`
3. Set the bucket to public (or configure RLS policies as needed)

## 6. Firebase Firestore Setup

1. In your Firebase project, go to Firestore Database
2. Create a database if you haven't already
3. The app will automatically create the necessary collections and documents

## Troubleshooting

- **"Firebase not configured" error**: Make sure your Firebase configuration is correct in `src/config.js`
- **"Supabase not configured" error**: Verify your Supabase URL and anon key
- **Upload failures**: Check that your Supabase storage bucket exists and is properly configured
- **PDF loading issues**: Ensure your Firebase Firestore rules allow read/write access

## Security Notes

- Never commit your actual API keys to version control
- Use environment variables for production deployments
- Consider implementing proper authentication for production use
- Review and configure Firestore security rules appropriately