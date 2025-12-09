import { useState, useCallback, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSearch } from '../context/SearchContext';

export const useSearchActions = () => {
    const { token } = useAuth();
    const { searchTerm, setSearchTerm, sortBy, setSortBy, sortOrder, setSortOrder } = useSearch();

    const debouncedSearchTerm = useDebounce(searchTerm, 500); // Debounce search input by 500ms
    // Callback to update search and sort states from NavSearchBar
    const handleSearchAndSortChange = useCallback((newSearchTerm, newSortBy, newSortOrder) => {
        setSearchTerm(newSearchTerm);
        setSortBy(newSortBy);
        setSortOrder(newSortOrder);
    }, []);

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

    return {
        searchTerm,
        debouncedSearchTerm,
        sortBy,
        sortOrder,
        handleSearchAndSortChange,
    }
}