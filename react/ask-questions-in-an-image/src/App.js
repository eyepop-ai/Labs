import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Login from './Login';
import './App.css';

function App() {
  useEffect(() => {
    document.title = "Ask Questions of an Image | EyePop.ai";
  }, []);

  // Define question sets first (needed for initial state)
  const questionSets = {
    "Image Description": [
      "What objects are present in the image? (Comma delimited list)",
      "What is the dominant color of the image?",
      "Was the image taken indoors or outdoors?",
      "Describe this image in one sentence.",
      "Describe this image in one paragraph.",
      "What is the mood of the image (happy, sad, neutral)?",
      

    ],
    "Content Monitoring": [
      "What content is present in the image? (Comma delimited list)",
      "What is the context of the image? (one sentence)",
      "Are there any explicit or inappropriate elements in the image? (Yes/No)",
      "Are there any violent elements in the image? (Yes/No)",
      "Are there any political elements in the image? (Yes/No)",
      "Are there any religious elements in the image? (Yes/No)",
      "Are there any medical elements in the image? (Yes/No)",
      "Are there any legal elements in the image? (Yes/No)"

    ],
    "Car Inspection": [
      "What is the overall condition of the car (good, worn, damaged)?",
      "What is the color of the car?",
      "What is the condition of the tires (good, worn, damaged)?",
      "What part of the car can you see clearly? (Front Driver side/Front Passenger side/Rear Driver side/Rear Passenger side/Top/Undercarriage/Front head on/Back head on)."
    ],
    "Home Inspection": [
      "What is the condition of the roof (intact, damaged)?",
      "What is the condition of the walls (no cracks, cracked)?",
      "What is the condition of the paint (intact, peeling)?"
    ],
    "Person Style": [
      "What type of clothing is the person wearing?",
      "What accessories is the person wearing?",
      "What is the person’s hair color?"
    ],
    "Person Action": [
      "What is the person doing (1-2 words for the action)?",
      "What object is the person holding?",
      "What is the person’s facial expression (smiling, neutral, frowning)?"
    ],
    "Fireplace Inspection": [
      "What is the cleanliness of the fireplace interior (clean, soot buildup, creosote buildup)?",
      "What are the visible safety concerns with the fireplace (none, blockage potential)?",
      "What is the overall condition of the fireplace (good, worn, structural concerns)?",
      "Is there visible water damage around the fireplace (Yes/No)?",
      "What is the condition of fireplace ventilation (clear, obstructed)?"
    ],
    "Water Heater Inspection": [
      "What type of water heater is this (tank, tankless)?",
      "Is the water heater showing signs of rust or corrosion (Yes/No)?",
      "Is the water heater showing signs of leaking (Yes/No)?",
      "What is the fuel type of the water heater (gas, electric)?",
      "What is the brand of the water heater?",
      "What is the color of the water heater?",
      "What is the shape of the water heater?",
      "What is the overall condition of the water heater (new, old, damaged)?"
    ]
  };

  // ALL state hooks must be declared before any conditional returns
  // Authentication state - persist in sessionStorage
  const [apiKey, setApiKey] = useState(() => {
    return sessionStorage.getItem('eyepop_api_key') || null;
  });
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return sessionStorage.getItem('eyepop_authenticated') === 'true';
  });

  // App state
  const [selectedQuestionSet, setSelectedQuestionSet] = useState("Water Heater Inspection");
  const [image, setImage] = useState(null);
  const [questions, setQuestions] = useState(questionSets[selectedQuestionSet]);
  const [newQuestion, setNewQuestion] = useState('');
  const [state, setState] = useState('Ready');
  const [resultsClasses, setResultsClasses] = useState([]);
  const fileInputRef = useRef(null);

  // ALL useCallback hooks must be declared before conditional returns
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => setImage({ src: reader.result, file });
      reader.readAsDataURL(file);
    }
  }, []);

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
    setQuestions(questionSets[selectedQuestionSet]);
    setResultsClasses([]);
    setState('Ready');
  };

  // If not authenticated, show login page (AFTER all hooks)
  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  // Regular event handlers
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

  const handleContinue = async () => {
    if (!image) return;

    setState("Processing...");

    const base64 = image.src.split(",")[1]; // remove data:image prefix

    const response = await fetch("/api/ask-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questions, imageBase64: base64, apiKey })
    });

    const data = await response.json();
    setResultsClasses(data.classes || []);
    setState("Results");
  };

  const handleDropZoneClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = null; // Reset so same file can be selected again
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

  const handleQuestionSetChange = (e) => {
    const selectedSet = e.target.value;
    setSelectedQuestionSet(selectedSet);
    setQuestions(questionSets[selectedSet]);
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
            <img src={image.src} alt="Preview" />
          ) : (
            <div className="drop-message">
              Drop image here or click to select
            </div>
          )}
        </div>
        <div className="sidebar" >
          {resultsClasses.length === 0 && (
            <>
              <div style={{ marginBottom: '1rem' }}>
                <label htmlFor="questionSetSelect" style={{ marginRight: '0.5rem' }}>Select Question Set:</label>
                <select id="questionSetSelect" value={selectedQuestionSet} onChange={handleQuestionSetChange}>
                  {Object.keys(questionSets).map((setName) => (
                    <option key={setName} value={setName}>{setName}</option>
                  ))}
                </select>
              </div>
              <h3>Questions</h3>
              <ul className="questions-list">
                {questions.map((q, i) => (

                  <li
                    key={i}
                    className="question-item"
                  >
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
          {resultsClasses.length > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <h4>Results</h4>
              <ul className="results-list">
                {resultsClasses.map((cls, idx) => (
                  <li key={idx} className="result-item">
                    {cls.category}<br />
                    <strong>{cls.classLabel.toLowerCase() === "null" ? 'N/A' : cls.classLabel}</strong><br />
                    <strong>{(cls.confidence * 100).toFixed(1)}%</strong> confidence
                  </li>
                ))}
              </ul>
              <button
                onClick={() => {
                  setResultsClasses([]);
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
      {resultsClasses.length > 0 && (
        <div style={{ 
          padding: '1rem 2rem', 
          background: '#fff', 
          borderTop: '1px solid #e0e0e0'
        }}>
          <h4 style={{ margin: '0 0 0.75rem 0', color: '#333' }}>📋 Example Code</h4>
          <pre style={{ 
            background: '#f5f5f5', 
            border: '1px solid #ddd',
            color: '#333', 
            padding: '1rem', 
            borderRadius: '6px', 
            overflow: 'auto',
            fontSize: '0.8rem',
            margin: 0,
            maxHeight: '300px',
            lineHeight: '1.5'
          }}>
{`const { EyePop, PopComponentType } = require("@eyepop.ai/eyepop");

const endpoint = await EyePop.workerEndpoint({
  auth: { secretKey: "YOUR_API_KEY" },
  stopJobs: false
}).connect();

await endpoint.changePop({
  components: [{
    type: PopComponentType.INFERENCE,
    ability: "eyepop.image-contents:latest",
    params: {
      prompts: [{
        prompt: "Analyze the image provided and determine the categories of: ${questions.join(', ')}. Report the values of the categories as classLabels."
      }]
    }
  }]
});

const blob = new Blob([Buffer.from(imageBase64, "base64")], { 
  type: "image/png" 
});

const results = await endpoint.process({
  file: blob,
  mimeType: "image/png"
});

let collected = [];
for await (let result of results) {
  if (result.classes) {
    collected.push(...result.classes);
  }
}

console.log(collected);`}
          </pre>
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

// Add a header bar with eyepop.ai's logo
function HeaderBar({ onLogout }) {
  return (
    <header className="header-bar">
      <img
        src="https://cdn.prod.website-files.com/645c6c444d18e50035fd225e/6840e092fd44d726152a1248_logo-horizontal-800.svg"
        alt="EyePop Logo"
        style={{ height: 40, marginRight: 16 }}
      />
      <span style={{ fontSize: '2rem', fontWeight: 'bold' }}>Image Q&A Demo</span>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <Link to="/" style={{ color: '#1A1AFF', textDecoration: 'none', fontWeight: '600' }}>Image Q&A</Link>
        <Link to="/detect-and-ask" style={{ color: '#1A1AFF', textDecoration: 'none', fontWeight: '600' }}>Detect + Ask</Link>
        <Link to="/person-detection" style={{ color: '#1A1AFF', textDecoration: 'none', fontWeight: '600' }}>Person Detection</Link>
        <button onClick={onLogout} className="logout-button">Logout</button>
      </div>
    </header>
  );
}

// Insert the header bar at the top of the app
export default function AppWithHeader(props) {
  return (
    <>
      <App {...props} />
    </>
  );
}