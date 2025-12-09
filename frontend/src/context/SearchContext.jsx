import React, { createContext, useContext, useState} from 'react';

const SearchContext = createContext(null);

export const SearchProvider = ({ children }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [sortBy, setSortBy] = useState('date_created');
    const [sortOrder, setSortOrder] = useState('desc');

    const contextValue = {
        searchTerm,
        setSearchTerm,
        sortBy,
        setSortBy,
        sortOrder,
        setSortOrder,
    };


    return (
        <SearchContext.Provider value={contextValue}>
        {children}
        </SearchContext.Provider>
    );
};

export const useSearch = () => {
    const context = useContext(SearchContext);
    if (context === null) {
      throw new Error('useSearch must be used within a SearchProvider');
    }
    return context;
};