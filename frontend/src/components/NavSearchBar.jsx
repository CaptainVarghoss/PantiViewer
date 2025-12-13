import React, { useState, useEffect, useRef, useCallback} from 'react';
import { IoMdCloseCircle } from "react-icons/io";
import { useQueryClient } from '@tanstack/react-query';
import TagCluster from './TagCluster';
import { useAuth } from '../context/AuthContext';
import { useSearch } from '../context/SearchContext';
import ContextMenu from './ContextMenu';
import { useFilters } from '../context/FilterContext';


/**
 * A search bar component for the navigation bar.
 * It provides a responsive input field and debounces the search term changes
 * before notifying the parent component.
 *
 * @param {object} props - Component props.
 * @param {string} props.searchTerm - The current search term from the parent component.
 * @param {function} props.setSearchTerm - Callback to update the search term in the parent.
 * @param {string} props.sortOrder - The current sort order ('ASC' or 'DESC').
 * @param {function} props.setSortOrder - Callback to update the sort order in the parent.
 */
function NavSearchBar() {
    const { token } = useAuth();
    const queryClient = useQueryClient();
    const { searchTerm, setSearchTerm } = useSearch();
    const { filters } = useFilters();
    const [inputValue, setInputValue] = useState(searchTerm || '');
    const debounceDelay = 300; // delay in ms

    const [suggestions, setSuggestions] = useState([]);
    const [activeSuggestionType, setActiveSuggestionType] = useState(null);
    const searchWrapperRef = useRef(null);
    const [contextMenu, setContextMenu] = useState({
        isVisible: false,
        x: 0,
        y: 0,
        items: [],
    });

    const resetSuggestions = useCallback(() => {
        setSuggestions([]);
        setActiveSuggestionType(null);
    }, []);

    // Effect to handle clicks outside the search bar to close suggestions
    useEffect(() => {
        function handleClickOutside(event) {
            if (searchWrapperRef.current && !searchWrapperRef.current.contains(event.target)) {
                setContextMenu(prev => ({ ...prev, isVisible: false }));
                resetSuggestions();
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [resetSuggestions]);
    

    // Debounce the update to the parent component's state
    useEffect(() => {
        const handler = setTimeout(() => {
            if (inputValue !== searchTerm) {
                setSearchTerm(inputValue);
            }
        }, debounceDelay);

        // Cleanup function to cancel the timeout if the value changes again
        return () => {
            clearTimeout(handler);
        };
    }, [inputValue, searchTerm, setSearchTerm, debounceDelay]);

    // Sync local state if the parent's searchTerm changes from outside
    useEffect(() => {
        setInputValue(searchTerm || '');
    }, [searchTerm]); 

    // Effect for autocomplete suggestions
    useEffect(() => {
        const handleAutocomplete = async () => {
            const lastPart = (inputValue || '').substring(inputValue.lastIndexOf(' ') + 1);
            const lowerLastPart = lastPart.toLowerCase();

            if (lowerLastPart === 'tag:') {
                setActiveSuggestionType('TAG');
                setSuggestions([]);
            } else if (lowerLastPart === 'folder:') {
                const searchInput = searchWrapperRef.current.querySelector('input');
                const rect = searchInput.getBoundingClientRect();
                setActiveSuggestionType('FOLDER');
                queryClient.fetchQuery({
                    queryKey: ['folders'],
                    queryFn: async () => {
                        const response = await fetch('/api/folders/', {
                        headers: { 'Authorization': `Bearer ${token}` }
                        });
                        if (!response.ok) throw new Error('Failed to fetch folders');
                        return response.json();
                    }
                }).then(data => {
                        const menuItems = data.folders.map(f => ({
                            label: f.short_name || f.path,
                            action: 'select_folder',
                            value: f.path
                        }));
                        setContextMenu({ isVisible: true, x: rect.left, y: rect.bottom, items: menuItems });
                        setSuggestions([]);
                }).catch(error => {
                    console.error("Failed to fetch folders for autocomplete", error);
                });
            } else {
                resetSuggestions();
            }
        };

        handleAutocomplete();
    }, [inputValue, token, resetSuggestions, queryClient]);
    
    const handleFolderSelect = (folderPath) => {
        const baseInput = inputValue.substring(0, inputValue.lastIndexOf(' ') + 1);
        // Quote the suggestion if it contains spaces
        const suggestionValue = folderPath.includes(' ') ? `"${folderPath}"` : folderPath;
        setInputValue(`${baseInput}FOLDER:${suggestionValue} `);
        setContextMenu(prev => ({ ...prev, isVisible: false }));
        searchWrapperRef.current.querySelector('input').focus();
        resetSuggestions();
    };

    const handleTagSelect = (tag) => {
        const baseInput = inputValue.substring(0, inputValue.lastIndexOf(' '));
        const tagValue = tag.name.includes(' ') ? `"${tag.name}"` : tag.name;
        
        // Replace 'tag:' with the selected tag
        const newInputValue = inputValue.replace(/tag:$/i, `TAG:${tagValue} `);

        setInputValue(newInputValue);
        resetSuggestions();
    };

    const handleClear = () => {
        setInputValue('');
        if (searchTerm !== '') {
            setSearchTerm('');
        }
    };

    return (
        <div className="navbar-search-wrapper" ref={searchWrapperRef} style={{ position: 'relative' }}>
            <input
                type="search"
                name="search"
                placeholder="Search images..."
                className="form-input-base"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                autoComplete="off"
            />

            {activeSuggestionType === 'TAG' && (
                <div className="autocomplete-popup">
                    <TagCluster.Popup type="image_tags" itemId={null} onClose={resetSuggestions} onTagSelect={handleTagSelect} />
                </div>
            )}

            {contextMenu.isVisible && activeSuggestionType === 'FOLDER' && (
                <ContextMenu
                    isOpen={contextMenu.isVisible}
                    x={contextMenu.x}
                    y={contextMenu.y}
                    onClose={() => setContextMenu(prev => ({ ...prev, isVisible: false }))}
                    onMenuItemClick={(action, data) => handleFolderSelect(data.value)}
                    menuItems={contextMenu.items}
                />
            )}
        </div>
    );
}

export default NavSearchBar;