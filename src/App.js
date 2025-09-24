import React, { useState, useRef } from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import './style.css';

// Real API functions with your endpoints
const apiCall = {
  getUploadConfig: async (filename) => {
    try {
      const domain = process.env.REACT_APP_API_URL;
      const url = `${domain}/presign?filename=${encodeURIComponent(filename)}`;
      const response = await fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json' } });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      console.log('GET API Response:', data);
      return data;
    } catch (error) {
      console.error('GET API Error:', error);
      throw error;
    }
  },

  uploadFile: async (file, uploadUrl) => {
    try {
      console.log('Uploading to URL:', uploadUrl);
      const response = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: file });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      let data;
      try {
        data = await response.json();
      } catch {
        data = { success: true, message: "File uploaded successfully to S3" };
      }
      console.log('PUT API Response:', data);

      return data;
    } catch (error) {
      console.error('PUT API Error:', error);
      throw error;
    }
  }
};

// Utility functions
const formatFileSize = (bytes) => {
  if (!bytes || isNaN(bytes)) return '0 Bytes';
  const k = 1024, sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const formatUploadTime = (ms) => ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`;

const validateFile = (file, maxSize = 50 * 1024 * 1024) => {
  if (!file) return 'Invalid file';
  if (file.size > maxSize) return `File size exceeds maximum limit of ${formatFileSize(maxSize)}`;
  return null;
};

// File Upload Component
const FileUpload = () => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadConfig, setUploadConfig] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [message, setMessage] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploadTime, setUploadTime] = useState(null);

  // New states for scanning status
  const [scanStatus, setScanStatus] = useState(null);
  const [isScanning, setIsScanning] = useState(false);

  const fileInputRef = useRef(null);

  const handleFileSelect = async (file) => {
    if (!file) return;
    setSelectedFile(file);
    setMessage(null);
    setUploadTime(null);
    setIsLoading(true);
    setUploadConfig(null);

    try {
      const config = await apiCall.getUploadConfig(file.name);
      setUploadConfig(config);
      const validationError = validateFile(file);
      if (validationError) {
        setMessage({ type: 'danger', text: validationError });
      } else {
        setMessage({ type: 'success', text: `Pre-signed URL generated for ${config.filename}. Ready for upload!` });
      }
    } catch (error) {
      setMessage({ type: 'danger', text: `Failed to get pre-signed URL: ${error.message}` });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDragOver = (e) => { e.preventDefault(); setDragOver(true); };
  const handleDragLeave = (e) => { e.preventDefault(); setDragOver(false); };
  const handleDrop = (e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) handleFileSelect(e.dataTransfer.files[0]); };
  const handleFileInputChange = (e) => { if (e.target.files.length) handleFileSelect(e.target.files[0]); };

  // Polling function with timeout
  const pollProcessingStatus = (fileId) => {
    let pollIntervalId;
    let elapsed = 0;
    const MAX_POLL_TIME = 2 * 60 * 1000; // 2 minutes
    const POLL_INTERVAL = 10000; // 3 seconds

    const checkStatus = async () => {
      try {

        const domain = process.env.REACT_APP_API_URL;
        const res = await fetch(`${domain}/file-upload/${fileId}`);
        const data = await res.json();
        console.log("Polling status:", data.uploadedStatus);
        setScanStatus(data.uploadedStatus);

        if (data.uploadedStatus === 'NO_THREATS_FOUND') {
          console.log("No threats found");
          clearInterval(pollIntervalId);
          setIsScanning(false);
          setMessage({ type: 'success', text: 'File scanning completed. No threats found. ✅' });
        } else if (data.uploadedStatus === 'FAILED') {
          clearInterval(pollIntervalId);
          setIsScanning(false);
          setMessage({ type: 'danger', text: 'Processing failed ❌' });
        } else if (data.uploadedStatus === 'MOVED_TO_MALWARE_BUCKET') {
          clearInterval(pollIntervalId);
          setIsScanning(false);
          setMessage({ type: 'warning', text: 'Malware Found ❌. Moved to quarantine bucket.' });
        } else {
          setIsScanning(true); // still scanning
          elapsed += POLL_INTERVAL;
          if (elapsed >= MAX_POLL_TIME) {
            clearInterval(pollIntervalId);
            setIsScanning(false);
            setMessage({ type: 'warning', text: 'Timed out ⏳ Still processing after 2 minutes' });
          }
        }
      } catch (err) {
        console.error('Polling error:', err);
        clearInterval(pollIntervalId);
        setIsScanning(false);
        setMessage({ type: 'danger', text: 'Error checking processing status' });
      }
    };

    pollIntervalId = setInterval(checkStatus, POLL_INTERVAL);
    checkStatus();
  };

  const handleUpload = async () => {
    if (!selectedFile || !uploadConfig) return;
    const uploadUrl = uploadConfig.url;
    if (!uploadUrl) {
      setMessage({ type: 'danger', text: 'Upload URL not found in pre-signed response' });
      return;
    }

    const startTime = performance.now();
    setIsUploading(true);
    setUploadProgress(0);
    setUploadTime(null);
    setMessage({ type: 'info', text: 'Uploading to S3...' });

    const progressInterval = setInterval(() => {
      setUploadProgress(prev => (prev >= 90 ? prev : prev + Math.random() * 20));
    }, 300);

    try {
      await apiCall.uploadFile(selectedFile, uploadUrl);

      clearInterval(progressInterval);
      setUploadProgress(100);
      setUploadTime(performance.now() - startTime);
      setMessage({ type: 'info', text: 'Upload completed. Scanning for Virus..' });

      // Start polling after upload
      setIsScanning(true);
      //setTimeout({},10000);
      setTimeout(() => {
        pollProcessingStatus(uploadConfig.fileId);
      }, 5000);
      // pollProcessingStatus(uploadConfig.fileId);


    } catch (error) {
      clearInterval(progressInterval);
      setMessage({ type: 'danger', text: `Upload failed: ${error.message}` });
      setUploadProgress(0);
      setUploadTime(null);
    } finally {
      setIsUploading(false);
    }
  };

  const resetUpload = () => {
    setSelectedFile(null);
    setUploadConfig(null);
    setUploadProgress(0);
    setUploadTime(null);
    setMessage(null);
    setScanStatus(null);
    setIsScanning(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="container mt-5">
      <div className="row justify-content-center">
        <div className="col-md-8">
          <div className="card shadow">
            <div className="card-header">
              <h3 className="mb-0">AWS S3 File Upload</h3>
            </div>
            <div className="card-body">

              {/* Drag & Drop */}
              <div
                className={`drop-zone ${dragOver ? 'drag-over' : ''} ${selectedFile ? 'has-file' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="drop-zone-content">
                  {selectedFile ? (
                    <>
                      <div style={{ fontSize: '3rem' }} className="mb-3">📄</div>
                      <h5>File Selected: {selectedFile.name}</h5>
                      <p className="text-muted">Click to select a different file or drag a new one</p>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: '3rem' }} className="mb-3">☁️</div>
                      <h5>Drag & Drop your file here</h5>
                      <p className="text-muted">or click to browse</p>
                    </>
                  )}
                </div>
              </div>

              <input type="file" ref={fileInputRef} onChange={handleFileInputChange} style={{ display: 'none' }} />

              {/* File Info */}
              {selectedFile && (
                <div className="card mt-3">
                  <div className="card-body">
                    <h6>File Information</h6>
                    <div><strong>Name:</strong> {selectedFile.name}</div>
                    <div><strong>Size:</strong> {formatFileSize(selectedFile.size)}</div>
                    <div><strong>Type:</strong> {selectedFile.type || 'Unknown'}</div>
                  
                  </div>
                </div>
              )}

              {/* Upload Config */}
              {uploadConfig && (
                <div className="card mt-3">
                  <div className="card-body">
                    <h6>Upload Config</h6>
                    <div><strong>File ID:</strong> {uploadConfig.fileId}</div>
                    <div><strong>Bucket:</strong> {uploadConfig.bucket}</div>
                    <div><strong>Expires In:</strong> {uploadConfig.expiresIn} seconds</div>
                  </div>
                </div>
              )}

              {isLoading && (
                <div className="text-center mt-3">
                  <div className="spinner-border text-primary"></div>
                  <p>Getting pre-signed URL...</p>
                </div>
              )}

              {isUploading && (
                <div className="mt-3">
                  <label>Upload Progress</label>
                  <div className="progress">
                    <div className="progress-bar progress-bar-striped progress-bar-animated" style={{ width: `${uploadProgress}%` }}>
                      {Math.round(uploadProgress)}%
                    </div>
                  </div>
                </div>
              )}

              {message && (
                <div className={`alert alert-${message.type} mt-3`}>{message.text}</div>
              )}

              {/* Scanning Status */}
              {isScanning && scanStatus?.toLowerCase() === 'scanning' && (
                <div className="text-center mt-3">
                  <div className="spinner-border text-warning"></div>
                  <p className="mt-2">Scanning in progress...</p>
                </div>
              )}
              {!isScanning && scanStatus?.toLowerCase() === 'completed' && (
                <div className="alert alert-success mt-3">Completed ✅</div>
              )}
              {!isScanning && scanStatus?.toLowerCase() === 'failed' && (
                <div className="alert alert-danger mt-3">Failed ❌</div>
              )}

              {/* Buttons */}
              <div className="d-flex gap-2 mt-4">
                <button className="btn btn-primary" disabled={!selectedFile || !uploadConfig || isUploading || isLoading} onClick={handleUpload}>
                  {isUploading ? 'Uploading...' : 'Upload to S3'}
                </button>
                <button className="btn btn-secondary" onClick={resetUpload} disabled={isUploading}>Reset</button>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

function App() {
  return <FileUpload />;
}

export default App;
