import React from 'react';
import { createRoot } from 'react-dom/client';
import './shared/styles/global.css';
import Pages from './pages/index.jsx';

createRoot(document.getElementById('root')).render(<Pages />);
