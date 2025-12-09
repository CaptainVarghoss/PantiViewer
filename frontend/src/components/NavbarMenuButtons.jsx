import React, {useState} from 'react';
import SettingsButton from './SettingsButton';
import NavMenuDropdown from './NavMenuDropdown';
import { useAuth } from '../context/AuthContext';
import FilterButtons from './FilterButtons';

function NavbarMenuButtons({
    side,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    isSelectMode,
    setIsSelectMode,
    onSettingsClick
}) {
    const { isAdmin } = useAuth();

    // --- Dropdown Logic ---

    // Unified handler to set BOTH sortBy and sortOrder
    const handleSelectCombinedSort = (key, order, setIsOpen) => {
        setSortBy(key);
        setSortOrder(order);
        setIsOpen(false);
    };

    // Combined Sort Options (used to render the single list)
    const combinedSortOptions = [
        { key: 'date_created', order: 'desc', label: 'Date: Newest to Oldest' },
        { key: 'date_created', order: 'asc', label: 'Date: Oldest to Newest' },
        { key: 'filename', order: 'asc', label: 'Filename: A to Z' },
        { key: 'filename', order: 'desc', label: 'Filename: Z to A' },
        { key: 'width', order: 'desc', label: 'Width: Largest to Smallest' },
        { key: 'width', order: 'asc', label: 'Width: Smallest to Largest' },
    ];

    return (
        <>
            <ul>
                <FilterButtons displayLocation={2} />
            </ul>
            <ul className={`navbar-menu-buttons side-${side}`}>
                <li>
                    <SettingsButton onClick={onSettingsClick} />
                </li>
                <li>
                    <NavMenuDropdown
                        buttonClassName="btn-base btn-primary"
                        buttonContent={
                            <>
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 -960 960 960"><path d="M400-240v-80h160v80zM240-440v-80h480v80zM120-640v-80h720v80z"/></svg>
                            </>
                        }
                    >
                        {({ setIsOpen }) => (
                            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                                {combinedSortOptions.map((option) => (
                                    <li
                                        key={`${option.key}-${option.order}`}
                                        className={`sort-option ${sortBy === option.key && sortOrder === option.order ? 'selected' : ''}`}
                                        onClick={() => handleSelectCombinedSort(option.key, option.order, setIsOpen)}
                                    >
                                        {option.label}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </NavMenuDropdown>
                </li>
                <li>
                    <button
                        className={`btn-base btn-primary ${isSelectMode ? 'active' : ''}`}
                        title="Select Multiple"
                        onClick={() => setIsSelectMode(!isSelectMode)}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 -960 960 960"><path d="M200-200v80q-33 0-56.5-23.5T120-200zm-80-80v-80h80v80zm0-160v-80h80v80zm0-160v-80h80v80zm80-160h-80q0-33 23.5-56.5T200-840zm80 640v-80h80v80zm0-640v-80h80v80zm160 640v-80h80v80zm0-640v-80h80v80zm160 640v-80h80v80zm0-640v-80h80v80zm160 560h80q0 33-23.5 56.5T760-120zm0-80v-80h80v80zm0-160v-80h80v80zm0-160v-80h80v80zm0-160v-80q33 0 56.5 23.5T840-760z"/></svg>
                    </button>
                </li>
            </ul>
        </>
    );
}

export default NavbarMenuButtons;