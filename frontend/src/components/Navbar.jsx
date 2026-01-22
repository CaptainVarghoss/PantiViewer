import {useState} from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext'; // Import useAuth
import NavbarButtons from './NavbarButtons';
import NavbarMenuButtons from './NavbarMenuButtons';
import NavSearchBar from './NavSearchBar';
import NavMenuBar from './NavMenu';
import SelectionToolbar from './SelectionToolbar';
import { useImageActions } from '../hooks/useImageActions';


/**
 * Navigation bar component for the application.
 * Displays navigation links, search bar, and authentication status.
 *
 * @param {object} props - Component props.
 */
function Navbar({
  isSelectMode,
  setIsSelectMode,
  isConnected,
  currentView,
  setCurrentView,
  selectedImages,
  setSelectedImages,
  openModal,
  images, // Pass the current images array for 'Select All'
}) {
  const { token, isAuthenticated, user, logout, isAdmin, settings } = useAuth();
  const [navOpen, setNavOpen] = useState(false);

  // Fetch trash count using useQuery for automatic caching and updates
  const { data: trashCount = 0 } = useQuery({
    // Adding `token` to the queryKey ensures the query re-runs when the token changes.
    queryKey: ['trashCount', token],
    queryFn: async ({ queryKey }) => {
      const [, _token] = queryKey; // Destructure to get the token from the queryKey
      const response = await fetch('/api/trash/info', {
        headers: { 'Authorization': `Bearer ${_token}` },
      });
      if (!response.ok) throw new Error('Failed to fetch trash count');

      try {
        const data = await response.json();
        // Ensure we return a number, even if data.trash_count is null or undefined.
        return data?.trash_count ?? 0;
      } catch (error) {
        // If response.json() fails (e.g., empty body), it's safe to assume the count is 0.
        return 0;
      }
    },
    enabled: !!token, // Only run the query if the user is authenticated
  });

  // Use the centralized image actions hook
  const imageActions = useImageActions({ selectedImages, setSelectedImages, setIsSelectMode, openModal });

  const onSettingsClick = () => {
    openModal('settings');
  };

  const toggleNavOpen = () => setNavOpen(!navOpen);

  // --- Selection Toolbar Handlers ---
  const handleSelectAll = () => {
    if (images) {
      setSelectedImages(new Set(images.map(img => img.id)));
    }
  };

  const handleClearSelection = () => setSelectedImages(new Set());

  return (
    <nav>
      <div className={`navbar-main ${isSelectMode ? 'select-mode' : ''}`}>
        {/* Left Navbar Buttons */}
        {settings.left_enabled && (
          <ul className="side-left">
            <NavbarButtons
              navOpen={navOpen}
              setNavOpen={setNavOpen}
              toggleNavOpen={toggleNavOpen}
            />
          </ul>
        )}

        {/* Search Bar (visible when authenticated) */}
        {isAuthenticated && (
          <NavSearchBar />
        )}

        {/* Right Navbar Buttons */}
        {settings.right_enabled && (
          <ul className="side-right">
            <NavbarButtons
              navOpen={navOpen}
              setNavOpen={setNavOpen}
              toggleNavOpen={toggleNavOpen}
            />
          </ul>
        )}
      </div>
      <div className={`navbar-menu ${navOpen ? 'open' : 'closed' } ${isSelectMode ? 'select-mode' : ''}`}>
        {/* Left Settings Button */}
        {settings.left_enabled && (
          <NavbarMenuButtons
            side="left"
            trashCount={trashCount}
            setCurrentView={setCurrentView}
            onSettingsClick={onSettingsClick}
            isSelectMode={isSelectMode}
            setIsSelectMode={setIsSelectMode}
          />
        )}
        {isAuthenticated && (
          <NavMenuBar 
            navOpen={navOpen}
            setNavOpen={setNavOpen}
            currentView={currentView}
            setCurrentView={setCurrentView}
            trashCount={trashCount}
          />
        )}
        {/* Right Settings Button */}
        {settings.right_enabled && (
          <NavbarMenuButtons
            side="right"
            trashCount={trashCount}
            setCurrentView={setCurrentView}
            isSelectMode={isSelectMode}
            setIsSelectMode={setIsSelectMode}
            onSettingsClick={onSettingsClick}
          />
        )}
      </div>
      {isSelectMode && (
        <SelectionToolbar
          selectedCount={selectedImages.size}
          onClearSelection={handleClearSelection}
          onSelectAll={handleSelectAll}
          onExit={() => setIsSelectMode(false)}
          // Conditionally render actions based on the current view
          customActions={
            currentView === 'trash'
              ? [
                  { label: 'Restore Selected', handler: imageActions.restoreSelectedImages, danger: false },
                  { label: 'Delete Selected Permanently', handler: imageActions.deleteSelectedPermanently, danger: true },
                ]
              : [
                  { label: 'Move', handler: () => openModal('moveFiles', { filesToMove: selectedImages }), danger: false },
                  { label: 'Delete', handler: imageActions.deleteSelectedImages, danger: true },
                ]
          }
        />
      )}
    </nav>
  );
}

export default Navbar;