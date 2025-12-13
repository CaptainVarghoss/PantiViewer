import React, { useState, useCallback, useEffect } from 'react';
import { BrowserRouter as Router } from 'react-router-dom'; // Keep for potential future routing needs
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuth } from './context/AuthContext';
import { SearchProvider } from './context/SearchContext';
import { FilterProvider } from './context/FilterContext';
import UnauthenticatedApp from './components/UnauthenticatedApp'; // Import the new component
import { AppContent } from './components/AppContent';

import './App.css';
import { HotkeyProvider } from './context/HotkeyContext';

// Create a single instance of the QueryClient to be used throughout the app.
const queryClient = new QueryClient();

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
    <QueryClientProvider client={queryClient}>
      <HotkeyProvider>
        <SearchProvider>
          <FilterProvider>
            <div className="main-content">
              {isAuthenticated ? (
                <AppContent
                  currentView={currentView}
                  setCurrentView={setCurrentView}
                />
              ) : (
                <main>
                  <UnauthenticatedApp />
                </main>
              )}
            </div>
          </FilterProvider>
        </SearchProvider>
      </HotkeyProvider>
    </QueryClientProvider>
  );
}

export default App;