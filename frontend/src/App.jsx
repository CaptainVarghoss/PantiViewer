import React, { useState, useCallback, useEffect } from 'react';
import { BrowserRouter as Router } from 'react-router-dom'; // Keep for potential future routing needs
import { useAuth } from './context/AuthContext';
import { SearchProvider } from './context/SearchContext';
import { FilterProvider } from './context/FilterContext';
import UnauthenticatedApp from './components/UnauthenticatedApp'; // Import the new component
import { ImageProvider } from './context/ImageContext';
import { AppContent } from './components/AppContent';

import './App.css';
import { HotkeyProvider } from './context/HotkeyContext';



function App() {
  const { isAuthenticated, loading, token } = useAuth();
  
  const [currentView, setCurrentView] = useState('grid');

  // Effect to fetch trash count

  if (loading) {
    return (
      <div className="loading-full-page">
        Loading application...
      </div>
    );
  }

  return (
    <HotkeyProvider>
      <SearchProvider>
        <FilterProvider>
          <div className="main-content">
            {isAuthenticated ? (
              <ImageProvider
                trash_only={currentView === 'trash'}
              >
                <AppContent
                  currentView={currentView}
                  setCurrentView={setCurrentView}
                />
              </ImageProvider>
            ) : (
              <main>
                <UnauthenticatedApp />
              </main>
            )}
          </div>
        </FilterProvider>
      </SearchProvider>
    </HotkeyProvider>
  );
}

export default App;