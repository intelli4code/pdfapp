import React, { useState, useEffect, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { createClient } from '@supabase/supabase-js';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
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

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;

// Initialize Firebase (using global variables from Canvas environment)
const firebaseConfig = window.__firebase_config;
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Initialize Supabase (using placeholder values - to be filled in)
const supabaseUrl = 'YOUR_SUPABASE_URL';
const supabaseAnonKey = 'YOUR_SUPABASE_ANON_KEY';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// App ID for Firestore structure
const appId = window.__app_id;

function App() {
  // Authentication state
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

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
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setAuthLoading(false);
      if (user) {
        loadUserPdfs(user.uid);
      }
    });

    return () => unsubscribe();
  }, []);

  // Show modal helper
  const showModalMessage = (message, type = 'info') => {
    setModalMessage(message);
    setModalType(type);
    setShowModal(true);
  };

  // Load user's PDFs from Firestore
  const loadUserPdfs = async (userId) => {
    try {
      setLoading(true);
      const pdfsRef = collection(db, `artifacts/${appId}/users/${userId}/pdfs`);
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
        .from('pdf_documents')
        .upload(filePath, file, {
          onUploadProgress: (progress) => {
            setUploadProgress((progress.loaded / progress.total) * 100);
          }
        });

      if (error) throw error;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
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

      await setDoc(
        doc(db, `artifacts/${appId}/users/${user.uid}/pdfs`, pdfId),
        pdfMetadata
      );

      // Refresh PDF list
      await loadUserPdfs(user.uid);
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
    if (!selectedPdf || !user) return;

    try {
      await setDoc(
        doc(db, `artifacts/${appId}/users/${user.uid}/pdfs`, selectedPdf.id),
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
      await deleteDoc(doc(db, `artifacts/${appId}/users/${user.uid}/pdfs`, pdf.id));

      // Refresh PDF list
      await loadUserPdfs(user.uid);
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
          <h1 className="text-2xl font-bold text-gray-800 mb-4">Authentication Required</h1>
          <p className="text-gray-600">Please log in to access the PDF Annotator.</p>
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
              <p className="text-sm text-gray-600">User ID: {user.uid}</p>
            </div>
            {selectedPdf && (
              <button
                onClick={closePdfViewer}
                className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
              >
                ← Back to Library
              </button>
            )}
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
                          <h3 className="text-lg font-medium text-gray-900">{pdf.originalName}</h3>
                          <p className="text-sm text-gray-500">
                            Uploaded: {new Date(pdf.uploadedAt).toLocaleDateString()}
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
            <div className="p-4">
              <div 
                ref={pdfViewerRef}
                className="relative inline-block border border-gray-300 shadow-lg"
                style={{ cursor: isDrawing ? 'crosshair' : 'crosshair' }}
              >
                <Document
                  file={selectedPdf.publicUrl}
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
    </div>
  );
}

export default App;