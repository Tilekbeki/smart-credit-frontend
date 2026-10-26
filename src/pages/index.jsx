import React from 'react';
import LandingPage from './LandingPage/index.jsx';
import CabinetPage from './CabinetPage/index.jsx';
import { PAGES } from '../shared/config/pages.js';

export default function Pages() {
  const path = window.location.pathname.replace(/\/+$/, '') || PAGES.HOME;
  return path === PAGES.CABINET ? <CabinetPage /> : <LandingPage />;
}
