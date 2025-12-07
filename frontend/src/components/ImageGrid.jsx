import React, { useState, useEffect, useRef, useCallback } from 'react';
import ImageCard from '../components/ImageCard';
import { motion, AnimatePresence } from 'framer-motion';
import ContextMenu from './ContextMenu';
import { useAuth } from '../context/AuthContext'; // To get token and settings for authenticated calls
import { fetchImagesApi, fetchImageByIdApi } from '../api/imageService';
import { useImageActions } from '../hooks/useImageActions';

/**
 * Component to display the image gallery with infinite scrolling using cursor-based pagination.
 * Fetches image data from the backend in pages and appends them.
 */
function ImageGrid({
  images,
  setImages,
  searchTerm,
  setSearchTerm,
  sortBy,
  sortOrder,
  filters,
  webSocketMessage,
  setWebSocketMessage,
  isSelectMode,
  setIsSelectMode,
  selectedImages,
  setSelectedImages,
  trash_only = false,
  contextMenuItems,
  openModal,
  focusedImageId,
  setFocusedImageId,
}) {
  const { token, isAuthenticated, settings } = useAuth();
  const [imagesLoading, setImagesLoading] = useState(true); // For initial load state
  const [imagesError, setImagesError] = useState(null);
  const [lastId, setLastId] = useState(null); // Cursor for pagination: ID of the last image fetched
  const [lastSortValue, setLastSortValue] = useState(null);
  const [hasMore, setHasMore] = useState(true); // True if there are more images to load
  const [isFetchingMore, setIsFetchingMore] = useState(false); // Tracks if a fetch for more images is in progress
  const [contextMenu, setContextMenu] = useState({
      isVisible: false,
      x: 0,
      y: 0,
      thumbnailData: null, // Data of the thumbnail that was right-clicked
    });

  const lastIdRef = useRef(lastId);
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


  const lastSortValueRef = useRef(lastSortValue);
  useEffect(() => {
    lastIdRef.current = lastId;
    lastSortValueRef.current = lastSortValue;
  }, [lastId, lastSortValue]);

  // Get imagesPerPage from settings, default to 60 if not available or invalid
  const imagesPerPage = parseInt(settings.thumb_num) || 60;

  const getFocusedImage = useCallback(() => {
    return images.find(img => img.id === focusedImageId);
  }, [images, focusedImageId]);

  // Fetch images function, now accepting an optional cursor (last_id)
  const fetchImages = useCallback(async (isInitialLoad) => {
    // The guard against re-fetching is now handled by the callers.
    // This function is now only responsible for the API call itself.

    if (isInitialLoad) {
      setImagesLoading(true);
    } else {
      setIsFetchingMore(true);
    }
    setImagesError(null);

    try {
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      const limit = isInitialLoad ? imagesPerPage * 2 : imagesPerPage;

      const queryString = new URLSearchParams();
      queryString.append('limit', limit);
      queryString.append('sort_by', sortBy);
      queryString.append('sort_order', sortOrder);

      if (searchTerm) {
        queryString.append('search_query', searchTerm);
      }

      // Use refs for cursors in subsequent loads
      if (!isInitialLoad && lastIdRef.current) {
        queryString.append('last_id', lastIdRef.current);
      }
      if (!isInitialLoad && lastSortValueRef.current) {
        queryString.append('last_sort_value', lastSortValueRef.current);
      }

      if (trash_only) {
        queryString.append('trash_only', 'true');
      }

      if (filters) {
        const activeStages = {};
        filters.forEach(filter => {
          // Only include filters that have an active stage selected (index 0, 1, or 2).
          // This correctly excludes disabled filters (index -2).
          if (filter.activeStageIndex >= 0) activeStages[filter.id] = filter.activeStageIndex;
        });
        if (Object.keys(activeStages).length > 0) queryString.append('active_stages_json', JSON.stringify(activeStages));
      }

      // Pass the fully constructed query string to the API service
      const data = await fetchImagesApi(token, queryString.toString());

       if (isInitialLoad) {
        setImages(data);
      } else {
        setImages(prevImages => {
          const uniqueNewImages = data.filter(img => !prevImages.find(p => p.id === img.id));
          return [...prevImages, ...uniqueNewImages];
        });
      }

      if (data.length > 0) {
        const newLastImage = data[data.length - 1];
        setLastId(newLastImage.id);
        let valForSort = newLastImage[sortBy];
        if (sortBy === 'date_created') valForSort = new Date(valForSort).toISOString();
        setLastSortValue(valForSort);
      }

      setHasMore(data.length === limit);
      // Return the fetched data so the caller can use it
      return data;
    } catch (error) {
      console.error('Error fetching images:', error);
      setImagesError('Failed to load images. Ensure backend scanner has run and images exist, and you are logged in if required.');
      setHasMore(false);
    } finally {
      setImagesLoading(false);
      setIsFetchingMore(false);
    }
  }, [token, imagesPerPage, sortBy, sortOrder, searchTerm, filters, trash_only, setImages]); // `images` dependency removed to prevent loop

  const fetchImageById = useCallback(
    (imageId) => fetchImageByIdApi(imageId, token),
    [token]);

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
        fetchMoreImages: hasMore ? () => fetchImages(false) : null,
        hasMore: hasMore,
        setImages: setImages, // Pass setImages to the modal
        setSearchTerm: setSearchTerm
      });
    }
  }, [isSelectMode, openModal, images, setSearchTerm, setSelectedImages, focusedImageId, fetchImageById, setImages, setFocusedImageId, hasMore, fetchImages]);

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

  // Effect for initial page load and when search/sort parameters change
  useEffect(() => {
    if (searchTerm === null) {
      setImages([]);
      setImagesLoading(false);
      return;
    }

    // Add a guard to prevent fetching if filters are not yet loaded on initial mount.
    // This is crucial on a fresh page load where filters might be fetched asynchronously.
    // We check for `filters` being null/undefined OR an empty array, but allow it for trash view.
    if ((!filters || filters.length === 0) && !trash_only) {
      setImagesLoading(false);
      setImages([]); // Also clear images if we are not fetching
      return;
    }

    if (isAuthenticated && imagesPerPage > 0) {
      // Reset cursors and trigger a new initial load
      setLastId(null);
      setLastSortValue(null);
      setHasMore(true);
      fetchImages(true); // `true` indicates it's an initial load
    } else if (!isAuthenticated) {
      setImages([]);
      setImagesLoading(false);
      setIsFetchingMore(false);
      setHasMore(false);
      setLastId(null);
      setLastSortValue(null);
      setImagesError("Please log in to view images.");
    }
  }, [isAuthenticated, imagesPerPage, searchTerm, sortBy, sortOrder, filters, trash_only, fetchImages]);

  // Effect for handling WebSocket messages
  useEffect(() => {
    if (!webSocketMessage) return;

    const { type, reason, image_id, image_ids } = webSocketMessage;

    if (type === 'refresh_images') {
      if (reason === 'thumbnail_generated' && image_id) {
        // This is a targeted update for a specific thumbnail.
       console.log(`WebSocket: Received thumbnail generated notification for image ${image_id}. Refreshing card.`);
        setImages(prevImages => 
          prevImages.map(img => 
            img.id === image_id 
              ? { ...img, refreshKey: new Date().getTime() } // Update refreshKey to trigger re-render in ImageCard
              : img
          )
        );
      } else { // Handle general refresh (image_added, images_moved, etc.)
        console.log("WebSocket: Received general refresh_images message. Merging new images into grid.");

        // Fetch the first page of images in the background without clearing the current view
        const fetchUpdatedImageList = async () => {
          const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
          const queryString = new URLSearchParams();
          // Fetch a list of the same size as the currently loaded images to accurately determine removals.
          // Ensure we fetch at least one page's worth of images.
          queryString.append('limit', Math.max(images.length, imagesPerPage));
          queryString.append('sort_by', sortBy);
          queryString.append('sort_order', sortOrder);
          if (searchTerm) queryString.append('search_query', searchTerm);
          if (trash_only) queryString.append('trash_only', 'true');
          if (filters) {
            const activeStages = {};
            filters.forEach(filter => {
              if (filter.activeStageIndex !== -1) activeStages[filter.id] = filter.activeStageIndex;
            });
            if (Object.keys(activeStages).length > 0) queryString.append('active_stages_json', JSON.stringify(activeStages));
          }

          try {
            const response = await fetch(`/api/images/?${queryString.toString()}`, { headers });
            if (!response.ok) throw new Error('Failed to fetch updated images');
            const newImages = await response.json();

            setImages(prevImages => {
              const newImageIds = new Set(newImages.map(img => img.id));

              // Combine new images with previous images to get a complete list.
              // Place new images first to ensure they appear at the top if the sort order dictates.
              const combined = [...newImages, ...prevImages];

              // Use a Map to ensure uniqueness, preserving the order from the combined array.
              // The first occurrence of an image (from `newImages`) will be kept.
              const uniqueImages = Array.from(new Map(combined.map(item => [item.id, item])).values());

              // Filter this unique list to only include images that are present in the latest fetch.
              // This correctly removes images that have been filtered out, while preserving the order of the rest.
              return uniqueImages.filter(img => newImageIds.has(img.id));
            });
          } catch (error) {
            console.error("Error fetching images for WebSocket merge:", error);
          }
        };

        fetchUpdatedImageList();
            }

    } else if (type === 'image_deleted') {
      if (!image_id) {
        console.error("WebSocket message of type 'image_deleted' did not contain an 'image_id'.");
        return;
      }
      console.log("Removing image from grid from WebSocket:", image_id);
      setImages(prevImages => prevImages.filter(img => img.id !== image_id));
    } else if (type === 'images_deleted') {
      if (!image_ids || !Array.isArray(image_ids)) {
        console.error("WebSocket message of type 'images_deleted' did not contain an 'image_ids' array.");
        return;
      }
      console.log("Removing multiple images from grid via WebSocket:", image_ids);
      const idsToRemove = new Set(image_ids);
      setImages(prevImages => prevImages.filter(img => !idsToRemove.has(img.id)));
    }

    // Clear the message after processing to prevent re-triggering
    setWebSocketMessage(null);
  }, [webSocketMessage, searchTerm, sortBy, sortOrder, fetchImages]);

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
        fetchImages(false); // `false` indicates it's a subsequent load
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
  }, [imagesLoading, isFetchingMore, hasMore, fetchImages]); // The dependency array is now minimal and correct.

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
              variants={imageCardVariants}
              initial="hidden"
              animate="visible"
              exit="hidden"
            >
              <ImageCard
                ref={images.length === index + 1 && hasMore ? lastImageElementRef : null}
                image={image}
                onClick={(e, img) => handleImageClick(e, img)}
                isSelected={selectedImages.has(image.id)}
                onContextMenu={(e) => handleContextMenu(e, image)}
                isFocused={focusedImageId === image.id}
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
