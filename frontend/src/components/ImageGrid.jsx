import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ImageCard from '../components/ImageCard';
import { motion, AnimatePresence } from 'framer-motion';
import { Grid } from "react-window";
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import ContextMenu from './ContextMenu';
import { useGlobalHotkeys } from '../hooks/useGlobalHotkeys';
import { useImageActions } from '../hooks/useImageActions';
import { fetchImagesApi, fetchImageByIdApi } from '../api/imageService';
import { useAuth } from '../context/AuthContext';
import { useSearch } from '../context/SearchContext';
import { useFilters } from '../context/FilterContext';

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
  onImagesChange, // New prop to report images back to parent
}) {
  const { token, settings } = useAuth();
  const { searchQuery } = useSearch();
  const { filters } = useFilters();
  const queryClient = useQueryClient();
  const containerRef = useRef(null);
  const gridRef = useRef(null); // Ref for the grid container

  const [gridSize, setGridSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const resizeObserver = new ResizeObserver(entries => {
      if (entries && entries.length > 0) {
        const { width, height } = entries[0].contentRect;
        setGridSize({ width, height });
        console.log(width, height)
      }
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      if (containerRef.current) resizeObserver.unobserve(containerRef.current);
    };
  }, []);

  // Compute activeStages from the filters context.
  // Only include filters that are in a non-default state (index > 0).
  const activeStages = filters.reduce((acc, filter) => {
    if (filter.activeStageIndex > 0) {
      acc[filter.id] = filter.activeStageIndex;
    }
    return acc;
  }, {});

  const queryKey = ['images', { trash_only, searchQuery, activeStages: JSON.stringify(activeStages) }];

  const {
    data,
    error: imagesError,
    fetchNextPage: fetchMoreImages,
    hasNextPage: hasMore,
    isLoading: imagesLoading,
    isFetchingNextPage: isFetchingMore,
    refetch,
  } = useInfiniteQuery({
    queryKey: queryKey,
    queryFn: async ({ pageParam }) => {
      const params = { limit: 250 };

      if (trash_only) {
        params.trash_only = true;
      }

      const queryString = new URLSearchParams(params);

      if (searchQuery) queryString.set('search_query', searchQuery);
      // Only send the filter parameter if there are active non-default filters.
      if (Object.keys(activeStages).length > 0) {
        queryString.set('active_stages_json', JSON.stringify(activeStages));
      }
      if (pageParam) {
        queryString.set('last_sort_value', pageParam.last_sort_value);
        queryString.set('last_content_id', pageParam.last_content_id);
        queryString.set('last_location_id', pageParam.last_location_id);
      }
      return fetchImagesApi(token, queryString);
    },
    getNextPageParam: (lastPage) => {
      if (!lastPage || lastPage.length === 0) return undefined;
      const lastImage = lastPage[lastPage.length - 1];
      return {
        last_sort_value: lastImage.date_created,
        last_content_id: lastImage.content_id,
        last_location_id: lastImage.id,
      };
    },
  });

  const images = useMemo(() => data?.pages.flatMap(page => page) ?? [], [data]);

  // Effect to report the current set of images back to the parent component.
  // We stringify `images` in the dependency array to prevent re-renders
  // if the array reference changes but its content does not.
  useEffect(() => {
    onImagesChange?.(images);
  }, [JSON.stringify(images), onImagesChange]);

  const [focusedImageId, setFocusedImageId] = useState(null);

  const [contextMenu, setContextMenu] = useState({
      isVisible: false,
      x: 0,
      y: 0,
      thumbnailData: null, // Data of the thumbnail that was right-clicked
    });

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
      const freshImageData = await queryClient.fetchQuery({ queryKey: ['image', image.id], queryFn: () => fetchImageByIdApi(image.id, token) });
      if (!freshImageData) {
        alert("Could not load image data. It may have been moved, deleted, or you may no longer have permission to view it.");
        queryClient.invalidateQueries({ queryKey: queryKey });
        return;
      }

      openModal('image', {
        originBounds: imageCardElement,
        currentImage: freshImageData,
        images: images,
        fetchMoreImages: hasMore ? fetchMoreImages : null,
        hasMore: hasMore,
        onNavigate: setFocusedImageId,
      });
    }
  }, [isSelectMode, openModal, images, setSelectedImages, focusedImageId, token, queryClient, queryKey, hasMore, fetchMoreImages, setFocusedImageId]);

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
  const handleCloseContextMenu = useCallback(() => {
    // Use the functional update form of setState to avoid dependency on contextMenu state
    // This gives the function a stable identity.
    setContextMenu(prev => ({ ...prev, isVisible: false }));
  }, [setContextMenu]);

  const imageActions = useImageActions({ selectedImages, setSelectedImages, setIsSelectMode, openModal });

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

  useEffect(() => {
    if (!isSelectMode) {
      setSelectedImages(new Set());
    }
  }, [isSelectMode]);

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
  }, [images]);

  const initialMount = useRef(true);
  useEffect(() => {
    if (initialMount.current) {
      initialMount.current = false;
      return;
    }

    // Only run this logic if select mode is currently active.
    if (isSelectMode && selectedImages.size === 0) {
      setIsSelectMode(false);
    }
  }, [selectedImages]); // Only depends on selectedImages

  // Effect to scroll the focused image into view, especially for modal navigation
  useEffect(() => {
    if (focusedImageId) {
      const cardElement = document.querySelector(`[data-image-id="${focusedImageId}"]`);
      if (cardElement) {
        cardElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [focusedImageId]);

  // Effect for handling WebSocket messages
  useEffect(() => {
    if (!webSocketMessage || webSocketMessage.length === 0) {
      return;
    }
    
    const hasGeneralRefresh = webSocketMessage.some(msg => msg.type === 'refresh_images');
    const deletedImageIds = new Set(
      webSocketMessage.flatMap(msg => {
        if (msg.type === 'image_deleted') return [msg.image_id];
        if (msg.type === 'images_deleted') return msg.image_ids || [];
        return [];
      }).filter(Boolean)
    );

    if (hasGeneralRefresh || deletedImageIds.size > 0) {
      console.log("WebSocket: Change detected, invalidating image query.", { hasGeneralRefresh, deletedImageIds: Array.from(deletedImageIds) });
      queryClient.invalidateQueries({ queryKey: queryKey });
    }
    
    // Clear the message queue after processing.
    setWebSocketMessage([]);
  }, [webSocketMessage, setWebSocketMessage, queryClient, queryKey]);

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
  
  const handleScroll = useCallback(({ scrollOffset }) => {
    // scrollOffset is the current scrollTop
    const innerHeight = gridRef.current?.props.height || 0;
    const scrollHeight = gridRef.current?._outerRef.scrollHeight || 0;
    // Trigger fetchMoreImages when user is near the bottom
    if (scrollHeight - scrollOffset - innerHeight < 1000 && hasMore && !isFetchingMore) {
      fetchMoreImages();
    }
  }, [hasMore, isFetchingMore, fetchMoreImages, gridRef]);

  // Cell component for react-window Grid
  const CellComponent = ({ columnIndex, rowIndex, style, images, columnCount }) => {
    const index = rowIndex * columnCount + columnIndex;
    if (index >= images.length) {
      return null; // Render nothing if the cell is outside the range of items
    }
    const image = images[index];

    return (
      <div className="image-card-outer" style={style}>
        <div
          key={image.id}
          data-image-id={image.id}
          className={`btn-base btn-primary image-card ${selectedImages.has(image.id) ? 'selected' : ''} ${focusedImageId === image.id ? 'focused' : ''}`}
          onClick={(e) => handleImageClick(e, image)}
        >
          <ImageCard
            image={image}
            onContextMenu={(e) => handleContextMenu(e, image)}
            refreshKey={image.refreshKey} />
        </div>
      </div>
    );
  };

  return (
    <>
      <div ref={containerRef} className={`image-grid-container ${isSelectMode ? 'select-mode' : ''}`}>
        {gridSize.width > 0 && gridSize.height > 0 && images.length > 0 && (() => {
          // Convert gap from rem to pixels once. Assuming 1rem = 16px as a base.
          const gap = 0.5 * parseFloat(getComputedStyle(document.documentElement).fontSize);
          const baseThumbSize = settings.thumb_size / 2;

          // Calculate how many columns can fit
          const columnCount = Math.max(1, Math.floor((gridSize.width + gap) / (baseThumbSize + gap)));

          // Calculate the actual width of each column to fill the container perfectly
          const columnWidth = (gridSize.width - (columnCount - 1) * gap) / columnCount;
          const rowHeight = columnWidth; // Keep thumbnails square

          const rowCount = Math.ceil(images.length / columnCount);

          return (
            <Grid
              cellComponent={CellComponent}
              cellProps={{images, columnCount}}
              ref={gridRef}
              className="image-grid"
              columnCount={columnCount}
              columnWidth={columnWidth}
              rowCount={rowCount}
              rowHeight={rowHeight}
              overscanCount="3"
              onScroll={handleScroll}
            ></Grid>
          );
        })()}

        {imagesError && <p>{imagesError}</p>}

        {imagesLoading && images.length === 0 && !imagesError && <p>Loading images...</p>}

        {isFetchingMore && <p>Loading more images...</p>}

        {!imagesLoading && !isFetchingMore && images.length === 0 && !imagesError && (
          <p>No images found. Add some to your configured paths and run the scanner!</p>
        )}
      </div>

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
