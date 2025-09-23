import React, { useState, useCallback, useRef, useEffect } from 'react';
import { EyePop, PopComponentType } from '@eyepop.ai/eyepop';
import './App.css';

function App() {
  useEffect(() => {
    document.title = "Ask Questions of an Image | EyePop.ai";
  }, []);

  const [image, setImage] = useState(null);
  const [questions, setQuestions] = useState([
    // "Is the water heater in this image a tank or tankless model (tank/tankless)?",
    // "Is the water heater in this image showing signs of rust or corrosion (Yes/No)?",
    // "Is the water heater in this image showing signs of leaking (Yes/No)?",
    // "Is the water heater in this image a gas or electric model (gas/electric)?",
    // "What is the brand of the water heater in this image?",
    // "What is the color of the water heater in this image?",
    // "What is the shape of the water heater in this image?",
    // "What is the condition of the water heater in this image (new/old/damaged)?"
    "How clean is the fireplace interior (e.g., soot/creosote buildup, clean)?",
    "Are there any safety concerns visible with the fireplace (e.g., blockage potential)?",
    "What is the overall condition of the fireplace (e.g., good, worn, structural concerns)?",
    "Is there visible water damage around the fireplace (Yes/No)?",
    "Are there any ventilation issues with the fireplace (e.g., clear, obstructed)?"

  ]);
  const [newQuestion, setNewQuestion] = useState('');
  const handleAddQuestion = () => {
    if (newQuestion.trim()) {
      setQuestions([...questions, newQuestion.trim()]);
      setNewQuestion('');
    }
  };

  const handleRemoveQuestion = (idx) => {
    setQuestions((qs) => qs.filter((_, i) => i !== idx));
  };
  const [state, setState] = useState('Ready');
  const [resultsClasses, setResultsClasses] = useState([]);
  const endpointRef = useRef(null);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => setImage({ src: reader.result, file });
      reader.readAsDataURL(file);
    }
  }, []);

  const handleDragOver = (e) => e.preventDefault();

  // Move endpoint initialization and pop change to useEffect so it runs on load
  React.useEffect(() => {
    const setupEndpoint = async () => {
      setState('Setting up...');
      if (!endpointRef.current) {
        const api_key = process.env.REACT_APP_ANYTHING_POP_API_KEY;
        console.log("Using API Key:", api_key);
        endpointRef.current = await EyePop.workerEndpoint({
          auth: { secretKey: api_key },
          stopJobs: false
        }).connect();
      }
      setState('Ready');


    };
    setupEndpoint();
    // Only run once on mount, or when questions change
  }, []);

  const handleContinue = async () => {
    if (!image) return;
    console.log('Processing image:', image);

    setState('Setting Questions...');

    await endpointRef.current.changePop({
      components: [{
        type: PopComponentType.INFERENCE,
        id: 2,
        ability: 'eyepop.image-contents:latest',
        params: {
          prompts: [{
            prompt: "Analyze the image provided and determine the categories of: " +
              questions.join(", ") +
              ". Report the values of the categories as classLabels. If you are unable to provide a category with a value then set its classLabel to null"
          }],
        }
      }]
    });

    setState('Processing...');

    const results = await endpointRef.current.process({
      file: image.file,
      mimeType: 'image/*',
    });

    // const ctx = canvasRef.current ? canvasRef.current.getContext('2d') : null;
    const collectedClasses = [];
    for await (let result of results) {
      console.log('Result:', result);
      if (result.classes) {
        collectedClasses.push(...result.classes);
      }
      break; // We only expect one result for the full image
    }
    setResultsClasses(collectedClasses);
    setState('Results');
  };

  const fileInputRef = useRef(null);

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

  return (
    <div className="app-container">
      <HeaderBar />
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
              <div style={{ marginTop: '3rem', display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  placeholder="Enter a new question"
                  value={newQuestion}
                  onChange={(e) => setNewQuestion(e.target.value)}
                  style={{ width: '100%' }}
                />
                <button onClick={handleAddQuestion} className='eyepop-button'>
                  Add Question
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
                    Question: {cls.category}<br />
                    Label: <strong>{cls.classLabel.toLowerCase() === "null" ? 'N/A' : cls.classLabel}</strong><br />
                    Confidence: <strong>{(cls.confidence * 100).toFixed(1)}%</strong>
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
      <div className="bottom-bar">
        <div>State: {state}</div>
        <div>
          <button
            onClick={handleContinue}
            disabled={(state != 'Ready' && state != 'Results') || !image}
          >Continue</button>
        </div>
      </div>
    </div>
  );
}

// Add a header bar with eyepop.ai's logo
function HeaderBar() {
  return (
    <header className="header-bar">
      <img
        src="https://cdn.prod.website-files.com/645c6c444d18e50035fd225e/6840e092fd44d726152a1248_logo-horizontal-800.svg"
        alt="EyePop Logo"
        style={{ height: 40, marginRight: 16 }}
      />
      <span style={{ fontSize: '2rem', fontWeight: 'bold' }}>Image Q&A Demo</span>
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