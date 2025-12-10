import { useEffect, useCallback, useContext } from 'react';
import { useHotkeyContext } from '../context/HotkeyContext';

/**
 * A custom hook to manage all global keyboard shortcuts in one place.
 * It takes the current application state and relevant action dispatchers
 * to decide which shortcuts are active.
 *
 * @param {object} params - The state and handlers needed for the shortcuts.
 */
export const useGlobalHotkeys = ({
  // Modal states and handlers
  isModalOpen,
  modalType,
  closeModal,
  canGoPrev,
  canGoNext,
  handlePrev,
  handleNext,
  toggleFullScreen,

  // Image Grid states and handlers
  isGridActive,
  focusedImage,
  handleImageOpen,
  images, // for grid navigation
  gridRef, // for calculating columns
  setFocusedImageId, // to update focus


  // Dialog states and handlers
  isConfirmDialogOpen,
  closeConfirmDialog,

  // Context Menu states and handlers
  isContextMenuOpen,
  closeContextMenu,
}) => {
  const { activeContext } = useHotkeyContext();

  const handleGridNavigation = useCallback((key) => {
    if (!isGridActive || !images || images.length === 0) return;

    const gridEl = gridRef.current;
    if (!gridEl) return;

    const gridStyle = window.getComputedStyle(gridEl);
    const gridTemplateColumns = gridStyle.getPropertyValue('grid-template-columns');
    const columns = gridTemplateColumns.split(' ').length;

    const focusedImageId = focusedImage ? focusedImage.id : null;
    let currentIndex = -1;
    if (focusedImageId !== null) {
      currentIndex = images.findIndex(img => img.id === focusedImageId);
    } else {
      setFocusedImageId(images[0].id);
      return;
    }

    if (currentIndex === -1) return;

    let nextIndex = currentIndex;
    switch (key) {
      case 'ArrowLeft': nextIndex = Math.max(0, currentIndex - 1); break;
      case 'ArrowRight': nextIndex = Math.min(images.length - 1, currentIndex + 1); break;
      case 'ArrowUp': nextIndex = Math.max(0, currentIndex - columns); break;
      case 'ArrowDown': nextIndex = Math.min(images.length - 1, currentIndex + columns); break;
      default: break;
    }

    if (nextIndex !== currentIndex) {
      const nextImage = images[nextIndex];
      if (nextImage) {
        setFocusedImageId(nextImage.id);
      }
    }
  }, [isGridActive, images, focusedImage, setFocusedImageId, gridRef]);

  const handleKeyDown = useCallback((event) => {
    // Do not interfere with text input fields.
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
      return;
    }

    // The most specific/top-level components get priority.

    // 1. Confirmation Dialog
    if (activeContext === 'dialog' && isConfirmDialogOpen) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeConfirmDialog();
      }
      return;
    }

    // 2. Context Menu
    if (activeContext === 'contextMenu' && isContextMenuOpen) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeContextMenu();
      }
      return;
    }

    // 3. Main Modal
    if (activeContext === 'modal' && isModalOpen) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeModal();
        return;
      } else if (modalType === 'image') {
        if (event.key === 'ArrowRight' && canGoNext) handleNext();
        else if (event.key === 'ArrowLeft' && canGoPrev) handlePrev();
        else if (event.key === 'f') toggleFullScreen();
        else if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault();
          closeModal?.();
        }
      }
      return;
    }

    // 4. Image Grid Navigation (only if no modal is open)
    if (activeContext === 'grid' && isGridActive) {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
        event.preventDefault();
        handleGridNavigation(event.key);
      } else if ((event.key === ' ' || event.key === 'Enter') && focusedImage) {
        event.preventDefault();
        handleImageOpen(event, focusedImage);
      } else if (event.key === 'f') {
        toggleFullScreen?.();
      }
    }

  }, [
    isModalOpen, modalType, closeModal, canGoPrev, canGoNext, handlePrev, handleNext, toggleFullScreen,
    isGridActive, focusedImage, handleImageOpen,
    handleGridNavigation, // Now defined inside the hook
    isConfirmDialogOpen, closeConfirmDialog, isContextMenuOpen, closeContextMenu,
    activeContext // Add activeContext to dependency array
  ]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);
};