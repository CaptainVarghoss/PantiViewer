import React, { useState, useEffect, useRef, useCallback } from 'react';
import ImageCard from '../components/ImageCard';
import { motion, AnimatePresence } from 'framer-motion';
import ContextMenu from './ContextMenu';
import { useGlobalHotkeys } from '../hooks/useGlobalHotkeys';
import { useImageFeed, useImageActions } from '../hooks/useImageActions';
import { useImages } from '../context/ImageContext';

/**
 * Component to display the image gallery with infinite scrolling using cursor-based pagination.
 * Fetches image data from the backend in pages and appends them.
 */
function ImageGrid({
  webSocketMessage,
  setWebSocketMessage,
  isSelectMode,
  setIsSelectMode,
  selectedImages,
  setSelectedImages,
  trash_only = false,
  contextMenuItems,
  openModal,
}) {
  const {
    images,
    imagesLoading,
    imagesError,
    isFetchingMore,
    hasMore,
    fetchMoreImages,
    fetchImageById,
  } = useImageFeed();
  const { setImages, fetchImages } = useImages();

  const [focusedImageId, setFocusedImageId] = useState(null);

  const [contextMenu, setContextMenu] = useState({
      isVisible: false,
      x: 0,
      y: 0,
      thumbnailData: null, // Data of the thumbnail that was right-clicked
    });
  const gridRef = useRef(null); // Ref for the grid container

  // Variants for the container
  const gridContainerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05, // Stagger the animation of children
      },
    },
  };

  // Variants for each image card
  const imageCardVariants = {
    hidden: { opacity: 0, scale: 0 },
    visible: { opacity: 1, scale: 1, transition: { duration: 0.3 } },
  };

  const getFocusedImage = useCallback(() => {
    return images.find(img => img.id === focusedImageId);
  }, [images, focusedImageId]);

  const handleImageClick = useCallback(async (event, image) => {
    const imageCardElement = event.currentTarget.getBoundingClientRect();
    setFocusedImageId(image.id); // Set focus on click
    if (isSelectMode) {
      // In select mode, handle selection logic
      if (event.shiftKey && focusedImageId) {
        // Shift-click for range selection
        const lastFocusedIndex = images.findIndex(img => img.id === focusedImageId);
        const clickedIndex = images.findIndex(img => img.id === image.id);
  
        if (lastFocusedIndex !== -1 && clickedIndex !== -1) {
          const start = Math.min(lastFocusedIndex, clickedIndex);
          const end = Math.max(lastFocusedIndex, clickedIndex);
          const rangeToSelect = images.slice(start, end + 1).map(img => img.id);
  
          setSelectedImages(prevSelected => {
            const newSelected = new Set(prevSelected);
            rangeToSelect.forEach(id => newSelected.add(id));
            return newSelected;
          });
        }
      } else {
        // Normal click in select mode: toggle selection
        setSelectedImages(prevSelected => {
          const newSelected = new Set(prevSelected);
          if (newSelected.has(image.id)) {
            newSelected.delete(image.id);
          } else {
            newSelected.add(image.id);
          }
          return newSelected;
        });
      }
    } else {
      // Normal mode: fetch fresh data for the image before opening the modal
      const freshImageData = await fetchImageById(image.id);
      if (!freshImageData) {
        alert("Could not load image data. It may have been moved, deleted, or you may no longer have permission to view it.");
        setImages(prevImages => prevImages.filter(img => img.id !== image.id));
        return;
      }

      openModal('image', {
        originBounds: imageCardElement,
        currentImage: freshImageData,
        images: images,
        fetchMoreImages: hasMore ? fetchMoreImages : null,
        hasMore: hasMore,
        setImages: setImages,
        onNavigate: setFocusedImageId,
      });
    }
  }, [isSelectMode, openModal, images, setSelectedImages, focusedImageId, fetchImageById, setImages, setFocusedImageId, hasMore, fetchMoreImages]);

  // Handle right-click event on a thumbnail
  const handleContextMenu = (event, thumbnail) => {
    event.preventDefault(); // Prevent default browser context menu
    setContextMenu({
        isVisible: true,
        x: event.clientX,
        y: event.clientY,
        thumbnailData: thumbnail,
    });

    // Also set focus on right-click
    setFocusedImageId(thumbnail.id);

    // If the right-clicked image is not already in the selection,
    // add it to the selection. This makes the context menu feel more intuitive.
    if (isSelectMode && !selectedImages.has(thumbnail.id)) {
      setSelectedImages(prevSelected => {
        const newSelected = new Set(prevSelected);
        newSelected.add(thumbnail.id);
        return newSelected;
      });
    }
  };

  // Close the context menu
  const handleCloseContextMenu = () => {
      setContextMenu({ ...contextMenu, isVisible: false });
  };

  const imageActions = useImageActions({ setImages, selectedImages, setSelectedImages, setIsSelectMode, openModal });

  // Handle click on a context menu item
  const handleMenuItemClick = (action, data) => {
      console.log(`Action: ${action} on Thumbnail ID: ${data.id}`);

      // Implement specific logic based on the action
      switch (action) {
        case 'select':
            setIsSelectMode(true);
            setSelectedImages(new Set([data.id]));
            break;
        case 'delete':
            imageActions.markImageAsDeleted(data.id);
            break;
        case 'restore':
            imageActions.restoreImage(data.id);
            break;
        case 'delete_permanent':
            imageActions.deleteImagePermanently(data.id);
            break;
        case 'delete_selected':
            imageActions.deleteSelectedImages();
            break;
        case 'move':
            imageActions.moveSelectedImages(new Set([data.id]));
            break;
        case 'move_selected':
            imageActions.moveSelectedImages();
            break;
        case 'restore_selected':
            imageActions.restoreSelectedImages();
            break;
        case 'delete_permanent_selected':
            imageActions.deleteSelectedPermanently();
            break;
        case 'edit_tags_selected':
            openModal('editTags', {
                imageIds: Array.from(selectedImages),
                // When the modal closes, clear the selection and exit select mode.
                // This is crucial for when tags are changed and images disappear from the current view.
                onClose: () => {
                    setSelectedImages(new Set());
                    setIsSelectMode(false);
                }
            });
            break;
        default:
            break;
      }
  };

  // Determine which menu items to show based on the current mode
  let activeContextMenuItems;
  if (isSelectMode) {
    if (trash_only) {
        activeContextMenuItems = [
            { label: `Restore ${selectedImages.size} Selected`, action: "restore_selected" },
            { label: `Edit Tags for ${selectedImages.size} Selected`, action: "edit_tags_selected" },
            { label: `Delete ${selectedImages.size} Permanently`, action: "delete_permanent_selected" },
        ];
    } else {
        activeContextMenuItems = [
            { label: `Delete ${selectedImages.size} Selected`, action: "delete_selected" },
            { label: `Move ${selectedImages.size} Selected`, action: "move_selected" },
        ];
        if (selectedImages.size > 0) activeContextMenuItems.unshift({ label: `Edit Tags for ${selectedImages.size} Selected`, action: "edit_tags_selected" });
    }
  } else {
    // Not in select mode, use single-item actions
    if (contextMenuItems) { // If custom items are passed (like in TrashView)
        activeContextMenuItems = [{ label: "Select", action: "select" }, ...contextMenuItems];
    } else { // Default for main grid
        activeContextMenuItems = [
            { label: "Select", action: "select" },
            { label: "Edit Tags", action: "add_tag" },
            { label: "Move", action: "move" },
            { label: "Delete", action: "delete" }
        ];
    }
  }

  // Clear selection when exiting select mode
  useEffect(() => {
    if (!isSelectMode) {
      setSelectedImages(new Set());
    }
  }, [isSelectMode]);

  // Effect to synchronize selectedImages with the images currently in view.
  // This is crucial for when images are removed from the grid (e.g., due to filtering after a tag edit)
  // to ensure the selection count is accurate and doesn't include hidden images.
  useEffect(() => {
    if (selectedImages.size > 0) {
      const visibleImageIds = new Set(images.map(img => img.id));
      const newSelectedImages = new Set();
      for (const id of selectedImages) {
        if (visibleImageIds.has(id)) {
          newSelectedImages.add(id);
        }
      }
      setSelectedImages(newSelectedImages);
    }
  }, [images]); // Reruns whenever the list of images changes.

  // Effect to handle cleanup after bulk tag editing causes images to be filtered out.
  // If select mode is on, but the selection becomes empty, it's likely due to a bulk action
  // filtering the items out of view. In this case, we should exit select mode.
  useEffect(() => {
    // Only run this logic if select mode is currently active.
    if (isSelectMode) {
      // If there are no more selected images, exit select mode.
      if (selectedImages.size === 0) {
        setIsSelectMode(false);
      }
    }
  }, [selectedImages, isSelectMode, setIsSelectMode]);

  // Effect to scroll the focused image into view, especially for modal navigation
  useEffect(() => {
    // This logic is primarily for when the modal is open and navigating.
    // The modal being open is an implicit condition, as `focusedImageId` is updated by the modal's onNavigate.
    if (focusedImageId) {
      const cardElement = document.querySelector(`[data-image-id="${focusedImageId}"]`);
      if (cardElement) {
        // Use 'nearest' to avoid unnecessary scrolling if the item is already visible.
        // This is key for triggering the IntersectionObserver when the item is off-screen.
        cardElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [focusedImageId]);

  // Effect for handling WebSocket messages
  useEffect(() => {
    if (!webSocketMessage || webSocketMessage.length === 0) {
      return;
    }
    
    // Since the backend now debounces, we can process messages directly.
    // We only need to look for the last relevant message in the batch.
    const hasGeneralRefresh = webSocketMessage.some(msg => msg.type === 'refresh_images');
    const deletedImageIds = new Set(
      webSocketMessage.flatMap(msg => {
        if (msg.type === 'image_deleted') return [msg.image_id];
        if (msg.type === 'images_deleted') return msg.image_ids || [];
        return [];
      }).filter(Boolean)
    );

    if (hasGeneralRefresh) {
      console.log("WebSocket: Received general refresh message. Fetching latest image data.");
      // isInitialLoad=true tells the hook to fetch from page 1 and merge.
      // isWsRefresh=true can be used by the hook to avoid showing a loading spinner.
      fetchImages(true, true);
    } else if (deletedImageIds.size > 0) {
      console.log("WebSocket: Removing deleted images from grid:", Array.from(deletedImageIds));
      setImages(prevImages => prevImages.filter(img => !deletedImageIds.has(img.id)));
    }
    
    // Clear the message queue after processing.
    setWebSocketMessage([]);
  }, [webSocketMessage, setWebSocketMessage, setImages, fetchImages]);

  // Wrapper for handleImageClick to be used by useGlobalHotkeys
  const handleImageOpen = useCallback((_event, imageToOpen) => {
    const imageCardElement = document.querySelector(`[data-image-id="${imageToOpen.id}"]`);
    if (imageCardElement) {
      // Create a synthetic event with `currentTarget` for `handleImageClick`
      const fakeEvent = { currentTarget: imageCardElement };
      handleImageClick(fakeEvent, imageToOpen);
    }
  }, [handleImageClick]);

  // Use the global hotkeys hook
  useGlobalHotkeys({
    isGridActive: true,
    focusedImage: getFocusedImage(),
    handleImageOpen: handleImageOpen,
    isContextMenuOpen: contextMenu.isVisible,
    closeContextMenu: handleCloseContextMenu,
    // Pass state for navigation logic now inside the hook
    images: images,
    gridRef: gridRef,
    setFocusedImageId: setFocusedImageId,
  });

  // Ref for the element to observe for infinite scrolling
  const observer = useRef();
  const lastImageElementRef = useCallback(node => {
    // If we are currently loading, or there are no more images, do nothing.
    if (imagesLoading || isFetchingMore) return;

    // Disconnect any existing observer before creating a new one.
    if (observer.current) observer.current.disconnect();

    // If there are no more images to load, we don't need an observer.
    if (!hasMore) {
      return;
    }

    // Create a new IntersectionObserver instance
    observer.current = new IntersectionObserver(entries => {
      // If the observed element is intersecting, trigger the next fetch.
      // The guards inside the callback prevent re-fetching.
      if (entries[0].isIntersecting) {
        fetchMoreImages();
      }
    }, {
      root: null, // Use the viewport as the root element
      rootMargin: '100px', // When the target element is 100px from the bottom of the viewport, trigger the callback
      threshold: 0.1 // Trigger when 10% of the target element is visible
    }); 

    // Start observing the provided DOM node if it exists
    if (node) {
      observer.current.observe(node);
    }
  }, [imagesLoading, isFetchingMore, hasMore, fetchMoreImages]); // The dependency array is now minimal and correct.

  return (
    <>
      <motion.div
        layout
        ref={gridRef}
        className={`image-grid ${isSelectMode ? 'select-mode' : ''}`}
        variants={gridContainerVariants}
        initial="hidden"
        animate="visible"
      >
        <AnimatePresence>
          {images.map((image, index) => (
            <motion.div
              layout
              key={image.id}
              data-image-id={image.id}
              variants={imageCardVariants}
              initial="hidden"
              animate="visible"
              exit="hidden"              
              className={`btn-base btn-primary image-card ${selectedImages.has(image.id) ? 'selected' : ''} ${focusedImageId === image.id ? 'focused' : ''}`}
              onClick={(e) => handleImageClick(e, image)}
              style={{ transition: 'transform 0.3s ease-in-out, opacity 0.3s ease-in-out' }}
            >
              <ImageCard
                ref={images.length === index + 1 && hasMore ? lastImageElementRef : null}
                image={image}
                onContextMenu={(e) => handleContextMenu(e, image)}
                refreshKey={image.refreshKey} />
            </motion.div>
          ))}
        </AnimatePresence>

        {imagesError && <p>{imagesError}</p>}

        {imagesLoading && images.length === 0 && !imagesError && <p>Loading images...</p>}

        {isFetchingMore && <p>Loading more images...</p>}

        {!imagesLoading && !isFetchingMore && images.length === 0 && !imagesError && (
          <p>No images found. Add some to your configured paths and run the scanner!</p>
        )}
      </motion.div>

      <ContextMenu
        isOpen={contextMenu.isVisible}
        x={contextMenu.x}
        y={contextMenu.y}
        onClose={handleCloseContextMenu}
        thumbnailData={contextMenu.thumbnailData}
        onMenuItemClick={handleMenuItemClick}
        setContextMenu={setContextMenu}
        menuItems={activeContextMenuItems}
        images={images}
        selectedImageIds={selectedImages}
      />

    </>
  );
}

export default ImageGrid; // Export as ImageGrid
