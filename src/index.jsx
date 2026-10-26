import React from 'react';
import { createRoot } from 'react-dom/client';
import LandingPage from './pages/LandingPage.jsx';
import CabinetPage from './pages/CabinetPage.jsx';
import { PAGES } from './config/pages.js';
import './styles.css';

const path = window.location.pathname.replace(/\/+$/, '') || PAGES.HOME;
createRoot(document.getElementById('root')).render(path === PAGES.CABINET ? <CabinetPage /> : <LandingPage />);
