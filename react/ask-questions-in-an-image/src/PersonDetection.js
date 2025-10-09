import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vs } from 'react-syntax-highlighter/dist/esm/styles/prism';
import Login from './Login';
import './App.css';

function PersonDetection() {
  useEffect(() => {
    document.title = "Person Detection | EyePop.ai";
  }, []);

  // ALL state hooks must be declared before any conditional returns
  // Authentication state - persist in sessionStorage
  const [apiKey, setApiKey] = useState(() => {
    return sessionStorage.getItem('eyepop_api_key') || null;
  });
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return sessionStorage.getItem('eyepop_authenticated') === 'true';
  });

  // App state
  const [image, setImage] = useState(null);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.3);
  const [state, setState] = useState('Ready');
  const [detections, setDetections] = useState([]);
  const [allDetections, setAllDetections] = useState([]);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const animationFrameRef = useRef(null);
  const imageCache = useRef(null);

  // Auth handlers
  const handleLogin = (key) => {
    setApiKey(key);
    setIsAuthenticated(true);
    // Persist to sessionStorage
    sessionStorage.setItem('eyepop_api_key', key);
    sessionStorage.setItem('eyepop_authenticated', 'true');
  };

  const handleLogout = () => {
    setApiKey(null);
    setIsAuthenticated(false);
    // Clear sessionStorage
    sessionStorage.removeItem('eyepop_api_key');
    sessionStorage.removeItem('eyepop_authenticated');
    // Reset all state when logging out
    setImage(null);
    setDetections([]);
    setAllDetections([]);
    setState('Ready');
  };

  // ALL useCallback and useEffect hooks must also be declared before conditional returns
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => setImage({ src: reader.result, file });
      reader.readAsDataURL(file);
    }
  }, []);

  const drawBoundingBoxes = useCallback((imageElement, detectionsData) => {
    const canvas = canvasRef.current;
    if (!canvas || !imageElement) {
      return;
    }

    const ctx = canvas.getContext('2d', { alpha: false }); // Disable alpha for better performance
    
    // Use natural image dimensions for canvas
    const width = imageElement.naturalWidth || imageElement.width;
    const height = imageElement.naturalHeight || imageElement.height;
    
    // Only resize canvas if dimensions changed to prevent layout shifts
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    // Clear and redraw the image first at full resolution
    ctx.drawImage(imageElement, 0, 0, canvas.width, canvas.height);

    // Batch draw all bounding boxes
    detectionsData.forEach((detection) => {
      if (detection.objects && detection.objects.length > 0) {
        detection.objects.forEach((obj) => {
          const { x, y, width: bboxWidth, height: bboxHeight } = obj;
          
          // Draw bounding box
          ctx.strokeStyle = '#1acaff';
          ctx.lineWidth = 5;
          ctx.strokeRect(x, y, bboxWidth, bboxHeight);

          // Draw label background
          const label = obj.classLabel || 'person';
          const fontSize = Math.max(32, canvas.width / 50);
          ctx.font = `${fontSize}px Inter, sans-serif`;
          const textWidth = ctx.measureText(label).width;
          const labelHeight = fontSize + 20;
          
          ctx.fillStyle = '#1acaff';
          ctx.fillRect(x, y - labelHeight, textWidth + 20, labelHeight);

          // Draw label text
          ctx.fillStyle = '#fff';
          ctx.fillText(label, x + 10, y - 10);
        });
      }
    });
  }, []);

  // Use useMemo to optimize filtering performance
  const filteredDetections = useMemo(() => {
    if (allDetections.length === 0) return [];
    
    return allDetections.filter(detection => {
      if (detection.objects && detection.objects.length > 0) {
        return detection.objects[0].confidence >= confidenceThreshold;
      }
      return false;
    });
  }, [allDetections, confidenceThreshold]);

  // Update detections and redraw when filtered detections change
  useEffect(() => {
    setDetections(filteredDetections);
    
    // Cancel any pending animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    
    // Only redraw if we have an image and allDetections (meaning we've processed an image)
    if (image && allDetections.length > 0) {
      // Use cached image if available
      if (imageCache.current && imageCache.current.src === image.src) {
        animationFrameRef.current = requestAnimationFrame(() => {
          if (canvasRef.current) {
            drawBoundingBoxes(imageCache.current, filteredDetections);
          }
        });
      } else {
        const img = new Image();
        img.onload = () => {
          imageCache.current = img;
          animationFrameRef.current = requestAnimationFrame(() => {
            if (canvasRef.current) {
              drawBoundingBoxes(img, filteredDetections);
            }
          });
        };
        img.src = image.src;
      }
    }
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [filteredDetections, image, allDetections.length, drawBoundingBoxes]);

  // If not authenticated, show login page (AFTER all hooks are declared)
  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  // Regular event handlers
  const handleDragOver = (e) => e.preventDefault();

  const handleDropZoneClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = null;
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => setImage({ src: reader.result, file });
      reader.readAsDataURL(file);
    }
  };

  const handleContinue = async () => {
    if (!image) return;

    setState("Processing...");
    setDetections([]);

    const base64 = image.src.split(",")[1];

    try {
      const response = await fetch("/api/person-detection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          imageBase64: base64,
          apiKey
        })
      });

      // Check for 413 error (payload too large)
      if (response.status === 413) {
        setState("Image too large! Please use a smaller image (< 4MB recommended)");
        setTimeout(() => setState("Ready"), 4000);
        return;
      }

      const data = await response.json();
      
      if (data.detections && data.detections.length > 0) {
        // Store all detections (will be filtered by threshold)
        setAllDetections(data.detections);
        
        // Filter by confidence threshold
        const filtered = data.detections.filter(detection => {
          if (detection.objects && detection.objects.length > 0) {
            return detection.objects[0].confidence >= confidenceThreshold;
          }
          return false;
        });
        
        setDetections(filtered);
        
        // Draw bounding boxes on canvas after state update
        setTimeout(() => {
          const img = new Image();
          img.onload = () => {
            console.log('Image loaded, drawing bboxes');
            drawBoundingBoxes(img, filtered);
          };
          img.onerror = () => {
            console.error('Failed to load image');
          };
          img.src = image.src;
        }, 100);
        
        setState("Results");
      } else {
        setState("No persons found");
        setTimeout(() => setState("Ready"), 2000);
      }
    } catch (error) {
      console.error("Error:", error);
      setState("Error");
      setTimeout(() => setState("Ready"), 2000);
    }
  };

  return (
    <div className="app-container">
      <HeaderBar onLogout={handleLogout} />
      <div className="main-content">
        <div
          className="drop-zone"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onClick={handleDropZoneClick}
          style={{ cursor: 'pointer' }}
        >
          <input
            type="file"
            accept="image/*"
            ref={fileInputRef}
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          {image ? (
            detections.length > 0 ? (
              <canvas 
                ref={canvasRef} 
                style={{ 
                  maxWidth: '100%', 
                  maxHeight: '600px', 
                  borderRadius: '8px',
                  display: 'block',
                  width: 'auto',
                  height: 'auto',
                  willChange: 'contents',
                  imageRendering: 'crisp-edges'
                }} 
              />
            ) : (
              <img src={image.src} alt="Preview" style={{ display: 'block', maxWidth: '100%', height: 'auto' }} />
            )
          ) : (
            <div className="drop-message">
              Drop image here or click to select
            </div>
          )}
        </div>
        <div className="sidebar">
          {detections.length === 0 && (
            <>
              <div style={{ marginBottom: '1.5rem' }}>
                <label htmlFor="confidenceSlider" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                  Confidence Threshold: {(confidenceThreshold * 100).toFixed(0)}%
                </label>
                <input
                  id="confidenceSlider"
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={confidenceThreshold}
                  onChange={(e) => setConfidenceThreshold(parseFloat(e.target.value))}
                  style={{ width: '100%' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#666', marginTop: '0.25rem' }}>
                  <span>0%</span>
                  <span>50%</span>
                  <span>100%</span>
                </div>
              </div>
            </>
          )}
          {detections.length > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <div style={{ marginBottom: '1.5rem', padding: '1rem', background: '#f0f0ff', borderRadius: '4px' }}>
                <label htmlFor="confidenceSliderResults" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                  Confidence Threshold: {(confidenceThreshold * 100).toFixed(0)}%
                </label>
                <input
                  id="confidenceSliderResults"
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={confidenceThreshold}
                  onChange={(e) => setConfidenceThreshold(parseFloat(e.target.value))}
                  style={{ width: '100%' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#666', marginTop: '0.25rem' }}>
                  <span>0%</span>
                  <span>50%</span>
                  <span>100%</span>
                </div>
                <p style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.5rem', marginBottom: 0 }}>
                  Showing {detections.length} of {allDetections.length} person{allDetections.length !== 1 ? 's' : ''}
                </p>
              </div>
              
              <h4>Results ({detections.length} person{detections.length !== 1 ? 's' : ''})</h4>
              <div style={{ willChange: 'contents', contain: 'layout style paint' }}>
                <div style={{ padding: '1.5rem', background: '#f8f8f8', borderRadius: '4px', textAlign: 'center' }}>
                  <h3 style={{ margin: '0 0 0.5rem 0', color: '#1A1AFF' }}>✓ Person Detection Complete</h3>
                  <p style={{ fontSize: '1.1rem', margin: '0.5rem 0', fontWeight: '600' }}>
                    Found {detections.length} person{detections.length !== 1 ? 's' : ''}
                  </p>
                  <p style={{ fontSize: '0.9rem', color: '#666', margin: '0.5rem 0' }}>
                    Bounding boxes are shown on the image above
                  </p>
                  {allDetections.length > detections.length && (
                    <p style={{ fontSize: '0.85rem', color: '#999', margin: '0.5rem 0' }}>
                      ({allDetections.length - detections.length} additional person{allDetections.length - detections.length !== 1 ? 's' : ''} below confidence threshold)
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={() => {
                  setDetections([]);
                  setAllDetections([]);
                  setState('Ready');
                }}
                className='eyepop-button'
                style={{ marginTop: '0.5rem' }}
              >
                Clear Results
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Code Example Section - Below main content, above bottom bar */}
      {detections.length > 0 && (
        <div style={{ 
          padding: '1rem 2rem', 
          background: '#fff', 
          borderTop: '1px solid #e0e0e0'
        }}>
          <h4 style={{ margin: '0 0 0.75rem 0', color: '#333' }}>📋 Example Code</h4>
          <SyntaxHighlighter 
            language="javascript" 
            style={vs}
            customStyle={{
              borderRadius: '6px',
              margin: 0,
              maxHeight: '400px',
              fontSize: '0.85rem',
              background: '#f5f5f5'
            }}
          >
{`const { EyePop, PopComponentType } = require("@eyepop.ai/eyepop");

const endpoint = await EyePop.workerEndpoint({
  auth: { secretKey: "YOUR_API_KEY" },
  stopJobs: false
}).connect();

await endpoint.changePop({
  components: [{
    type: PopComponentType.INFERENCE,
    ability: "eyepop.person:latest"
  }]
});

const blob = new Blob([Buffer.from(imageBase64, "base64")], { 
  type: "image/png" 
});

const results = await endpoint.process({
  file: blob,
  mimeType: "image/png"
});

let detections = [];
for await (let result of results) {
  if (result.objects && result.objects.length > 0) {
    result.objects.forEach((obj) => {
      detections.push({
        objects: [obj]
      });
    });
  }
}

console.log(detections);`}
          </SyntaxHighlighter>
        </div>
      )}

      <div className="bottom-bar">
        <div>State: {state}</div>
        <div>
          <button
            onClick={handleContinue}
            disabled={(state !== 'Ready' && state !== 'Results') || !image}
          >Continue</button>
        </div>
      </div>
    </div>
  );
}

function HeaderBar({ onLogout }) {
  return (
    <header className="header-bar">
      <img
        src="https://cdn.prod.website-files.com/645c6c444d18e50035fd225e/6840e092fd44d726152a1248_logo-horizontal-800.svg"
        alt="EyePop Logo"
        style={{ height: 40, marginRight: 16 }}
      />
      <span style={{ fontSize: '2rem', fontWeight: 'bold' }}>Person Detection</span>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <Link to="/" style={{ color: '#1A1AFF', textDecoration: 'none', fontWeight: '600' }}>Image Q&A</Link>
        <Link to="/detect-and-ask" style={{ color: '#1A1AFF', textDecoration: 'none', fontWeight: '600' }}>Detect + Ask</Link>
        <Link to="/person-detection" style={{ color: '#1A1AFF', textDecoration: 'none', fontWeight: '600' }}>Person Detection</Link>
        <button onClick={onLogout} className="logout-button">Logout</button>
      </div>
    </header>
  );
}

export default function PersonDetectionWithHeader(props) {
  return (
    <>
      <PersonDetection {...props} />
    </>
  );
}

