# PDF Annotator

A modern, responsive React web application for PDF annotation and management. Upload, view, annotate, and manage your PDF documents with persistent annotations across sessions and devices.

## Features

### 🔐 User Authentication
- Firebase Authentication integration
- User-specific data isolation
- Secure access control

### 📄 PDF Management
- Upload PDF files from local machine
- Store PDFs securely in Supabase Storage
- List all user's uploaded PDFs
- Delete PDFs with cleanup from both storage and database

### ✏️ PDF Annotation
- Interactive PDF viewer using react-pdf
- Custom annotation layer with HTML Canvas
- Two annotation tools:
  - **Highlight Tool**: Semi-transparent yellow rectangles
  - **Marker Tool**: Semi-transparent red rectangles
- Real-time annotation drawing with preview
- Page-by-page annotation management

### 💾 Data Persistence
- Annotations saved automatically to Firestore
- Seamless cross-session and cross-device annotation persistence
- Structured data storage: `artifacts/{appId}/users/{userId}/pdfs/{pdfId}`

### 📥 Export & Download
- Download original PDF files
- Export annotations as structured JSON files
- Preserve annotation metadata and positioning

### 🎨 User Interface
- Modern, responsive design with Tailwind CSS
- Intuitive toolbar with zoom controls and page navigation
- Loading states and progress indicators
- Custom modal system for user feedback
- Mobile-friendly responsive layout

## Prerequisites

Before running this application, ensure you have:

1. **Node.js** (version 16 or higher)
2. **Firebase Project** with:
   - Firestore Database enabled
   - Authentication configured
3. **Supabase Project** with:
   - Storage bucket named `pdf_documents`
   - Appropriate Row Level Security (RLS) policies

## Installation

1. **Clone or download the project files**

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Firebase:**
   - The application expects global variables to be available:
     - `window.__firebase_config`: Your Firebase configuration object
     - `window.__app_id`: Your application ID for Firestore structure
     - `window.__initial_auth_token`: Initial authentication token

4. **Configure Supabase:**
   - Update the Supabase configuration in `App.js`:
   ```javascript
   const supabaseUrl = 'YOUR_SUPABASE_URL';
   const supabaseAnonKey = 'YOUR_SUPABASE_ANON_KEY';
   ```

5. **Set up Supabase Storage:**
   - Create a storage bucket named `pdf_documents`
   - Configure RLS policies to allow authenticated users access to their own files

## Project Structure

```
pdf-annotator/
├── public/
│   └── index.html          # Main HTML template
├── App.js                  # Main React component
├── index.js               # React application entry point
├── index.css              # Tailwind CSS and custom styles
├── package.json           # Dependencies and scripts
├── tailwind.config.js     # Tailwind CSS configuration
├── postcss.config.js      # PostCSS configuration
└── README.md              # This file
```

## Usage

### Starting the Application

```bash
npm start
```

The application will open in your browser at `http://localhost:3000`.

### Using the PDF Annotator

1. **Authentication**: Ensure you're logged in through Firebase Authentication
2. **Upload PDFs**: Use the upload section to select and upload PDF files
3. **View PDFs**: Click "Open" on any PDF in your library to start viewing
4. **Annotate**: 
   - Select either "Highlight" or "Marker" tool
   - Click and drag on the PDF to create annotations
   - Annotations are saved automatically
5. **Navigate**: Use page controls and zoom buttons to navigate through the PDF
6. **Export**: Download original PDFs or export annotations as JSON files
7. **Manage**: Delete PDFs when no longer needed

### Annotation Tools

- **Highlight Tool**: Creates yellow semi-transparent rectangles for highlighting text or areas
- **Marker Tool**: Creates red semi-transparent rectangles for marking important sections
- **Clear Page**: Removes all annotations from the current page

## Technical Implementation

### Architecture

The application follows a component-based architecture with:

- **State Management**: React hooks for local state management
- **Data Layer**: Firebase Firestore for metadata and annotations
- **File Storage**: Supabase Storage for PDF files
- **PDF Rendering**: react-pdf library with custom canvas overlay
- **Styling**: Tailwind CSS for responsive design

### Data Structure

**Firestore Document Structure:**
```javascript
{
  originalName: "document.pdf",
  storagePath: "userId/timestamp_filename.pdf",
  publicUrl: "https://...",
  uploadedAt: "2024-01-01T00:00:00.000Z",
  annotations_data: {
    "1": [  // Page number
      {
        x: 100,
        y: 50,
        width: 200,
        height: 20,
        color: "rgba(255, 255, 0, 0.3)",
        type: "highlight",
        timestamp: 1704067200000
      }
    ]
  }
}
```

### Key Features Implementation

1. **Canvas Overlay**: Custom HTML5 Canvas positioned absolutely over react-pdf pages
2. **Annotation Drawing**: Mouse event handlers for interactive rectangle drawing
3. **Data Persistence**: Real-time saves to Firestore using merge operations
4. **File Management**: Supabase Storage integration with progress tracking
5. **Responsive Design**: Tailwind CSS with mobile-first approach

## Browser Compatibility

- Chrome (recommended)
- Firefox
- Safari
- Edge

## Security Considerations

- All user data is isolated by Firebase UID
- Supabase RLS policies should restrict access to user's own files
- PDF files are stored with user-specific paths
- No server-side processing required for basic annotation functionality

## Performance Notes

- PDF.js worker is loaded from CDN for optimal performance
- Annotations are stored per-page to minimize data transfer
- File uploads show progress indicators
- Lazy loading of PDF pages for large documents

## Limitations

- Client-side only annotation (no server-side PDF manipulation)
- Annotations are overlay-based, not embedded in PDF
- Requires modern browser with Canvas API support
- Large PDFs may impact performance on lower-end devices

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is open source and available under the MIT License.

## Support

For issues or questions:
1. Check the browser console for error messages
2. Verify Firebase and Supabase configuration
3. Ensure all dependencies are properly installed
4. Check network connectivity for file uploads/downloads
