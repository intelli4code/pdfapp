import React, { Suspense, lazy } from 'react';
import { Document, Page } from 'react-pdf';
import LoadingSpinner from '../LoadingSpinner';

const PDFViewer = ({ 
  selectedPdf, 
  pageNumber, 
  pdfScale, 
  onDocumentLoadSuccess, 
  onPageRenderSuccess, 
  showModalMessage,
  canvasRef,
  pdfViewerRef,
  handleMouseDown,
  handleMouseMove,
  handleMouseUp,
  isDrawing 
}) => {
  return (
    <div className="p-4">
      <div 
        ref={pdfViewerRef}
        className="relative inline-block border border-gray-300 shadow-lg"
        style={{ cursor: isDrawing ? 'crosshair' : 'crosshair' }}
      >
        <Suspense fallback={<LoadingSpinner message="Loading PDF viewer..." size="large" />}>
          <Document
            file={selectedPdf.publicUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={(error) => {
              console.error('PDF load error:', error);
              showModalMessage('Failed to load PDF. Please try again.', 'error');
            }}
            loading={<LoadingSpinner message="Loading PDF document..." size="medium" />}
          >
            <Page
              pageNumber={pageNumber}
              scale={pdfScale}
              onRenderSuccess={onPageRenderSuccess}
              loading={<LoadingSpinner message="Rendering page..." size="small" />}
            />
          </Document>
        </Suspense>
        
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
  );
};

export default PDFViewer;