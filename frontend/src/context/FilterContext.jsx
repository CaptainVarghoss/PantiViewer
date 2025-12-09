import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';

const FilterContext = createContext(null);

export const FilterProvider = ({ children }) => {
  const [filters, setFilters] = useState([]);
  const { token, isAuthenticated } = useAuth();

  const fetchFilters = useCallback(async () => {
    if (!isAuthenticated) {
      setFilters([]); // Clear filters on logout
      return;
    }
    try {
      console.log('Fetching filters from context...');
      const response = await fetch('/api/filters/', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const fetchedFilters = await response.json();
      const initializedFilters = fetchedFilters.map(f => ({ ...f, activeStageIndex: f.header_display > 0 ? 0 : -2 }));
      setFilters(initializedFilters);
    } catch (error) {
      console.error(`Error fetching filters:`, error);
    }
  }, [isAuthenticated, token]);

  useEffect(() => {
    fetchFilters();
    // This effect runs when authentication status changes, ensuring data is fetched on login
    // and cleared on logout (as handled inside fetchFilters).
  }, [fetchFilters]);

  // The context value now includes the raw filters and the setter.
  // The fetch function is also provided in case a manual refetch is needed.
  const contextValue = {
    filters,
    setFilters,
  };

  return (
    <FilterContext.Provider value={contextValue}>
      {children}
    </FilterContext.Provider>
  );
};

export const useFilters = () => {
  const context = useContext(FilterContext);
  if (context === null) {
    throw new Error('useFilters must be used within a FilterProvider');
  }
  return context;
};