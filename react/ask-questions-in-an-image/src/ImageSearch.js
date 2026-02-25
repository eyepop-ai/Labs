import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vs } from 'react-syntax-highlighter/dist/esm/styles/prism';
import Login from './Login';
import { loadDb, saveDb, clearDb } from './localStorageDb';
import './App.css';

const DB_KEY = 'eyepop_image_search_db';

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

function scoreSearch(query, item) {
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return 0;

  let total = 0;
  for (const word of words) {
    let wordScore = 0;
    // Tag match: +0.4
    if (item.tags && item.tags.some(t => t.toLowerCase().includes(word))) {
      wordScore += 0.4;
    }
    // Description substring: +0.3
    if (item.description && item.description.toLowerCase().includes(word)) {
      wordScore += 0.3;
    }
    // Object match: +0.3
    if (item.objects && item.objects.some(o => o.toLowerCase().includes(word))) {
      wordScore += 0.3;
    }
    total += wordScore;
  }
  return total / words.length;
}

function ImageSearch() {
  useEffect(() => {
    document.title = "Image Search | EyePop.ai";
  }, []);

  const [apiKey, setApiKey] = useState(() => sessionStorage.getItem('eyepop_api_key') || null);
  const [isAuthenticated, setIsAuthenticated] = useState(() => sessionStorage.getItem('eyepop_authenticated') === 'true');

  const [images, setImages] = useState([]); // pending upload: { id, name, src }
  const [ingested, setIngested] = useState({}); // { filename: { thumbnail, description, tags, objects, ingestedAt } }
  const [searchQuery, setSearchQuery] = useState('');
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const fileInputRef = useRef(null);

  // Restore from localStorage on mount
  useEffect(() => {
    const db = loadDb(DB_KEY);
    if (db && db.images) {
      setIngested(db.images);
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
    setIngested({});
    setSearchQuery('');
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

  const handleIngest = async () => {
    if (images.length === 0) return;
    setProcessing(true);
    setProgress({ current: 0, total: images.length });

    const newIngested = { ...ingested };

    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      setProgress({ current: i + 1, total: images.length });

      try {
        const base64 = img.src.split(",")[1];
        const response = await fetch("/api/describe-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: base64, apiKey })
        });

        if (response.status === 413) continue;

        const data = await response.json();
        const desc = data.description || {};
        const thumbnail = await generateThumbnail(img.src);

        newIngested[img.name] = {
          thumbnail,
          description: desc.description || '',
          tags: desc.tags || [],
          objects: desc.objects || [],
          ingestedAt: new Date().toISOString()
        };
      } catch (err) {
        console.error(`Error describing ${img.name}:`, err);
        const thumbnail = await generateThumbnail(img.src);
        newIngested[img.name] = {
          thumbnail,
          description: 'Error processing image',
          tags: [],
          objects: [],
          ingestedAt: new Date().toISOString()
        };
      }
    }

    setIngested(newIngested);
    saveDb(DB_KEY, { images: newIngested });
    setProcessing(false);
    setImages([]);
  };

  const handleClearIngested = () => {
    setIngested({});
    clearDb(DB_KEY);
  };

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return Object.entries(ingested)
      .map(([name, data]) => ({
        name,
        ...data,
        relevance: scoreSearch(searchQuery, data)
      }))
      .filter(r => r.relevance > 0)
      .sort((a, b) => b.relevance - a.relevance);
  }, [searchQuery, ingested]);

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  const ingestedCount = Object.keys(ingested).length;

  return (
    <div className="app-container">
      <HeaderBar onLogout={handleLogout} />
      <div className="main-content" style={{ flexDirection: 'column' }}>
        {/* Upload area */}
        <div
          className="drop-zone"
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => { fileInputRef.current.value = null; fileInputRef.current.click(); }}
          style={{ cursor: 'pointer', minHeight: images.length > 0 ? 'auto' : '200px', padding: '1rem', flex: 'none' }}
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
          ) : (
            <div className="drop-message">
              Drop images here or click to select for ingestion
            </div>
          )}
        </div>

        {/* Progress bar */}
        {processing && (
          <div style={{ padding: '0.5rem 2rem' }}>
            <div className="progress-bar-container">
              <div
                className="progress-bar-fill"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
            <p style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.25rem' }}>
              Describing {progress.current} of {progress.total}...
            </p>
          </div>
        )}

        {/* Ability info */}
        <div style={{ padding: '0.75rem 2rem', background: '#f0f0ff', borderBottom: '1px solid #d0d0ff' }}>
          <h4 style={{ margin: '0 0 0.5rem 0', color: '#1A1AFF' }}>Ability</h4>
          <div style={{ fontSize: '0.8rem', color: '#555', marginBottom: '0.25rem' }}>
            <strong>Model:</strong> qwen3-instruct
          </div>
          <div style={{ fontSize: '0.8rem', color: '#555' }}>
            <strong>Prompt:</strong>{' '}
            <span style={{ fontStyle: 'italic' }}>
              "Describe this image in detail. Return JSON: {'{"description": "...", "tags": [...], "objects": [...]}'}"
            </span>
          </div>
        </div>

        {/* Search bar */}
        {ingestedCount > 0 && (
          <div style={{ padding: '1rem 2rem', borderBottom: '1px solid #e0e0e0', background: '#fff' }}>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                type="text"
                placeholder={`Search across ${ingestedCount} ingested image${ingestedCount !== 1 ? 's' : ''}...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ flex: 1, padding: '0.75rem 1rem', border: '2px solid #e0e0e0', borderRadius: '6px', fontSize: '1rem' }}
                onClick={(e) => e.stopPropagation()}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="eyepop-button"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        )}

        {/* Search Results or Ingested Library */}
        <div style={{ flex: 1, overflow: 'auto', padding: '1rem 2rem' }}>
          {searchQuery.trim() ? (
            searchResults.length > 0 ? (
              <div>
                <h4 style={{ marginTop: 0 }}>{searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for "{searchQuery}"</h4>
                <div className="search-results-grid">
                  {searchResults.map((item) => (
                    <div key={item.name} className="search-result-card">
                      <img src={item.thumbnail} alt={item.name} className="search-result-thumb" />
                      <div className="search-result-info">
                        <div className="search-result-name">{item.name}</div>
                        <div className="search-result-desc">{item.description}</div>
                        <div className="search-result-tags">
                          {item.tags.map((tag, i) => (
                            <span key={i} className="search-tag-chip">{tag}</span>
                          ))}
                        </div>
                        <div className="search-result-relevance">
                          {(item.relevance * 100).toFixed(0)}% relevance
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', color: '#999', padding: '3rem' }}>
                No results found for "{searchQuery}"
              </div>
            )
          ) : ingestedCount > 0 ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h4 style={{ margin: 0 }}>Ingested Library ({ingestedCount} image{ingestedCount !== 1 ? 's' : ''})</h4>
                <button onClick={handleClearIngested} className="eyepop-button">Clear Library</button>
              </div>
              <div className="search-results-grid">
                {Object.entries(ingested).map(([name, data]) => (
                  <div key={name} className="search-result-card">
                    <img src={data.thumbnail} alt={name} className="search-result-thumb" />
                    <div className="search-result-info">
                      <div className="search-result-name">{name}</div>
                      <div className="search-result-desc">{data.description}</div>
                      {data.tags && data.tags.length > 0 && (
                        <div className="search-result-tags">
                          <span style={{ fontSize: '0.7rem', color: '#888', marginRight: '0.25rem' }}>Tags:</span>
                          {data.tags.map((tag, i) => (
                            <span key={i} className="search-tag-chip">{tag}</span>
                          ))}
                        </div>
                      )}
                      {data.objects && data.objects.length > 0 && (
                        <div className="search-result-tags" style={{ marginTop: '0.25rem' }}>
                          <span style={{ fontSize: '0.7rem', color: '#888', marginRight: '0.25rem' }}>Objects:</span>
                          {data.objects.map((obj, i) => (
                            <span key={i} className="search-tag-chip" style={{ background: '#e8f5e9', color: '#2e7d32' }}>{obj}</span>
                          ))}
                        </div>
                      )}
                      <div style={{ fontSize: '0.7rem', color: '#aaa', marginTop: '0.25rem' }}>
                        Ingested: {data.ingestedAt ? new Date(data.ingestedAt).toLocaleString() : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', color: '#999', padding: '3rem' }}>
              Upload and ingest images to start searching
            </div>
          )}
        </div>
      </div>

      {/* Code Example */}
      {ingestedCount > 0 && (
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
      text_prompt: 'Describe this image in detail. Return JSON: {"description": "...", "tags": [...], "objects": [...]}',
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
  // Parse VLM response as JSON for description, tags, and objects
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
            ? `Ingesting ${progress.current}/${progress.total}...`
            : `${ingestedCount} ingested | ${images.length} pending`}
        </div>
        <div>
          <button
            onClick={handleIngest}
            disabled={processing || images.length === 0}
          >
            {processing ? 'Ingesting...' : 'Ingest All'}
          </button>
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
      <span style={{ fontSize: '2rem', fontWeight: 'bold' }}>Image Search</span>
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

export default ImageSearch;
