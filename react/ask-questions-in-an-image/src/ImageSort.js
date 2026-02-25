import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vs } from 'react-syntax-highlighter/dist/esm/styles/prism';
import Login from './Login';
import { loadDb, saveDb, clearDb } from './localStorageDb';
import './App.css';

const DB_KEY = 'eyepop_image_sort_db';

const CATEGORY_PRESETS = {
  "Fashion": ["Shoes", "Watches", "T-Shirts", "Pants", "Hats", "Bags"],
  "Food": ["Fruits", "Vegetables", "Meat", "Desserts", "Beverages", "Snacks"],
  "Vehicles": ["Cars", "Trucks", "Motorcycles", "Bicycles", "Boats", "Planes"]
};

function generateThumbnail(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 200;
      canvas.height = 200;
      const ctx = canvas.getContext('2d');
      const scale = Math.max(200 / img.width, 200 / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, (200 - w) / 2, (200 - h) / 2, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.src = dataUrl;
  });
}

function ImageSort() {
  useEffect(() => {
    document.title = "Image Sort | EyePop.ai";
  }, []);

  const [apiKey, setApiKey] = useState(() => sessionStorage.getItem('eyepop_api_key') || null);
  const [isAuthenticated, setIsAuthenticated] = useState(() => sessionStorage.getItem('eyepop_authenticated') === 'true');

  const [images, setImages] = useState([]); // { id, name, src, thumbnail }
  const [selectedPreset, setSelectedPreset] = useState("Fashion");
  const [categories, setCategories] = useState(CATEGORY_PRESETS["Fashion"]);
  const [newCategory, setNewCategory] = useState('');
  const [results, setResults] = useState({}); // { filename: { label, confidence, thumbnail } }
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const fileInputRef = useRef(null);

  // Restore from localStorage on mount
  useEffect(() => {
    const db = loadDb(DB_KEY);
    if (db) {
      if (db.categories) setCategories(db.categories);
      if (db.images) {
        setResults(db.images);
      }
    }
  }, []);

  const handleLogin = (key) => {
    setApiKey(key);
    setIsAuthenticated(true);
    sessionStorage.setItem('eyepop_api_key', key);
    sessionStorage.setItem('eyepop_authenticated', 'true');
  };

  const handleLogout = () => {
    setApiKey(null);
    setIsAuthenticated(false);
    sessionStorage.removeItem('eyepop_api_key');
    sessionStorage.removeItem('eyepop_authenticated');
    setImages([]);
    setResults({});
    setProcessing(false);
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    addFiles(files);
  }, []);

  const addFiles = (files) => {
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        setImages(prev => [...prev, {
          id: Date.now() + '_' + Math.random().toString(36).slice(2),
          name: file.name,
          src: reader.result
        }]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleRemoveImage = (id) => {
    setImages(prev => prev.filter(img => img.id !== id));
  };

  const handlePresetChange = (e) => {
    const preset = e.target.value;
    setSelectedPreset(preset);
    if (CATEGORY_PRESETS[preset]) {
      setCategories(CATEGORY_PRESETS[preset]);
    }
  };

  const handleAddCategory = () => {
    if (newCategory.trim() && !categories.includes(newCategory.trim())) {
      setCategories(prev => [...prev, newCategory.trim()]);
      setNewCategory('');
      setSelectedPreset('Custom');
    }
  };

  const handleRemoveCategory = (idx) => {
    setCategories(prev => prev.filter((_, i) => i !== idx));
    setSelectedPreset('Custom');
  };

  const handleClassify = async () => {
    if (images.length === 0 || categories.length === 0) return;
    setProcessing(true);
    setProgress({ current: 0, total: images.length });

    const newResults = { ...results };

    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      setProgress({ current: i + 1, total: images.length });

      try {
        const base64 = img.src.split(",")[1];
        const response = await fetch("/api/classify-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: base64, categories, apiKey })
        });

        if (response.status === 413) continue;

        const data = await response.json();
        const cls = data.classes && data.classes[0];
        const thumbnail = await generateThumbnail(img.src);

        newResults[img.name] = {
          thumbnail,
          label: cls ? cls.classLabel : "Other",
          confidence: cls ? cls.confidence : 0,
          classifiedAt: new Date().toISOString()
        };
      } catch (err) {
        console.error(`Error classifying ${img.name}:`, err);
        const thumbnail = await generateThumbnail(img.src);
        newResults[img.name] = {
          thumbnail,
          label: "Error",
          confidence: 0,
          classifiedAt: new Date().toISOString()
        };
      }
    }

    setResults(newResults);
    saveDb(DB_KEY, { categories, images: newResults });
    setProcessing(false);
    setImages([]);
  };

  const handleClearResults = () => {
    setResults({});
    clearDb(DB_KEY);
  };

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  // Group results by category for folder view
  const folders = {};
  Object.entries(results).forEach(([name, data]) => {
    const label = data.label || "Other";
    if (!folders[label]) folders[label] = [];
    folders[label].push({ name, ...data });
  });

  const hasResults = Object.keys(results).length > 0;

  return (
    <div className="app-container">
      <HeaderBar onLogout={handleLogout} />
      <div className="main-content">
        <div
          className="drop-zone"
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => { fileInputRef.current.value = null; fileInputRef.current.click(); }}
          style={{ cursor: 'pointer', flexDirection: 'column', padding: '1rem' }}
        >
          <input
            type="file"
            accept="image/*"
            multiple
            ref={fileInputRef}
            style={{ display: 'none' }}
            onChange={(e) => addFiles(Array.from(e.target.files))}
          />
          {images.length > 0 ? (
            <div className="image-grid">
              {images.map((img) => (
                <div key={img.id} className="image-grid-item">
                  <img src={img.src} alt={img.name} />
                  <button
                    className="image-remove-btn"
                    onClick={(e) => { e.stopPropagation(); handleRemoveImage(img.id); }}
                  >
                    x
                  </button>
                  <span className="image-grid-name">{img.name}</span>
                </div>
              ))}
            </div>
          ) : hasResults ? (
            <div className="folder-tree">
              {Object.entries(folders).sort((a, b) => b[1].length - a[1].length).map(([label, items]) => (
                <FolderNode key={label} label={label} items={items} />
              ))}
            </div>
          ) : (
            <div className="drop-message">
              Drop images here or click to select (multiple files supported)
            </div>
          )}
        </div>
        <div className="sidebar">
          <div style={{ marginBottom: '1.5rem', padding: '0.75rem', background: '#f0f0ff', borderRadius: '6px', border: '1px solid #d0d0ff' }}>
            <h4 style={{ margin: '0 0 0.5rem 0', color: '#1A1AFF' }}>Ability</h4>
            <div style={{ fontSize: '0.8rem', color: '#555', marginBottom: '0.25rem' }}>
              <strong>Model:</strong> qwen3-instruct
            </div>
            <div style={{ fontSize: '0.8rem', color: '#555' }}>
              <strong>Prompt:</strong>{' '}
              <span style={{ fontStyle: 'italic' }}>
                "Classify this image into exactly one of: {categories.join(', ')}. Return only the category name as the classLabel."
              </span>
            </div>
          </div>
          <h3>Categories</h3>
          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="presetSelect" style={{ marginRight: '0.5rem' }}>Preset:</label>
            <select id="presetSelect" value={selectedPreset} onChange={handlePresetChange}>
              {Object.keys(CATEGORY_PRESETS).map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
              <option value="Custom">Custom</option>
            </select>
          </div>
          <ul className="questions-list">
            {categories.map((cat, i) => (
              <li key={i} className="question-item">
                <span>{cat}</span>
                <button onClick={() => handleRemoveCategory(i)} title="Remove">Remove</button>
              </li>
            ))}
          </ul>
          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              placeholder="Add category"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
              style={{ width: '100%' }}
            />
            <button onClick={handleAddCategory} className="eyepop-button">Add</button>
          </div>

          {processing && (
            <div style={{ marginTop: '1.5rem' }}>
              <div className="progress-bar-container">
                <div
                  className="progress-bar-fill"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
              <p style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.5rem' }}>
                Classifying {progress.current} of {progress.total}...
              </p>
            </div>
          )}

          {hasResults && (
            <div style={{ marginTop: '1.5rem' }}>
              <h4>Summary</h4>
              {Object.entries(folders).sort((a, b) => b[1].length - a[1].length).map(([label, items]) => (
                <div key={label} style={{ fontSize: '0.9rem', marginBottom: '0.25rem' }}>
                  <strong>{label}</strong>: {items.length} image{items.length !== 1 ? 's' : ''}
                </div>
              ))}
              <button
                onClick={handleClearResults}
                className="eyepop-button"
                style={{ marginTop: '1rem' }}
              >
                Clear Results
              </button>
            </div>
          )}
        </div>
      </div>

      {hasResults && (
        <div style={{ padding: '1rem 2rem', background: '#fff', borderTop: '1px solid #e0e0e0' }}>
          <h4 style={{ margin: '0 0 0.75rem 0', color: '#333' }}>Example Code</h4>
          <SyntaxHighlighter
            language="javascript"
            style={vs}
            customStyle={{ borderRadius: '6px', margin: 0, maxHeight: '400px', fontSize: '0.85rem', background: '#f5f5f5' }}
          >
{`const { EyePop, PopComponentType } = require("@eyepop.ai/eyepop");

const endpoint = await EyePop.workerEndpoint({
  auth: { apiKey: "YOUR_API_KEY" },
  eyepopUrl: "https://compute.staging.eyepop.xyz",
  stopJobs: false
}).connect();

await endpoint.changePop({
  components: [{
    type: PopComponentType.INFERENCE,
    params: {
      worker_release: "qwen3-instruct",
      text_prompt: "Classify this image into exactly one of: ${categories.join(', ')}. Return only the category name.",
      config: {
        do_sample: false,
        max_new_tokens: 2000,
        temperature: 0.1,
        image_size: 400
      }
    }
  }]
});

const blob = new Blob([Buffer.from(imageBase64, "base64")], { type: "image/png" });
const results = await endpoint.process({ file: blob, mimeType: "image/png" });

for await (let result of results) {
  if (result.classes) console.log(result.classes);
  if (result.texts) console.log(result.texts);
  break;
}`}
          </SyntaxHighlighter>
        </div>
      )}

      <div className="bottom-bar">
        <div>
          {processing
            ? `Classifying ${progress.current}/${progress.total}...`
            : hasResults
              ? `${Object.keys(results).length} image${Object.keys(results).length !== 1 ? 's' : ''} classified`
              : `${images.length} image${images.length !== 1 ? 's' : ''} ready`}
        </div>
        <div>
          <button
            onClick={handleClassify}
            disabled={processing || images.length === 0 || categories.length === 0}
          >
            {processing ? 'Classifying...' : 'Classify All'}
          </button>
        </div>
      </div>
    </div>
  );
}

function FolderNode({ label, items }) {
  const [expanded, setExpanded] = useState(true);
  return (
    <div className="folder-node">
      <div className="folder-header" onClick={() => setExpanded(!expanded)}>
        <span className="folder-icon">{expanded ? '▼' : '▶'}</span>
        <span className="folder-label">{label}</span>
        <span className="folder-count">({items.length})</span>
      </div>
      {expanded && (
        <div className="folder-children">
          {items.map((item) => (
            <div key={item.name} className="folder-file">
              <img src={item.thumbnail} alt={item.name} className="folder-thumb" />
              <div className="folder-file-info">
                <span className="folder-file-name">{item.name}</span>
                <span className="folder-file-confidence">{(item.confidence * 100).toFixed(0)}% confidence</span>
                <span style={{ fontSize: '0.7rem', color: '#888', display: 'block', marginTop: '2px' }}>
                  Category: {item.label} | Classified: {item.classifiedAt ? new Date(item.classifiedAt).toLocaleTimeString() : ''}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
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
      <span style={{ fontSize: '2rem', fontWeight: 'bold' }}>Image Sort</span>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <Link to="/" style={{ color: '#1A1AFF', textDecoration: 'none', fontWeight: '600' }}>Image Q&A</Link>
        <Link to="/detect-and-ask" style={{ color: '#1A1AFF', textDecoration: 'none', fontWeight: '600' }}>Detect + Ask</Link>
        <Link to="/person-detection" style={{ color: '#1A1AFF', textDecoration: 'none', fontWeight: '600' }}>Person Detection</Link>
        <Link to="/image-sort" style={{ color: '#1A1AFF', textDecoration: 'none', fontWeight: '600' }}>Image Sort</Link>
        <Link to="/image-search" style={{ color: '#1A1AFF', textDecoration: 'none', fontWeight: '600' }}>Image Search</Link>
        <button onClick={onLogout} className="logout-button">Logout</button>
      </div>
    </header>
  );
}

export default ImageSort;
