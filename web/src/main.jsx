import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles/colors_and_type.css';
import './styles/global.css';

// No StrictMode: this app holds a single long-lived WebSocket; the dev-mode
// double-invoke would open/close a duplicate socket on every mount.
ReactDOM.createRoot(document.getElementById('root')).render(<App />);
