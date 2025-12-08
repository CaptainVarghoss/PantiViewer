import React, { useState, useCallback, useEffect } from 'react';
import { BrowserRouter as Router } from 'react-router-dom'; // Keep for potential future routing needs
import { useAuth } from './context/AuthContext';
import UnauthenticatedApp from './components/UnauthenticatedApp'; // Import the new component
import { ImageProvider } from './context/ImageContext';
import { AppContent } from './components/AppContent';

import './App.css';

function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

function App() {
  const { isAuthenticated, loading, token } = useAuth();
  // States for search and sort
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('date_created');
  const [sortOrder, setSortOrder] = useState('desc');
  const [currentView, setCurrentView] = useState('grid');
  const [folderViewSearchTerm, setFolderViewSearchTerm] = useState(null);
  const [selectedFolderPath, setSelectedFolderPath] = useState(null); // State for the selected folder path

  const refetchFilters = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
        const response = await fetch('/api/filters/', {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const fetchedFilters = await response.json();
        // If header_display > 0, the filter is enabled and should default to the main stage (index 0).
        // If header_display is 0, the filter is disabled (index -2).
        const initializedFilters = fetchedFilters.map(f => ({ ...f, activeStageIndex: f.header_display > 0 ? 0 : -2 }));

        // IMPORTANT: Prevent infinite loops by only setting state if the data has actually changed.
        // We do a deep-ish comparison by stringifying the relevant parts.
        setFilters(currentFilters => {
          if (JSON.stringify(currentFilters) !== JSON.stringify(initializedFilters)) {
            return initializedFilters;
          }
          return currentFilters;
        });
        return initializedFilters;
    } catch (error) {
        console.error(`Error refetching filters:`, error);
        return null; // Return null on error
    }
  }, [isAuthenticated, token]);

  // Pass the standard setFilters function for direct state updates (e.g., from Navbar)
  const handleSetFilters = (newFilters) => {
    setFilters(newFilters);
  };

  // Callback to update search and sort states from NavSearchBar
  const handleSearchAndSortChange = useCallback((newSearchTerm, newSortBy, newSortOrder) => {
      setSearchTerm(newSearchTerm);
      setSortBy(newSortBy);
      setSortOrder(newSortOrder);
  }, []);

  // Filter states
  const [filters, setFilters] = useState([]);

  const debouncedSearchTerm = useDebounce(searchTerm, 500); // Debounce search input by 500ms

  useEffect(() => {
    if (!isAuthenticated) { return }
    // Use the useCallback version of refetchFilters for the initial fetch.
    refetchFilters();
  }, [isAuthenticated, refetchFilters]);

  // Effect to fetch trash count

  if (loading) {
    return (
      <div className="loading-full-page">
        Loading application...
      </div>
    );
  }

  return (
    <Router>
      <div className="main-content">
        {isAuthenticated ? (
          <ImageProvider
            searchTerm={currentView === 'folders' ? folderViewSearchTerm : debouncedSearchTerm}
            sortBy={sortBy}
            sortOrder={sortOrder}
            filters={filters}
            trash_only={currentView === 'trash'}
          >
            <AppContent
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              sortBy={sortBy}
              setSortBy={setSortBy}
              sortOrder={sortOrder}
              setSortOrder={setSortOrder}
              filters={filters}
              setFilters={handleSetFilters}
              currentView={currentView}
              setCurrentView={setCurrentView}
              refetchFilters={refetchFilters}
            />
          </ImageProvider>
        ) : (
          <main>
            <UnauthenticatedApp />
          </main>
        )}
      </div>
    </Router>
  );
}

export default App;