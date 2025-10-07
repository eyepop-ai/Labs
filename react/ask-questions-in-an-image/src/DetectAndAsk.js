import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Login from './Login';
import './App.css';

function DetectAndAsk() {
  useEffect(() => {
    document.title = "Detect Anything + Ask Anything | EyePop.ai";
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
  const [detectPrompt, setDetectPrompt] = useState('water heater');
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.3);
  const [questions, setQuestions] = useState([
    "What is the overall condition of the detected object (new, old, damaged)?",
    "What is the color of the detected object?",
    "What material is the detected object made of?"
  ]);
  const [newQuestion, setNewQuestion] = useState('');
  const [state, setState] = useState('Ready');
  const [detections, setDetections] = useState([]);
  const [allDetections, setAllDetections] = useState([]);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);

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
    setDetectPrompt('water heater');
    setQuestions([
      "What is the overall condition of the detected object (new, old, damaged)?",
      "What is the color of the detected object?",
      "What material is the detected object made of?"
    ]);
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
    if (!canvas) {
      console.error('Canvas ref not available');
      return;
    }

    const ctx = canvas.getContext('2d');
    
    // Use natural image dimensions for canvas
    const width = imageElement.naturalWidth || imageElement.width;
    const height = imageElement.naturalHeight || imageElement.height;
    
    console.log('Drawing canvas:', { width, height, detections: detectionsData.length });
    
    canvas.width = width;
    canvas.height = height;

    // Draw the image first at full resolution
    ctx.drawImage(imageElement, 0, 0, canvas.width, canvas.height);

    // Draw bounding boxes
    detectionsData.forEach((detection, idx) => {
      if (detection.objects && detection.objects.length > 0) {
        detection.objects.forEach((obj) => {
          const { x, y, width: bboxWidth, height: bboxHeight } = obj;
          
          console.log(`Drawing bbox ${idx}:`, { x, y, width: bboxWidth, height: bboxHeight });
          
          // Draw bounding box
          ctx.strokeStyle = '#1A1AFF';
          ctx.lineWidth = 8; // Thicker for high-res images
          ctx.strokeRect(x, y, bboxWidth, bboxHeight);

          // Draw label background
          const label = obj.classLabel || detectPrompt;
          const fontSize = Math.max(32, canvas.width / 50); // Scale font based on image size
          ctx.font = `${fontSize}px Inter, sans-serif`;
          const textWidth = ctx.measureText(label).width;
          const labelHeight = fontSize + 20;
          
          ctx.fillStyle = '#1A1AFF';
          ctx.fillRect(x, y - labelHeight, textWidth + 20, labelHeight);

          // Draw label text
          ctx.fillStyle = '#fff';
          ctx.fillText(label, x + 10, y - 10);
        });
      }
    });
  }, [detectPrompt, canvasRef]);

  const filterDetections = useCallback((detectionsToFilter) => {
    return detectionsToFilter.filter(detection => {
      if (detection.objects && detection.objects.length > 0) {
        const meetsConfidence = detection.objects[0].confidence >= confidenceThreshold;
        const hasAnalysis = detection.classes && detection.classes.length > 0;
        // Only show detections that meet confidence threshold AND have analysis results
        return meetsConfidence && hasAnalysis;
      }
      return false;
    });
  }, [confidenceThreshold]);

  useEffect(() => {
    if (allDetections.length > 0) {
      const filtered = filterDetections(allDetections);
      setDetections(filtered);
      
      // Redraw canvas with filtered detections
      if (filtered.length > 0 && image) {
        const img = new Image();
        img.onload = () => drawBoundingBoxes(img, filtered);
        img.src = image.src;
      }
    }
  }, [confidenceThreshold, allDetections, filterDetections, image, drawBoundingBoxes]);

  // If not authenticated, show login page (AFTER all hooks are declared)
  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  // Regular event handlers (not hooks, can be after conditional return in theory, but keeping here for clarity)
  const handleAddQuestion = () => {
    if (newQuestion.trim()) {
      setQuestions([...questions, newQuestion.trim()]);
      setNewQuestion('');
    }
  };

  const handleRemoveQuestion = (idx) => {
    setQuestions((qs) => qs.filter((_, i) => i !== idx));
  };

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
    if (!image || !detectPrompt.trim()) return;

    setState("Processing...");
    setDetections([]);

    const base64 = image.src.split(",")[1];

    try {
      const response = await fetch("/api/detect-and-ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          detectPrompt: detectPrompt.trim(), 
          questions, 
          imageBase64: base64,
          apiKey
        })
      });

      const data = await response.json();
      
      if (data.detections && data.detections.length > 0) {
        // Store all detections (will be filtered by threshold)
        setAllDetections(data.detections);
        
        // Filter by confidence threshold AND whether they have analysis results
        const filtered = data.detections.filter(detection => {
          if (detection.objects && detection.objects.length > 0) {
            const meetsConfidence = detection.objects[0].confidence >= confidenceThreshold;
            const hasAnalysis = detection.classes && detection.classes.length > 0;
            return meetsConfidence && hasAnalysis;
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
        setState("No detections found");
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
              <canvas ref={canvasRef} style={{ maxWidth: '100%', maxHeight: '600px', borderRadius: '8px' }} />
            ) : (
              <img src={image.src} alt="Preview" />
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
              <h3>What to Detect</h3>
              <input
                type="text"
                placeholder="e.g., water heater, car, person"
                value={detectPrompt}
                onChange={(e) => setDetectPrompt(e.target.value)}
                style={{ width: '100%', padding: '0.5rem', marginBottom: '1rem' }}
              />
              
              <div style={{ marginBottom: '1.5rem' }}>
                <label htmlFor="confidenceSlider" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                  Confidence Threshold: {(confidenceThreshold * 100).toFixed(0)}%
                </label>
                <input
                  id="confidenceSlider"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
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
              
              <h3>Questions to Ask</h3>
              <ul className="questions-list">
                {questions.map((q, i) => (
                  <li key={i} className="question-item">
                    <span>{q}</span>
                    <button
                      onClick={() => handleRemoveQuestion(i)}
                      aria-label={`Remove question ${i + 1}`}
                      title="Remove"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
              {questions.length > 1 && (
                <button
                  onClick={() => setQuestions([])}
                  disabled={questions.length === 0}
                  style={{ float: 'right', marginTop: '.5rem' }}
                >
                  Remove All
                </button>
              )}
              <div style={{ marginTop: '3rem', display: 'flex', gap: '0.5rem', maxWidth: '100%', width: '100%' }}>
                <input
                  type="text"
                  placeholder="Enter a new question"
                  value={newQuestion}
                  onChange={(e) => setNewQuestion(e.target.value)}
                  style={{ width: '100%' }}
                />
                <button onClick={handleAddQuestion} className='eyepop-button'>
                  Add
                </button>
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
                  step="0.05"
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
                  Showing {detections.length} of {allDetections.length} detection{allDetections.length !== 1 ? 's' : ''} with analysis results
                </p>
                <p style={{ fontSize: '0.75rem', color: '#999', marginTop: '0.25rem', marginBottom: 0 }}>
                  (Only showing detections that have Q&A answers)
                </p>
              </div>
              
              <h4>Results ({detections.length} detection{detections.length !== 1 ? 's' : ''})</h4>
              {detections.map((detection, detIdx) => (
                <div key={detIdx} style={{ marginBottom: '2rem', padding: '1rem', background: '#f8f8f8', borderRadius: '4px' }}>
                  <h5 style={{ marginTop: 0 }}>Detection {detIdx + 1}</h5>
                  {detection.classes && detection.classes.length > 0 ? (
                    <ul className="results-list">
                      {detection.classes.map((cls, idx) => (
                        <li key={idx} className="result-item">
                          {cls.category}<br />
                          <strong>{cls.classLabel && cls.classLabel.toLowerCase() === "null" ? 'N/A' : cls.classLabel}</strong><br />
                          <strong>{(cls.confidence * 100).toFixed(1)}%</strong> confidence
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>No analysis results</p>
                  )}
                </div>
              ))}
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
      <div className="bottom-bar">
        <div>State: {state}</div>
        <div>
          <button
            onClick={handleContinue}
            disabled={(state !== 'Ready' && state !== 'Results') || !image || !detectPrompt.trim()}
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
      <span style={{ fontSize: '2rem', fontWeight: 'bold' }}>Detect Anything + Ask Anything</span>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <Link to="/" style={{ color: '#1A1AFF', textDecoration: 'none', fontWeight: '600' }}>Image Q&A</Link>
        <Link to="/detect-and-ask" style={{ color: '#1A1AFF', textDecoration: 'none', fontWeight: '600' }}>Detect + Ask</Link>
        <button onClick={onLogout} className="logout-button">Logout</button>
      </div>
    </header>
  );
}

export default function DetectAndAskWithHeader(props) {
  return (
    <>
      <DetectAndAsk {...props} />
    </>
  );
}
