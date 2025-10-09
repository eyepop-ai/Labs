import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vs } from 'react-syntax-highlighter/dist/esm/styles/prism';
import Login from './Login';
import './App.css';

// Memoized detection card component for better performance
const DetectionCard = React.memo(({ detection, detIdx }) => (
  <div 
    style={{ 
      marginBottom: '2rem', 
      padding: '1rem', 
      background: '#f8f8f8', 
      borderRadius: '4px',
      willChange: 'transform',
      transform: 'translateZ(0)'
    }}
  >
    <h5 style={{ marginTop: 0 }}>Detection {detIdx + 1}</h5>
    {detection.classes && detection.classes.length > 0 ? (
      <ul className="results-list">
        {detection.classes.map((cls, idx) => (
          <li key={`${cls.category}-${idx}`} className="result-item">
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
));

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
  const [showObjectDetections, setShowObjectDetections] = useState(true);
  const [showQAResults, setShowQAResults] = useState(true);
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

    // Batch draw all bounding boxes with detection numbers
    detectionsData.forEach((detection, detIdx) => {
      if (detection.objects && detection.objects.length > 0) {
        detection.objects.forEach((obj) => {
          const { x, y, width: bboxWidth, height: bboxHeight } = obj;
          
          // Draw bounding box
          ctx.strokeStyle = '#1acaff';
          ctx.lineWidth = 5;
          ctx.strokeRect(x, y, bboxWidth, bboxHeight);

          // Draw label with detection number
          const label = `#${detIdx + 1} - ${obj.classLabel || detectPrompt}`;
          const fontSize = Math.max(32, canvas.width / 50);
          ctx.font = `bold ${fontSize}px Inter, sans-serif`;
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
  }, [detectPrompt]);

  // Use useMemo to optimize filtering performance
  const filteredDetections = useMemo(() => {
    if (allDetections.length === 0) return [];
    
    return allDetections.filter(detection => {
      if (detection.objects && detection.objects.length > 0) {
        const meetsConfidence = detection.objects[0].confidence >= confidenceThreshold;
        // Always filter by confidence only - show all detections, Q&A results are optional
        return meetsConfidence;
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
        
        // Filter by confidence threshold only
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
                  Showing {detections.length} of {allDetections.length} detection{allDetections.length !== 1 ? 's' : ''}
                </p>
                {questions.length > 0 && (
                  <p style={{ fontSize: '0.75rem', color: '#999', marginTop: '0.25rem', marginBottom: 0 }}>
                    ({detections.filter(d => d.classes && d.classes.length > 0).length} detection{detections.filter(d => d.classes && d.classes.length > 0).length !== 1 ? 's' : ''} with Q&A answers)
                  </p>
                )}
              </div>
              
              <h4>Results ({detections.length} detection{detections.length !== 1 ? 's' : ''})</h4>
              <div style={{ willChange: 'contents', contain: 'layout style paint' }}>
                {questions.length > 0 ? (
                  // Show unified list with all detections
                  <div>
                    {detections.map((detection, detIdx) => {
                      const hasQA = detection.classes && detection.classes.length > 0;
                      return (
                        <div 
                          key={`detection-${detection.objects[0]?.id || detIdx}`}
                          style={{ 
                            marginBottom: '1rem', 
                            padding: '1rem', 
                            background: hasQA ? '#f0f9ff' : '#f8f8f8', 
                            borderRadius: '6px',
                            fontSize: '0.9rem',
                            borderLeft: hasQA ? '4px solid #1A1AFF' : '4px solid #ccc',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                          }}
                        >
                          {/* Header with detection number and badge */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                            <div>
                              <span style={{ 
                                fontSize: '1.1rem', 
                                fontWeight: 'bold', 
                                color: '#1A1AFF',
                                background: hasQA ? '#e0f0ff' : '#e8e8e8',
                                padding: '0.25rem 0.5rem',
                                borderRadius: '4px',
                                marginRight: '0.5rem'
                              }}>
                                #{detIdx + 1}
                              </span>
                              <strong>{detection.objects[0]?.classLabel || detectPrompt}</strong>
                            </div>
                            {hasQA && (
                              <span style={{ 
                                fontSize: '0.75rem', 
                                background: '#1A1AFF', 
                                color: '#fff', 
                                padding: '0.25rem 0.5rem', 
                                borderRadius: '4px',
                                fontWeight: '600'
                              }}>
                                💬 Q&A
                              </span>
                            )}
                          </div>
                          
                          {/* Confidence */}
                          <div style={{ color: '#666', marginBottom: '0.5rem' }}>
                            Confidence: <strong>{(detection.objects[0]?.confidence * 100).toFixed(1)}%</strong>
                          </div>
                          
                          {/* Q&A Results */}
                          {hasQA && (
                            <div style={{ 
                              marginTop: '0.75rem', 
                              paddingTop: '0.75rem', 
                              borderTop: '1px solid #ddd',
                              fontSize: '0.9rem'
                            }}>
                              {detection.classes.map((cls, idx) => (
                                <div key={idx} style={{ 
                                  marginBottom: '0.5rem',
                                  padding: '0.5rem',
                                  background: '#fff',
                                  borderRadius: '4px'
                                }}>
                                  <div style={{ color: '#666', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                                    {cls.category}
                                  </div>
                                  <div style={{ color: '#333', fontWeight: '500' }}>
                                    {cls.classLabel && cls.classLabel.toLowerCase() !== 'null' ? cls.classLabel : 'N/A'}
                                  </div>
                                  <div style={{ color: '#999', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                                    {(cls.confidence * 100).toFixed(1)}% confidence
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                // Show simple summary when no questions were asked
                <div style={{ padding: '1.5rem', background: '#f8f8f8', borderRadius: '4px', textAlign: 'center' }}>
                  <h3 style={{ margin: '0 0 0.5rem 0', color: '#1A1AFF' }}>✓ Detections Complete</h3>
                  <p style={{ fontSize: '1.1rem', margin: '0.5rem 0', fontWeight: '600' }}>
                    Found {detections.length} "{detectPrompt}" object{detections.length !== 1 ? 's' : ''}
                  </p>
                  <p style={{ fontSize: '0.9rem', color: '#666', margin: '0.5rem 0' }}>
                    Bounding boxes are shown on the image above
                  </p>
                  {allDetections.length > detections.length && (
                    <p style={{ fontSize: '0.85rem', color: '#999', margin: '0.5rem 0' }}>
                      ({allDetections.length - detections.length} additional detection{allDetections.length - detections.length !== 1 ? 's' : ''} below confidence threshold)
                    </p>
                  )}
                </div>
                )}
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
{`const { EyePop, PopComponentType, ForwardOperatorType } = require("@eyepop.ai/eyepop");

const endpoint = await EyePop.workerEndpoint({
  auth: { secretKey: "YOUR_API_KEY" },
  stopJobs: false
}).connect();

await endpoint.changePop({
  components: [{
    type: PopComponentType.INFERENCE,
    ability: "eyepop.localize-objects:latest",
    params: {
      prompt: "${detectPrompt}"
    }${questions.length > 0 ? `,
    forward: {
      operator: {
        type: ForwardOperatorType.CROP
      },
      targets: [{
        type: PopComponentType.INFERENCE,
        ability: "eyepop.image-contents:latest",
        params: {
          prompts: [{
            prompt: "Analyze the image provided and determine the categories of: ${questions.join(', ')}. Report the values of the categories as classLabels. If you are unable to provide a category with a value then set its classLabel to null"
          }]
        }
      }]
    }` : ''}
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
        objects: [obj],
        classes: obj.classes || []
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
        <Link to="/person-detection" style={{ color: '#1A1AFF', textDecoration: 'none', fontWeight: '600' }}>Person Detection</Link>
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
