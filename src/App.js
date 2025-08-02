import React, { useState, useEffect, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { createClient } from '@supabase/supabase-js';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;

// Initialize Supabase with your credentials
const supabaseUrl = 'https://zfohraoldbaubkrjppec.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpmb2hyYW9sZGJhdWJrcmpwcGVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5ODI0NzMsImV4cCI6MjA2OTU1ODQ3M30.CrCKNy0UEGmfaAvveKbI72IadyU9xQi3D91BlMGomy4';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

function App() {
  // Authentication state
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState('login'); // 'login' or 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // PDF management state
  const [pdfs, setPdfs] = useState([]);
  const [selectedPdf, setSelectedPdf] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [loading, setLoading] = useState(false);

  // PDF viewer state
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pdfScale, setPdfScale] = useState(1.0);

  // Annotation state
  const [annotations, setAnnotations] = useState({});
  const [currentTool, setCurrentTool] = useState('highlight'); // 'highlight' or 'marker'
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });

  // Refs
  const canvasRef = useRef(null);
  const pdfViewerRef = useRef(null);
  const fileInputRef = useRef(null);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [modalMessage, setModalMessage] = useState('');
  const [modalType, setModalType] = useState('info'); // 'info', 'error', 'success'

  // Initialize authentication
  useEffect(() => {
    // Get initial session
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
      setAuthLoading(false);
      if (session?.user) {
        loadUserPdfs(session.user.id);
      }
    };

    getSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadUserPdfs(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Show modal helper
  const showModalMessage = (message, type = 'info') => {
    setModalMessage(message);
    setModalType(type);
    setShowModal(true);
  };

  // Load user's PDFs from Supabase
  const loadUserPdfs = async (userId) => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('pdfs')
        .select('*')
        .eq('user_id', userId)
        .order('uploaded_at', { ascending: false });
      
      if (error) throw error;
      
      setPdfs(data || []);
    } catch (error) {
      console.error('Error loading PDFs:', error);
      showModalMessage('Failed to load PDFs. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Handle PDF file upload
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file || file.type !== 'application/pdf') {
      showModalMessage('Please select a valid PDF file.', 'error');
      return;
    }

    if (!user) {
      showModalMessage('You must be logged in to upload files.', 'error');
      return;
    }

    try {
      setIsUploading(true);
      setUploadProgress(0);

      // Create unique file path
      const timestamp = Date.now();
      const filePath = `${user.uid}/${timestamp}_${file.name}`;

      // Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from('secondmain')
        .upload(filePath, file, {
          onUploadProgress: (progress) => {
            setUploadProgress((progress.loaded / progress.total) * 100);
          }
        });

      if (error) throw error;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('secondmain')
        .getPublicUrl(filePath);

      // Save metadata to Supabase
      const pdfMetadata = {
        user_id: user.id,
        original_name: file.name,
        storage_path: filePath,
        public_url: publicUrl,
        uploaded_at: new Date().toISOString(),
        annotations_data: {}
      };

      const { error: dbError } = await supabase
        .from('pdfs')
        .insert([pdfMetadata]);

      if (dbError) throw dbError;

      // Refresh PDF list
      await loadUserPdfs(user.id);
      showModalMessage('PDF uploaded successfully!', 'success');

    } catch (error) {
      console.error('Upload error:', error);
      showModalMessage('Failed to upload PDF. Please try again.', 'error');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Open PDF for viewing
  const openPdf = (pdf) => {
    setSelectedPdf(pdf);
    setPageNumber(1);
    setAnnotations(pdf.annotations_data || {});
  };

  // Close PDF viewer
  const closePdfViewer = () => {
    setSelectedPdf(null);
    setAnnotations({});
    setPageNumber(1);
    setNumPages(null);
  };

  // Handle PDF document load success
  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
  };

  // Handle page render success - setup canvas overlay
  const onPageRenderSuccess = () => {
    if (canvasRef.current && pdfViewerRef.current) {
      const pdfPage = pdfViewerRef.current.querySelector('.react-pdf__Page__canvas');
      if (pdfPage) {
        const canvas = canvasRef.current;
        canvas.width = pdfPage.width;
        canvas.height = pdfPage.height;
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.pointerEvents = 'auto';
        
        // Redraw existing annotations for current page
        redrawAnnotations();
      }
    }
  };

  // Redraw annotations on canvas
  const redrawAnnotations = () => {
    if (!canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const pageAnnotations = annotations[pageNumber] || [];
    pageAnnotations.forEach(annotation => {
      ctx.fillStyle = annotation.color;
      ctx.fillRect(annotation.x, annotation.y, annotation.width, annotation.height);
    });
  };

  // Handle mouse down on canvas (start drawing annotation)
  const handleMouseDown = (event) => {
    if (!canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    setIsDrawing(true);
    setStartPos({ x, y });
  };

  // Handle mouse move on canvas (preview annotation)
  const handleMouseMove = (event) => {
    if (!isDrawing || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const currentX = event.clientX - rect.left;
    const currentY = event.clientY - rect.top;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    // Clear and redraw existing annotations
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    redrawAnnotations();

    // Draw preview of current annotation
    const width = currentX - startPos.x;
    const height = currentY - startPos.y;
    
    ctx.fillStyle = currentTool === 'highlight' 
      ? 'rgba(255, 255, 0, 0.3)' // Yellow highlight
      : 'rgba(255, 0, 0, 0.3)';   // Red marker

    ctx.fillRect(startPos.x, startPos.y, width, height);
  };

  // Handle mouse up on canvas (finish drawing annotation)
  const handleMouseUp = async (event) => {
    if (!isDrawing || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const endX = event.clientX - rect.left;
    const endY = event.clientY - rect.top;

    const width = endX - startPos.x;
    const height = endY - startPos.y;

    // Only save annotation if it has meaningful size
    if (Math.abs(width) > 5 && Math.abs(height) > 5) {
      const newAnnotation = {
        x: Math.min(startPos.x, endX),
        y: Math.min(startPos.y, endY),
        width: Math.abs(width),
        height: Math.abs(height),
        color: currentTool === 'highlight' 
          ? 'rgba(255, 255, 0, 0.3)' 
          : 'rgba(255, 0, 0, 0.3)',
        type: currentTool,
        timestamp: Date.now()
      };

      // Update local annotations state
      const updatedAnnotations = { ...annotations };
      if (!updatedAnnotations[pageNumber]) {
        updatedAnnotations[pageNumber] = [];
      }
      updatedAnnotations[pageNumber].push(newAnnotation);
      setAnnotations(updatedAnnotations);

      // Save to Firestore
      await saveAnnotations(updatedAnnotations);
    }

    setIsDrawing(false);
    redrawAnnotations();
  };

  // Save annotations to Supabase
  const saveAnnotations = async (annotationsData) => {
    if (!selectedPdf || !user) return;

    try {
      const { error } = await supabase
        .from('pdfs')
        .update({ annotations_data: annotationsData })
        .eq('id', selectedPdf.id)
        .eq('user_id', user.id);

      if (error) throw error;
    } catch (error) {
      console.error('Error saving annotations:', error);
      showModalMessage('Failed to save annotations. Please try again.', 'error');
    }
  };

  // Clear annotations for current page
  const clearPageAnnotations = async () => {
    const updatedAnnotations = { ...annotations };
    updatedAnnotations[pageNumber] = [];
    setAnnotations(updatedAnnotations);
    await saveAnnotations(updatedAnnotations);
    redrawAnnotations();
  };

  // Download original PDF
  const downloadPdf = async (pdf) => {
    try {
      const { data, error } = await supabase.storage
        .from('secondmain')
        .download(pdf.storage_path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = pdf.original_name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showModalMessage('PDF downloaded successfully!', 'success');
    } catch (error) {
      console.error('Download error:', error);
      showModalMessage('Failed to download PDF. Please try again.', 'error');
    }
  };

  // Export annotations as JSON
  const exportAnnotations = (pdf) => {
    const annotationsData = {
      pdfName: pdf.original_name,
      exportedAt: new Date().toISOString(),
      annotations: pdf.annotations_data || {}
    };

    const blob = new Blob([JSON.stringify(annotationsData, null, 2)], {
      type: 'application/json'
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${pdf.original_name.replace('.pdf', '')}_annotations.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showModalMessage('Annotations exported successfully!', 'success');
  };

  // Authentication functions
  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      setShowAuthModal(false);
      setEmail('');
      setPassword('');
      showModalMessage('Successfully logged in!', 'success');
    } catch (error) {
      console.error('Login error:', error);
      showModalMessage(error.message || 'Failed to log in. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) throw error;

      showModalMessage('Check your email for the confirmation link!', 'success');
      setShowAuthModal(false);
      setEmail('');
      setPassword('');
    } catch (error) {
      console.error('Signup error:', error);
      showModalMessage(error.message || 'Failed to sign up. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      
      setPdfs([]);
      setSelectedPdf(null);
      showModalMessage('Successfully logged out!', 'success');
    } catch (error) {
      console.error('Logout error:', error);
      showModalMessage('Failed to log out. Please try again.', 'error');
    }
  };

  // Delete PDF
  const deletePdf = async (pdf) => {
    try {
      setLoading(true);

      // Delete from Supabase Storage
      const { error: storageError } = await supabase.storage
        .from('secondmain')
        .remove([pdf.storage_path]);

      if (storageError) {
        console.error('Storage deletion error:', storageError);
        // Continue with database deletion even if storage deletion fails
      }

      // Delete from Supabase database
      const { error: dbError } = await supabase
        .from('pdfs')
        .delete()
        .eq('id', pdf.id)
        .eq('user_id', user.id);

      if (dbError) throw dbError;

      // Refresh PDF list
      await loadUserPdfs(user.id);
      showModalMessage('PDF deleted successfully!', 'success');

      // Close viewer if this PDF was being viewed
      if (selectedPdf && selectedPdf.id === pdf.id) {
        closePdfViewer();
      }

    } catch (error) {
      console.error('Delete error:', error);
      showModalMessage('Failed to delete PDF. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Redraw annotations when page changes
  useEffect(() => {
    redrawAnnotations();
  }, [pageNumber, annotations]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-800 mb-4">PDF Annotator</h1>
          <p className="text-gray-600 mb-6">Please log in to access your PDF documents</p>
          <div className="space-x-4">
            <button
              onClick={() => {
                setAuthMode('login');
                setShowAuthModal(true);
              }}
              className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              Log In
            </button>
            <button
              onClick={() => {
                setAuthMode('signup');
                setShowAuthModal(true);
              }}
              className="px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
            >
              Sign Up
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">PDF Annotator</h1>
              <p className="text-sm text-gray-600">User: {user.email}</p>
              <p className="text-xs text-gray-500">ID: {user.id}</p>
            </div>
            <div className="flex items-center space-x-4">
              {selectedPdf && (
                <button
                  onClick={closePdfViewer}
                  className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
                >
                  ← Back to Library
                </button>
              )}
              <button
                onClick={handleLogout}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!selectedPdf ? (
          /* PDF Library View */
          <div>
            {/* Upload Section */}
            <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Upload PDF</h2>
              <div className="flex items-center space-x-4">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  onChange={handleFileUpload}
                  disabled={isUploading}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                {isUploading && (
                  <div className="flex items-center space-x-2">
                    <div className="w-32 bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      ></div>
                    </div>
                    <span className="text-sm text-gray-600">{Math.round(uploadProgress)}%</span>
                  </div>
                )}
              </div>
            </div>

            {/* PDF List */}
            <div className="bg-white rounded-lg shadow-sm">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900">Your PDFs</h2>
              </div>
              
              {loading ? (
                <div className="p-8 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                  <p className="mt-2 text-gray-600">Loading PDFs...</p>
                </div>
              ) : pdfs.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <p>No PDFs uploaded yet. Upload your first PDF to get started!</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {pdfs.map((pdf) => (
                    <div key={pdf.id} className="p-6 hover:bg-gray-50 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <h3 className="text-lg font-medium text-gray-900">{pdf.original_name}</h3>
                          <p className="text-sm text-gray-500">
                            Uploaded: {new Date(pdf.uploaded_at).toLocaleDateString()}
                          </p>
                          <p className="text-sm text-gray-500">
                            Annotations: {Object.keys(pdf.annotations_data || {}).length} pages
                          </p>
                        </div>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => openPdf(pdf)}
                            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                          >
                            Open
                          </button>
                          <button
                            onClick={() => downloadPdf(pdf)}
                            className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                          >
                            Download
                          </button>
                          <button
                            onClick={() => exportAnnotations(pdf)}
                            className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors"
                          >
                            Export
                          </button>
                          <button
                            onClick={() => deletePdf(pdf)}
                            className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* PDF Viewer */
          <div className="bg-white rounded-lg shadow-sm">
            {/* Toolbar */}
            <div className="p-4 border-b border-gray-200 flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center space-x-4">
                <h2 className="text-lg font-semibold text-gray-900">{selectedPdf.original_name}</h2>
                
                {/* Page Navigation */}
                {numPages && (
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setPageNumber(Math.max(1, pageNumber - 1))}
                      disabled={pageNumber <= 1}
                      className="px-3 py-1 bg-gray-200 text-gray-700 rounded disabled:opacity-50 hover:bg-gray-300 transition-colors"
                    >
                      ←
                    </button>
                    <span className="text-sm text-gray-600">
                      Page {pageNumber} of {numPages}
                    </span>
                    <button
                      onClick={() => setPageNumber(Math.min(numPages, pageNumber + 1))}
                      disabled={pageNumber >= numPages}
                      className="px-3 py-1 bg-gray-200 text-gray-700 rounded disabled:opacity-50 hover:bg-gray-300 transition-colors"
                    >
                      →
                    </button>
                  </div>
                )}

                {/* Zoom Controls */}
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setPdfScale(Math.max(0.5, pdfScale - 0.1))}
                    className="px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
                  >
                    -
                  </button>
                  <span className="text-sm text-gray-600">{Math.round(pdfScale * 100)}%</span>
                  <button
                    onClick={() => setPdfScale(Math.min(2.0, pdfScale + 0.1))}
                    className="px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Annotation Tools */}
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setCurrentTool('highlight')}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    currentTool === 'highlight'
                      ? 'bg-yellow-500 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  Highlight
                </button>
                <button
                  onClick={() => setCurrentTool('marker')}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    currentTool === 'marker'
                      ? 'bg-red-500 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  Marker
                </button>
                <button
                  onClick={clearPageAnnotations}
                  className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
                >
                  Clear Page
                </button>
              </div>
            </div>

            {/* PDF Viewer Container */}
            <div className="p-4">
              <div 
                ref={pdfViewerRef}
                className="relative inline-block border border-gray-300 shadow-lg"
                style={{ cursor: isDrawing ? 'crosshair' : 'crosshair' }}
              >
                <Document
                  file={selectedPdf.public_url}
                  onLoadSuccess={onDocumentLoadSuccess}
                  onLoadError={(error) => {
                    console.error('PDF load error:', error);
                    showModalMessage('Failed to load PDF. Please try again.', 'error');
                  }}
                >
                  <Page
                    pageNumber={pageNumber}
                    scale={pdfScale}
                    onRenderSuccess={onPageRenderSuccess}
                  />
                </Document>
                
                {/* Annotation Canvas Overlay */}
                <canvas
                  ref={canvasRef}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  className="absolute top-0 left-0 pointer-events-auto"
                  style={{ cursor: 'crosshair' }}
                />
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className={`text-lg font-semibold ${
                modalType === 'error' ? 'text-red-600' :
                modalType === 'success' ? 'text-green-600' :
                'text-blue-600'
              }`}>
                {modalType === 'error' ? 'Error' :
                 modalType === 'success' ? 'Success' :
                 'Information'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            <p className="text-gray-700 mb-4">{modalMessage}</p>
            <button
              onClick={() => setShowModal(false)}
              className={`w-full py-2 px-4 rounded-lg text-white transition-colors ${
                modalType === 'error' ? 'bg-red-500 hover:bg-red-600' :
                modalType === 'success' ? 'bg-green-500 hover:bg-green-600' :
                'bg-blue-500 hover:bg-blue-600'
              }`}
            >
              OK
            </button>
          </div>
        </div>
      )}

      {/* Authentication Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-gray-900">
                {authMode === 'login' ? 'Log In' : 'Sign Up'}
              </h3>
              <button
                onClick={() => setShowAuthModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            
            <form onSubmit={authMode === 'login' ? handleLogin : handleSignup}>
              <div className="mb-4">
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter your email"
                />
              </div>
              
              <div className="mb-6">
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                  Password
                </label>
                <input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter your password"
                />
              </div>
              
              <button
                type="submit"
                disabled={loading}
                className={`w-full py-3 px-4 rounded-lg text-white font-medium transition-colors ${
                  authMode === 'login'
                    ? 'bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300'
                    : 'bg-green-500 hover:bg-green-600 disabled:bg-green-300'
                }`}
              >
                {loading ? 'Processing...' : authMode === 'login' ? 'Log In' : 'Sign Up'}
              </button>
            </form>
            
            <div className="mt-4 text-center">
              <button
                onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
                className="text-sm text-blue-500 hover:text-blue-600"
              >
                {authMode === 'login' 
                  ? "Don't have an account? Sign up"
                  : "Already have an account? Log in"
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;