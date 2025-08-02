import React, { useState, useEffect, useRef, useCallback, Suspense, lazy } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';

// Lazy load components for better performance
const LazyPDFViewer = lazy(() => import('./components/PDFViewer'));
import { createClient } from '@supabase/supabase-js';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  deleteDoc, 
  query, 
  orderBy 
} from 'firebase/firestore';
import { initializeApp } from 'firebase/app';
import LoadingSpinner from './LoadingSpinner';

// Configure PDF.js worker with optimized settings for better performance
if (typeof window !== 'undefined') {
  // Use local worker for better performance
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.js',
    import.meta.url,
  ).toString();
  
  // Optimize PDF.js settings for faster loading
  pdfjs.GlobalWorkerOptions.maxImageSize = 50 * 1024 * 1024; // 50MB
  pdfjs.GlobalWorkerOptions.cMapPacked = true;
}

// Lazy load Firebase and Supabase configurations
let app, db, supabase;

const initializeFirebase = () => {
  if (!app && window.__firebase_config) {
    app = initializeApp(window.__firebase_config);
    db = getFirestore(app);
  }
  return { app, db };
};

const initializeSupabase = () => {
  if (!supabase) {
    const supabaseUrl = 'YOUR_SUPABASE_URL';
    const supabaseAnonKey = 'YOUR_SUPABASE_ANON_KEY';
    supabase = createClient(supabaseUrl, supabaseAnonKey);
  }
  return supabase;
};

// App ID for Firestore structure
const appId = window.__app_id;

// Helper function to generate anonymous user ID
const generateAnonymousId = () => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 12; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
};

// Helper function to save user ID to localStorage
const saveUserIdToStorage = (userId) => {
  localStorage.setItem('pdf_annotator_user_id', userId);
  const savedIds = JSON.parse(localStorage.getItem('pdf_annotator_saved_ids') || '[]');
  if (!savedIds.includes(userId)) {
    savedIds.unshift(userId);
    // Keep only last 5 IDs
    localStorage.setItem('pdf_annotator_saved_ids', JSON.stringify(savedIds.slice(0, 5)));
  }
};

// Helper function to get saved user IDs
const getSavedUserIds = () => {
  return JSON.parse(localStorage.getItem('pdf_annotator_saved_ids') || '[]');
};

function App() {
  // User state (replacing authentication state)
  const [userId, setUserId] = useState(null);
  const [isUserIdSet, setIsUserIdSet] = useState(false);
  const [tempUserId, setTempUserId] = useState('');
  const [savedIds, setSavedIds] = useState([]);
  const [showIdInput, setShowIdInput] = useState(true);

  // PDF management state
  const [pdfs, setPdfs] = useState([]);
  const [selectedPdf, setSelectedPdf] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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

  // Initialize user ID
  useEffect(() => {
    const savedId = localStorage.getItem('pdf_annotator_user_id');
    const allSavedIds = getSavedUserIds();
    setSavedIds(allSavedIds);
    
    if (savedId) {
      setUserId(savedId);
      setIsUserIdSet(true);
      setShowIdInput(false);
      loadUserPdfs(savedId);
    } else {
      setTempUserId('');
      setShowIdInput(true);
    }
  }, []);

  // Handle creating anonymous user
  const handleAnonymousUser = () => {
    const anonymousId = generateAnonymousId();
    setUserId(anonymousId);
    setIsUserIdSet(true);
    setShowIdInput(false);
    saveUserIdToStorage(anonymousId);
    loadUserPdfs(anonymousId);
    showModalMessage(`Welcome! Your anonymous ID is: ${anonymousId}. Save this ID to access your files later.`, 'success');
  };

  // Handle custom user ID
  const handleCustomUserId = () => {
    if (!tempUserId.trim()) {
      showModalMessage('Please enter a valid user ID.', 'error');
      return;
    }
    
    if (tempUserId.length < 3) {
      showModalMessage('User ID must be at least 3 characters long.', 'error');
      return;
    }

    setUserId(tempUserId.trim());
    setIsUserIdSet(true);
    setShowIdInput(false);
    saveUserIdToStorage(tempUserId.trim());
    loadUserPdfs(tempUserId.trim());
    showModalMessage(`Welcome back! Using ID: ${tempUserId.trim()}`, 'success');
  };

  // Handle selecting saved ID
  const handleSelectSavedId = (savedId) => {
    setUserId(savedId);
    setIsUserIdSet(true);
    setShowIdInput(false);
    saveUserIdToStorage(savedId);
    loadUserPdfs(savedId);
    showModalMessage(`Welcome back! Using ID: ${savedId}`, 'success');
  };

  // Handle logout (switch user)
  const handleSwitchUser = () => {
    setUserId(null);
    setIsUserIdSet(false);
    setShowIdInput(true);
    setTempUserId('');
    setPdfs([]);
    setSelectedPdf(null);
    setSavedIds(getSavedUserIds());
  };

  // Show modal helper
  const showModalMessage = (message, type = 'info') => {
    setModalMessage(message);
    setModalType(type);
    setShowModal(true);
  };

  // Load user's PDFs from Firestore with lazy initialization
  const loadUserPdfs = useCallback(async (userId) => {
    try {
      setLoading(true);
      
      // Initialize Firebase lazily
      const { db: firestore } = initializeFirebase();
      if (!firestore) {
        throw new Error('Firebase not configured');
      }
      
      const pdfsRef = collection(firestore, `artifacts/${appId}/users/${userId}/pdfs`);
      const q = query(pdfsRef, orderBy('uploadedAt', 'desc'));
      const querySnapshot = await getDocs(q);
      
      const userPdfs = [];
      querySnapshot.forEach((doc) => {
        userPdfs.push({ id: doc.id, ...doc.data() });
      });
      
      setPdfs(userPdfs);
    } catch (error) {
      console.error('Error loading PDFs:', error);
      showModalMessage('Failed to load PDFs. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  }, [appId]);

  // Handle PDF file upload
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file || file.type !== 'application/pdf') {
      showModalMessage('Please select a valid PDF file.', 'error');
      return;
    }

    if (!userId) {
      showModalMessage('You must have a user ID to upload files.', 'error');
      return;
    }

    try {
      setIsUploading(true);
      setUploadProgress(0);

      // Create unique file path
      const timestamp = Date.now();
      const filePath = `${userId}/${timestamp}_${file.name}`;

      // Initialize Supabase lazily
      const supabaseClient = initializeSupabase();
      
      // Upload to Supabase Storage
      const { data, error } = await supabaseClient.storage
        .from('pdf_documents')
        .upload(filePath, file, {
          onUploadProgress: (progress) => {
            setUploadProgress((progress.loaded / progress.total) * 100);
          }
        });

      if (error) throw error;

      // Get public URL
      const { data: { publicUrl } } = supabaseClient.storage
        .from('pdf_documents')
        .getPublicUrl(filePath);

      // Save metadata to Firestore
      const pdfId = `pdf_${timestamp}`;
      const pdfMetadata = {
        originalName: file.name,
        storagePath: filePath,
        publicUrl: publicUrl,
        uploadedAt: new Date().toISOString(),
        annotations_data: {}
      };

      // Initialize Firebase lazily
      const { db: firestore } = initializeFirebase();
      
      await setDoc(
        doc(firestore, `artifacts/${appId}/users/${userId}/pdfs`, pdfId),
        pdfMetadata
      );

      // Refresh PDF list
      await loadUserPdfs(userId);
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

  // Save annotations to Firestore
  const saveAnnotations = async (annotationsData) => {
    if (!selectedPdf || !userId) return;

    try {
      await setDoc(
        doc(db, `artifacts/${appId}/users/${userId}/pdfs`, selectedPdf.id),
        { annotations_data: annotationsData },
        { merge: true }
      );
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
        .from('pdf_documents')
        .download(pdf.storagePath);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = pdf.originalName;
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
      pdfName: pdf.originalName,
      exportedAt: new Date().toISOString(),
      annotations: pdf.annotations_data || {}
    };

    const blob = new Blob([JSON.stringify(annotationsData, null, 2)], {
      type: 'application/json'
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${pdf.originalName.replace('.pdf', '')}_annotations.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showModalMessage('Annotations exported successfully!', 'success');
  };

  // Delete PDF
  const deletePdf = async (pdf) => {
    try {
      setLoading(true);

      // Delete from Supabase Storage
      const { error: storageError } = await supabase.storage
        .from('pdf_documents')
        .remove([pdf.storagePath]);

      if (storageError) {
        console.error('Storage deletion error:', storageError);
        // Continue with Firestore deletion even if storage deletion fails
      }

      // Delete from Firestore
      await deleteDoc(doc(db, `artifacts/${appId}/users/${userId}/pdfs`, pdf.id));

      // Refresh PDF list
      await loadUserPdfs(userId);
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

  if (!isUserIdSet) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">PDF Annotator</h1>
            <p className="text-gray-600">Choose how you'd like to continue</p>
          </div>

          <div className="bg-white rounded-2xl shadow-xl p-6 space-y-6">
            {/* Anonymous User Button */}
            <div>
              <button
                onClick={handleAnonymousUser}
                className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-semibold py-4 px-6 rounded-xl transition-all duration-200 transform hover:scale-105 shadow-lg hover:shadow-xl"
              >
                <div className="flex items-center justify-center space-x-3">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  <span>Create Anonymous Account</span>
                </div>
                <p className="text-green-100 text-sm mt-1">Get started instantly with a random ID</p>
              </button>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-white text-gray-500">or</span>
              </div>
            </div>

            {/* Custom ID Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Use Custom ID
              </label>
              <div className="space-y-3">
                <input
                  type="text"
                  value={tempUserId}
                  onChange={(e) => setTempUserId(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleCustomUserId()}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  placeholder="Enter your custom ID (min 3 characters)"
                />
                <button
                  onClick={handleCustomUserId}
                  disabled={!tempUserId.trim() || tempUserId.length < 3}
                  className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-xl transition-all duration-200"
                >
                  Continue with Custom ID
                </button>
              </div>
            </div>

            {/* Saved IDs */}
            {savedIds.length > 0 && (
              <>
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-200"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-4 bg-white text-gray-500">recent IDs</span>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Or select a previous ID
                  </label>
                  <div className="space-y-2">
                    {savedIds.map((savedId, index) => (
                      <button
                        key={index}
                        onClick={() => handleSelectSavedId(savedId)}
                        className="w-full text-left px-4 py-3 border border-gray-200 rounded-xl hover:border-blue-300 hover:bg-blue-50 transition-all duration-200 group"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-gray-700 font-medium group-hover:text-blue-700">
                            {savedId}
                          </span>
                          <svg className="w-5 h-5 text-gray-400 group-hover:text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="text-center mt-6">
            <p className="text-sm text-gray-500">
              Your ID will be saved locally for future access
            </p>
          </div>
        </div>
      </div>
    );
  }



  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <header className="bg-white shadow-lg border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">PDF Annotator</h1>
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-600">ID:</span>
                  <span className="text-sm font-mono bg-gray-100 px-2 py-1 rounded">{userId}</span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              {selectedPdf && (
                <button
                  onClick={closePdfViewer}
                  className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-all duration-200 flex items-center space-x-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                  <span>Back to Library</span>
                </button>
              )}
              
              <button
                onClick={handleSwitchUser}
                className="px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-all duration-200 flex items-center space-x-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                <span>Switch User</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!selectedPdf ? (
          /* PDF Library View */
          <div className="space-y-8">
            {/* Upload Section */}
            <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
              <div className="text-center mb-6">
                <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Upload PDF Document</h2>
                <p className="text-gray-600">Drag and drop a PDF file or click to browse</p>
              </div>
              
              <div className="relative">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  onChange={handleFileUpload}
                  disabled={isUploading}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                />
                <div className={`border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 ${
                  isUploading 
                    ? 'border-blue-300 bg-blue-50' 
                    : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'
                }`}>
                  {isUploading ? (
                    <div className="space-y-4">
                      <div className="w-full bg-gray-200 rounded-full h-3">
                        <div 
                          className="bg-gradient-to-r from-blue-500 to-indigo-600 h-3 rounded-full transition-all duration-300"
                          style={{ width: `${uploadProgress}%` }}
                        ></div>
                      </div>
                      <p className="text-blue-600 font-medium">Uploading... {Math.round(uploadProgress)}%</p>
                    </div>
                  ) : (
                    <div>
                      <svg className="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <p className="text-lg font-medium text-gray-700">Choose PDF File</p>
                      <p className="text-sm text-gray-500 mt-1">or drag and drop it here</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* PDF List */}
            <div className="bg-white rounded-2xl shadow-xl border border-gray-100">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">Your PDF Library</h2>
                    <p className="text-gray-600 mt-1">{pdfs.length} {pdfs.length === 1 ? 'document' : 'documents'}</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                  </div>
                </div>
              </div>
              
              {loading ? (
                <LoadingSpinner message="Loading your documents..." size="large" />
              ) : pdfs.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="w-20 h-20 mx-auto mb-4 bg-gray-100 rounded-2xl flex items-center justify-center">
                    <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">No documents yet</h3>
                  <p className="text-gray-500">Upload your first PDF to get started with annotations!</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {pdfs.map((pdf) => (
                    <div key={pdf.id} className="p-6 hover:bg-gray-50 transition-all duration-200">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-3">
                            <div className="w-12 h-12 bg-gradient-to-r from-red-500 to-pink-500 rounded-xl flex items-center justify-center flex-shrink-0">
                              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                            </div>
                            <div className="min-w-0 flex-1">
                              <h3 className="text-lg font-semibold text-gray-900 truncate">{pdf.originalName}</h3>
                              <div className="flex items-center space-x-4 mt-1">
                                <p className="text-sm text-gray-500">
                                  📅 {new Date(pdf.uploadedAt).toLocaleDateString()}
                                </p>
                                <p className="text-sm text-gray-500">
                                  📝 {Object.keys(pdf.annotations_data || {}).length} annotated pages
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2 ml-4">
                          <button
                            onClick={() => openPdf(pdf)}
                            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all duration-200 flex items-center space-x-2 shadow-sm"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                            <span>Open</span>
                          </button>
                          <button
                            onClick={() => downloadPdf(pdf)}
                            className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-all duration-200 flex items-center space-x-2 shadow-sm"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            <span>Download</span>
                          </button>
                          <button
                            onClick={() => exportAnnotations(pdf)}
                            className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-all duration-200 flex items-center space-x-2 shadow-sm"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <span>Export</span>
                          </button>
                          <button
                            onClick={() => deletePdf(pdf)}
                            className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-all duration-200 flex items-center space-x-2 shadow-sm"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            <span>Delete</span>
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
                <h2 className="text-lg font-semibold text-gray-900">{selectedPdf.originalName}</h2>
                
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
            <Suspense fallback={<LoadingSpinner message="Loading PDF viewer..." size="large" />}>
              <LazyPDFViewer
                selectedPdf={selectedPdf}
                pageNumber={pageNumber}
                pdfScale={pdfScale}
                onDocumentLoadSuccess={onDocumentLoadSuccess}
                onPageRenderSuccess={onPageRenderSuccess}
                showModalMessage={showModalMessage}
                canvasRef={canvasRef}
                pdfViewerRef={pdfViewerRef}
                handleMouseDown={handleMouseDown}
                handleMouseMove={handleMouseMove}
                handleMouseUp={handleMouseUp}
                isDrawing={isDrawing}
              />
            </Suspense>
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
    </div>
  );
}

export default App;