/**
 * @module client/main
 * @description Browser entry point. It finds the HTML root element and renders React,
 * while Strict Mode helps React development identify side effects that should be cleaned up.
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
