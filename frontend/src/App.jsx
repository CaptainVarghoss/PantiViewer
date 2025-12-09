import React, { useState, useCallback, useEffect } from 'react';
import { BrowserRouter as Router } from 'react-router-dom'; // Keep for potential future routing needs
import { useAuth } from './context/AuthContext';
import { SearchProvider } from './context/SearchContext';
import { FilterProvider } from './context/FilterContext';
import UnauthenticatedApp from './components/UnauthenticatedApp'; // Import the new component
import { ImageProvider } from './context/ImageContext';
import { AppContent } from './components/AppContent';

import './App.css';



function App() {
  const { isAuthenticated, loading, token } = useAuth();
  
  const [currentView, setCurrentView] = useState('grid');
  const [folderViewSearchTerm, setFolderViewSearchTerm] = useState(null);
  const [selectedFolderPath, setSelectedFolderPath] = useState(null); // State for the selected folder path

  // Effect to fetch trash count

  if (loading) {
    return (
      <div className="loading-full-page">
        Loading application...
      </div>
    );
  }

  return (
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
  );
}

export default App;