import React, { useState, useRef } from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import './style.css';

// Real API functions with your endpoints
const apiCall = {
  getUploadConfig: async (filename) => {
    try {
      const url = `https://ns3gua7456.execute-api.us-east-1.amazonaws.com/presign?filename=${encodeURIComponent(filename)}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
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
      console.log('File details:', {
        name: file.name,
        size: file.size,
        type: file.type
      });
      
      const response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/octet-stream'
        },
        body: file // Send file directly as binary data
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      // S3 PUT response might be empty, so handle that
      let data;
      try {
        data = await response.json();
      } catch (e) {
        // If response is not JSON, create a success object
        data = {
          success: true,
          message: "File uploaded successfully to S3"
        };
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
  if (!bytes || bytes === 0 || isNaN(bytes)) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const formatUploadTime = (milliseconds) => {
  if (milliseconds < 1000) {
    return `${Math.round(milliseconds)}ms`;
  } else {
    return `${(milliseconds / 1000).toFixed(2)}s`;
  }
};

const validateFile = (file, maxSize = 50 * 1024 * 1024) => { // Default 50MB
  if (!file || !file.size) return 'Invalid file';
  if (file.size > maxSize) {
    return `File size exceeds maximum limit of ${formatFileSize(maxSize)}`;
  }
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
  
  const fileInputRef = useRef(null);

  const handleFileSelect = async (file) => {
    if (!file) {
      console.log('No file provided');
      return;
    }

    console.log('File selected, making GET API call...');
    console.log('Selected file:', {
      name: file.name,
      size: file.size,
      type: file.type
    });

    setSelectedFile(file);
    setMessage(null);
    setUploadTime(null);
    setIsLoading(true);
    setUploadConfig(null);

    try {
      // Make real GET API call with filename parameter (no authorization needed)
      const config = await apiCall.getUploadConfig(file.name);
      setUploadConfig(config);
      console.log('Upload config received:', config);
      
      // Validate file
      const validationError = validateFile(file);
      if (validationError) {
        setMessage({ type: 'danger', text: validationError });
      } else {
        setMessage({ 
          type: 'success', 
          text: `Pre-signed URL generated for ${config.filename}. Ready for upload!` 
        });
      }
      
    } catch (error) {
      console.error('Error getting upload config:', error);
      setMessage({ 
        type: 'danger', 
        text: `Failed to get pre-signed URL: ${error.message}` 
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    
    const files = e.dataTransfer.files;
    console.log('Dropped files:', files);
    
    if (files && files.length > 0) {
      const file = files[0];
      console.log('Processing dropped file:', file);
      handleFileSelect(file);
    }
  };

  const handleFileInputChange = (e) => {
    const files = e.target.files;
    console.log('Input files:', files);
    
    if (files && files.length > 0) {
      const file = files[0];
      console.log('Processing input file:', file);
      handleFileSelect(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !uploadConfig) {
      console.log('Cannot upload: missing file or config');
      return;
    }

    // Use the 'url' field from the GET response
    const uploadUrl = uploadConfig.url;
    if (!uploadUrl) {
      setMessage({ 
        type: 'danger', 
        text: 'Upload URL not found in pre-signed response' 
      });
      return;
    }

    console.log('Starting S3 upload...');
    
    // Record start time
    const startTime = performance.now();
    
    setIsUploading(true);
    setUploadProgress(0);
    setUploadTime(null);
    setMessage({ type: 'info', text: 'Uploading to S3...' });

    // Simulate progress since S3 PUT doesn't provide real-time progress
    const progressInterval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 90) return prev; // Stop at 90% until actual completion
        return prev + Math.random() * 20;
      });
    }, 300);

    try {
      // Make real PUT API call to S3 pre-signed URL
      const result = await apiCall.uploadFile(selectedFile, uploadUrl);
      
      // Record end time and calculate duration
      const endTime = performance.now();
      const uploadDuration = endTime - startTime;
      
      // Complete the progress
      clearInterval(progressInterval);
      setUploadProgress(100);
      setUploadTime(uploadDuration);
      
      setMessage({ 
        type: 'success', 
        text: `File "${uploadConfig.filename}" uploaded successfully to ${uploadConfig.bucket} in ${formatUploadTime(uploadDuration)}! 🎉` 
      });
      console.log(`Upload completed successfully in ${formatUploadTime(uploadDuration)}`);
    } catch (error) {
      clearInterval(progressInterval);
      console.error('Upload error:', error);
      setMessage({ 
        type: 'danger', 
        text: `Upload failed: ${error.message}` 
      });
      setUploadProgress(0);
      setUploadTime(null);
    } finally {
      clearInterval(progressInterval);
      setIsUploading(false);
    }
  };

  const resetUpload = () => {
    setSelectedFile(null);
    setUploadConfig(null);
    setUploadProgress(0);
    setUploadTime(null);
    setMessage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
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
              
              {/* Drag & Drop Zone */}
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
                      <div style={{ fontSize: '3rem' }} className="mb-3 file-icon">📄</div>
                      <h5>File Selected: {selectedFile.name}</h5>
                      <p className="text-muted">Click to select a different file or drag a new one here</p>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: '3rem' }} className="mb-3 file-icon">☁️</div>
                      <h5>Drag & Drop your file here</h5>
                      <p className="text-muted">or click to browse</p>
                    </>
                  )}
                </div>
              </div>

              {/* Hidden File Input */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileInputChange}
                style={{ display: 'none' }}
              />

              {/* File Information */}
              {selectedFile && (
                <div className="card mt-3 file-info-card">
                  <div className="card-body">
                    <h6 className="card-title">Selected File Information</h6>
                    <div className="row mb-2">
                      <div className="col-sm-3"><strong>Name:</strong></div>
                      <div className="col-sm-9">{selectedFile.name || 'Unknown'}</div>
                    </div>
                    <div className="row mb-2">
                      <div className="col-sm-3"><strong>Size:</strong></div>
                      <div className="col-sm-9">{formatFileSize(selectedFile.size)}</div>
                    </div>
                    <div className="row mb-2">
                      <div className="col-sm-3"><strong>Type:</strong></div>
                      <div className="col-sm-9">{selectedFile.type || 'Unknown'}</div>
                    </div>
                    {uploadTime && (
                      <div className="row mb-2">
                        <div className="col-sm-3"><strong>Upload Time:</strong></div>
                        <div className="col-sm-9 text-success">{formatUploadTime(uploadTime)} ⚡</div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Upload Configuration Info */}
              {uploadConfig && (
                <div className="card mt-3 config-card">
                  <div className="card-body">
                    <h6 className="card-title">AWS S3 Pre-signed URL Configuration</h6>
                    <div className="row mb-2">
                      <div className="col-sm-3"><strong>File ID:</strong></div>
                      <div className="col-sm-9">{uploadConfig.fileId}</div>
                    </div>
                    <div className="row mb-2">
                      <div className="col-sm-3"><strong>Bucket:</strong></div>
                      <div className="col-sm-9">{uploadConfig.bucket}</div>
                    </div>
                    <div className="row mb-2">
                      <div className="col-sm-3"><strong>Expires In:</strong></div>
                      <div className="col-sm-9">{uploadConfig.expiresIn} seconds</div>
                    </div>
                    <div className="row mb-2">
                      <div className="col-sm-3"><strong>Timestamp:</strong></div>
                      <div className="col-sm-9">{uploadConfig.timestamp}</div>
                    </div>
                    <div className="row mb-2">
                      <div className="col-sm-3"><strong>Content Type:</strong></div>
                      <div className="col-sm-9">{uploadConfig.contentType || 'application/octet-stream'}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Loading State */}
              {isLoading && (
                <div className="text-center mt-3">
                  <div className="spinner-border text-primary" role="status">
                    <span className="visually-hidden">Loading...</span>
                  </div>
                  <p className="mt-2">Getting pre-signed URL from AWS...</p>
                </div>
              )}

              {/* Upload Progress */}
              {isUploading && (
                <div className="mt-3">
                  <label className="form-label">Upload Progress</label>
                  <div className="progress">
                    <div
                      className="progress-bar progress-bar-striped progress-bar-animated"
                      role="progressbar"
                      style={{ width: `${uploadProgress}%` }}
                      aria-valuenow={uploadProgress}
                      aria-valuemin="0"
                      aria-valuemax="100"
                    >
                      {Math.round(uploadProgress)}%
                    </div>
                  </div>
                </div>
              )}

              {/* Messages */}
              {message && (
                <div className={`alert alert-${message.type} mt-3`} role="alert">
                  {message.text}
                </div>
              )}

              {/* Action Buttons */}
              <div className="d-flex gap-2 mt-4">
                <button
                  className="btn btn-primary"
                  disabled={!selectedFile || !uploadConfig || isUploading || isLoading}
                  onClick={handleUpload}
                >
                  {isUploading ? 'Uploading to S3...' : 'Upload to S3 (PUT)'}
                </button>
                
                <button
                  className="btn btn-secondary"
                  onClick={resetUpload}
                  disabled={isUploading}
                >
                  Reset
                </button>
              </div>
              
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Main App Component
function App() {
  return (
    <div className="App">
      <FileUpload />
    </div>
  );
}

export default App;
