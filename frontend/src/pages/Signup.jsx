import React, { useState } from 'react';

/**
 * Signup component for user registration.
 * Handles username and password input, and calls the signup function.
 */
function Signup({ onSwitchToLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
 
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    try {
      // API call to the backend for signup
      const response = await fetch('/api/signup/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password,
          admin: false, // Default to non-admin
          login_allowed: true // Default to login disabled, admin must enable (as per backend logic)
        }),
      });

      if (response.ok) {
        setMessage('Sign up successful! Please wait for an administrator to enable your account.');
        // After a delay, switch back to the login form
        setTimeout(() => onSwitchToLogin(), 3000);
        navigate('/login'); // Redirect to login page after successful signup
      } else {
        const errorData = await response.json();
        setError(errorData.detail || 'Sign up failed.');
      }
    } catch (err) {
      console.error('Signup network error:', err);
      setError('Network error during signup.');
    }
  };

  return (
    <>
      <div className="section-container">
        <div className="login-header">
          <h2 className="login-header-title">Sign Up</h2>
        </div>
        <div className="login-body">
          <form onSubmit={handleSubmit} className="form-grid">
            <div className="form-group">
              <label htmlFor="username" className="form-label">
                Username
              </label>
              <input
                type="text"
                id="username"
                className="form-input-base"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                aria-label="Username"
              />
            </div>
            <div className="form-group">
              <label htmlFor="password" className="form-label">
                Password
              </label>
              <input
                type="password"
                id="password"
                className="form-input-base"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                aria-label="Password"
              />
            </div>
            <div className="form-group">
              <label htmlFor="confirmPassword" className="form-label">
                Confirm Password
              </label>
              <input
                type="password"
                id="confirmPassword"
                className="form-input-base"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                aria-label="Confirm Password"
              />
            </div>
            {error && (
              <div className="message-error">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586l-1.293-1.293z" clipRule="evenodd"></path></svg>
                <span>{error}</span>
              </div>
            )}
            {message && (
              <div className="message">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"></path></svg>
                <span>{message}</span>
              </div>
            )}
            <button
              type="submit"
              className="btn-base btn-primary"
            >
              Sign Up
            </button>
          </form>
        </div>
      </div>
      <div className="section-container">
        <div className="login-body"> 
          <div className="login-body-inner">
            <p className="login-link">
              Already have an account?{' '}
              <button onClick={onSwitchToLogin} className="btn-base btn-primary link-button">
                Log in here
              </button>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

export default Signup;
