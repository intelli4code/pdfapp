# PDF Annotator

A modern, responsive React web application for PDF annotation and management. Upload, view, annotate, and manage your PDF documents with persistent annotations across sessions and devices.

## Features

### 🔐 User Authentication
- Supabase Authentication with email/password
- Login and signup functionality
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
- Annotations saved automatically to Supabase Database
- Seamless cross-session and cross-device annotation persistence
- Structured data storage in `pdfs` table with user isolation

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
2. **Supabase Project** with:
   - Authentication enabled
   - Storage bucket named `secondmain`
   - Database table `pdfs` created
   - Appropriate Row Level Security (RLS) policies

## Installation

1. **Clone or download the project files**

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up Supabase Database:**
   - Run the SQL commands from `supabase-setup.sql` in your Supabase SQL editor
   - This creates the `pdfs` table and sets up Row Level Security policies

4. **Set up Supabase Storage:**
   - Create a storage bucket named `secondmain`
   - Configure RLS policies for the bucket (see `supabase-setup.sql` comments)

5. **Configure Environment:**
   - The Supabase credentials are already configured in the application:
     - URL: `https://zfohraoldbaubkrjppec.supabase.co`
     - Anon Key: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

## Project Structure

```
pdf-annotator/
├── src/
│   ├── App.js             # Main React component
│   ├── index.js           # React application entry point
│   └── index.css          # Tailwind CSS and custom styles
├── public/
│   └── index.html         # Main HTML template
├── package.json           # Dependencies and scripts
├── tailwind.config.js     # Tailwind CSS configuration
├── postcss.config.js      # PostCSS configuration
├── supabase-setup.sql     # Database setup script
├── netlify.toml           # Netlify deployment configuration
└── README.md              # This file
```

## Usage

### Starting the Application

```bash
npm start
```

The application will open in your browser at `http://localhost:3000`.

### Using the PDF Annotator

1. **Authentication**: 
   - Click "Sign Up" to create a new account or "Log In" to access existing account
   - Use a valid email address and password (minimum 6 characters)
   - Check your email for confirmation link when signing up
2. **Upload PDFs**: Use the upload section to select and upload PDF files
3. **View PDFs**: Click "Open" on any PDF in your library to start viewing
4. **Annotate**: 
   - Select either "Highlight" or "Marker" tool
   - Click and drag on the PDF to create annotations
   - Annotations are saved automatically
5. **Navigate**: Use page controls and zoom buttons to navigate through the PDF
6. **Export**: Download original PDFs or export annotations as JSON files
7. **Manage**: Delete PDFs when no longer needed
8. **Logout**: Click the "Logout" button in the header to sign out

### Annotation Tools

- **Highlight Tool**: Creates yellow semi-transparent rectangles for highlighting text or areas
- **Marker Tool**: Creates red semi-transparent rectangles for marking important sections
- **Clear Page**: Removes all annotations from the current page

## Technical Implementation

### Architecture

The application follows a component-based architecture with:

- **State Management**: React hooks for local state management
- **Authentication**: Supabase Auth for user management
- **Data Layer**: Supabase Database for metadata and annotations
- **File Storage**: Supabase Storage for PDF files
- **PDF Rendering**: react-pdf library with custom canvas overlay
- **Styling**: Tailwind CSS for responsive design

### Data Structure

**Supabase Database Structure:**
```sql
-- pdfs table
{
  id: 1,
  user_id: "uuid-string",
  original_name: "document.pdf",
  storage_path: "userId/timestamp_filename.pdf",
  public_url: "https://...",
  uploaded_at: "2024-01-01T00:00:00.000Z",
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
3. **Authentication System**: Complete login/signup flow with Supabase Auth
4. **Data Persistence**: Real-time saves to Supabase Database with RLS
5. **File Management**: Supabase Storage integration with progress tracking
6. **Responsive Design**: Tailwind CSS with mobile-first approach

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
