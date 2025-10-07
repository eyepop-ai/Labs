import React, { useState } from 'react';
import './App.css';

function Login({ onLogin }) {
  const [apiKey, setApiKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/validate-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey })
      });

      const data = await response.json();

      if (response.ok && data.valid) {
        // Store credentials and notify parent component
        onLogin(apiKey);
      } else {
        setError(data.error || 'Invalid EyePop credentials. Please try again.');
      }
    } catch (err) {
      setError('Failed to validate credentials. Please check your connection and try again.');
      console.error('Login error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <div className="login-header">
          <img
            src="https://cdn.prod.website-files.com/645c6c444d18e50035fd225e/6840e092fd44d726152a1248_logo-horizontal-800.svg"
            alt="EyePop Logo"
            className="login-logo"
          />
          <h1>Image Q&A Demo</h1>
          <p className="login-subtitle">Enter your EyePop credentials to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="apiKey">EyePop API Key</label>
            <input
              type="password"
              id="apiKey"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter your EyePop API key"
              required
              disabled={isLoading}
              className="login-input"
            />
          </div>

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || !apiKey.trim()}
            className="login-button"
          >
            {isLoading ? 'Validating...' : 'Continue'}
          </button>
        </form>

        <div className="login-footer">
          <p>Don't have an API key?</p>
          <a
            href="https://dashboard.eyepop.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="signup-link"
          >
            Get started with EyePop.ai
          </a>
        </div>
      </div>
    </div>
  );
}

export default Login;

