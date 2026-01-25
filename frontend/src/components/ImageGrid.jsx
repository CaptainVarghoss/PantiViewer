import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ImageCard from '../components/ImageCard';
import { motion, AnimatePresence } from 'framer-motion';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import ContextMenu from './ContextMenu';
import { useGlobalHotkeys } from '../hooks/useGlobalHotkeys';
import { useImageActions } from '../hooks/useImageActions';
import { fetchImagesApi, fetchImageByIdApi } from '../api/imageService';
import { useAuth } from '../context/AuthContext';
import { useSearch } from '../context/SearchContext';
import { useFilters } from '../context/FilterContext';
import { FixedSizeGrid as Grid } from 'react-window';

/**
 * Cell component for react-window Grid.
 * Defined outside the main component to maintain a stable identity across renders.
 * This prevents the Grid from unmounting and remounting cells on every render,
 * which can cause performance issues and network request floods.
 */
const CellComponent = ({ columnIndex, rowIndex, style, data }) => {
  const { images, columnCount, selectedImages, focusedImageId, handleImageClick, handleContextMenu } = data;

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
          onContextMenu={handleContextMenu}
          refreshKey={image.refreshKey} />
      </div>
    </div>
  );
};

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
  onImagesLoaded,
  gridRef: externalGridRef,
  outerGridRef,
  thumbnailSize: initialThumbnailSize = 200
}) {
  const { token, settings } = useAuth();
  const { searchTerm } = useSearch();
  const { filters } = useFilters();
  const queryClient = useQueryClient();
  const containerRef = useRef(null);
  const internalGridRef = useRef(null);
  const gridRef = externalGridRef || internalGridRef;

  // Use the unified settings for thumbnail size, falling back to prop or default
  const thumbnailSize = parseInt(settings.thumb_size, 10) || initialThumbnailSize;

  const [gridSize, setGridSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const resizeObserver = new ResizeObserver(entries => {
      if (entries && entries.length > 0) {
        const { width, height } = entries[0].contentRect;
        setGridSize({ width, height });
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
  const activeStages = useMemo(() => {
    return filters.reduce((acc, filter) => {
      if (filter.activeStageIndex > 0) {
        acc[filter.id] = filter.activeStageIndex;
      }
      return acc;
    }, {});
  }, [filters]);

  const queryKey = useMemo(() => ['images', { trash_only, searchTerm, activeStages: JSON.stringify(activeStages) }], [trash_only, searchTerm, activeStages]);

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
      const params = { limit: settings.page_size };

      if (trash_only) {
        params.trash_only = true;
      }

      const queryString = new URLSearchParams(params);

      if (searchTerm) queryString.set('search_query', searchTerm);
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
        last_sort_value: lastImage.sort_value !== undefined ? lastImage.sort_value : lastImage.date_created,
        last_content_id: lastImage.content_id,
        last_location_id: lastImage.id,
      };
    },
  });

  const images = useMemo(() => data?.pages.flatMap(page => page) ?? [], [data]);

  useEffect(() => {
    if (onImagesLoaded) {
      onImagesLoaded(images);
    }
  }, [images, onImagesLoaded]);

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

  // Use a ref to hold props/state for callbacks to give them a stable identity
  const callbackStateRef = useRef();
  callbackStateRef.current = {
    isSelectMode,
    focusedImageId,
    images,
    setSelectedImages,
    openModal,
    token,
    queryClient,
    queryKey,
    hasMore,
    fetchMoreImages,
    setFocusedImageId,
    setContextMenu,
    selectedImages
  };

  const handleImageClick = useCallback(async (event, image) => {
    const { isSelectMode, focusedImageId, images, setSelectedImages, openModal, token, queryClient, queryKey, hasMore, fetchMoreImages, setFocusedImageId } = callbackStateRef.current;

    const imageCardElement = event.currentTarget.getBoundingClientRect();
    setFocusedImageId(image.id);

    if (isSelectMode) {
      if (event.shiftKey && focusedImageId) {
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
        setSelectedImages(prevSelected => {
          const newSelected = new Set(prevSelected);
          newSelected.has(image.id) ? newSelected.delete(image.id) : newSelected.add(image.id);
          return newSelected;
        });
      }
    } else {
      // Try to get the image data from the cache first.
      let imageData = queryClient.getQueryData(['image', image.id]);

      // If not in the cache, fetch it.
      if (!imageData) {
        imageData = await queryClient.fetchQuery({ queryKey: ['image', image.id], queryFn: () => fetchImageByIdApi(image.id, token) });
      }

      if (!imageData) {
        alert("Could not load image data. It may have been moved, deleted, or you may no longer have permission to view it.");
        queryClient.invalidateQueries({ queryKey: queryKey });
        return;
      }
      openModal('image', {
        originBounds: imageCardElement,
        currentImage: imageData,
        images: images,
        fetchMoreImages: hasMore ? fetchMoreImages : null,
        hasMore: hasMore,
        onNavigate: (id) => setFocusedImageId(id),
      });
    }
  }, []); // Now has a stable identity

  // Handle right-click event on a thumbnail
  const handleContextMenu = useCallback((event, thumbnail) => {
    event.preventDefault(); // Prevent default browser context menu
    const { setContextMenu, setFocusedImageId, isSelectMode, selectedImages, setSelectedImages } = callbackStateRef.current;

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
  }, []);

  // Close the context menu
  const handleCloseContextMenu = useCallback(() => {
    // Use the functional update form of setState to avoid dependency on contextMenu state
    // This gives the function a stable identity.
    setContextMenu(prev => ({ ...prev, isVisible: false }));
  }, [setContextMenu]);

  const imageActions = useImageActions({ selectedImages, setSelectedImages, setIsSelectMode, openModal });

  useEffect(() => {
    if (!isSelectMode) {
      setSelectedImages(new Set());
    }
  }, [isSelectMode]);

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

  // Calculate column-related grid dimensions. These only depend on width and settings.
  const { columnCount, columnWidth, rowHeight } = useMemo(() => {
    if (gridSize.width <= 0) {
      return { columnCount: 0, columnWidth: 0, rowHeight: 0 };
    }
    const availableWidth = gridSize.width;
    const calculatedColumnCount = Math.max(1, Math.round(availableWidth / thumbnailSize));
    const calculatedColumnWidth = availableWidth / calculatedColumnCount;
    const calculatedRowHeight = calculatedColumnWidth;

    return { columnCount: calculatedColumnCount, columnWidth: calculatedColumnWidth, rowHeight: calculatedRowHeight };
  }, [gridSize.width, thumbnailSize]);

  // Calculate rowCount separately, as it depends on the number of images.
  const rowCount = useMemo(() => {
    if (!columnCount || images.length === 0) return 0;
    const calculatedRowCount = Math.ceil(images.length / columnCount);
    return calculatedRowCount;
  }, [images.length, columnCount]);

  // Effect to scroll the focused image into view using react-window's API
  useEffect(() => {
    // Only scroll when focusedImageId changes and is not null.
    if (focusedImageId && gridRef.current && columnCount > 0) {
      const index = images.findIndex(img => img.id === focusedImageId);
      if (index !== -1) {
        const rowIndex = Math.floor(index / columnCount);
        // Use a timeout to ensure the grid has had a chance to render before we scroll.
        // This can help prevent race conditions where scrolling happens before the item is available.
        setTimeout(() => gridRef.current?.scrollToItem({ rowIndex, align: 'smart' }), 50);
      }
    }
  }, [focusedImageId]); // Only run when the focused image ID itself changes.

  // Effect for handling WebSocket messages
  useEffect(() => {
    if (!webSocketMessage || webSocketMessage.length === 0) {
      return;
    }
    
    const deletedImageIds = new Set(
      webSocketMessage.flatMap(msg => {
        if (msg.type === 'image_deleted') return [msg.image_id];
        if (msg.type === 'images_deleted') return msg.image_ids || [];
        return [];
      }).filter(Boolean)
    );
    
    // Handle deletions by directly updating the cache
    if (deletedImageIds.size > 0) {
      console.log("WebSocket: Removing deleted images from cache.", { deletedImageIds: Array.from(deletedImageIds) });
      queryClient.setQueryData(queryKey, (oldData) => {
        if (!oldData) return oldData;
        
        // Create a new data object with the deleted images filtered out from each page
        return {
          ...oldData,
          pages: oldData.pages.map(page => page.filter(image => !deletedImageIds.has(image.id))),
        };
      });
    }
    
    // Handle general refresh messages by invalidating the query
    const hasGeneralRefresh = webSocketMessage.some(msg => msg.type === 'refresh_images');
    if (hasGeneralRefresh) {
      console.log("WebSocket: General refresh detected, invalidating image query.");
      queryClient.invalidateQueries({ queryKey: queryKey });
    }

    const hasBulkTagUpdate = webSocketMessage.some(msg => msg.type === 'refresh_images' && msg.reason === 'tags_updated_bulk');
    if (hasBulkTagUpdate) {
      setIsSelectMode(false);
      setSelectedImages(new Set());
      setContextMenu(prev => ({ ...prev, isVisible: false }));
    }

    // Clear the message queue after processing.
    setWebSocketMessage([]);
  }, [webSocketMessage, setWebSocketMessage, queryClient, queryKey, setIsSelectMode, setSelectedImages]);

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
    columnCount: columnCount,
  });

  const handleItemsRendered = useCallback(({ 
      visibleRowStartIndex, 
      visibleRowStopIndex, 
      overscanRowStopIndex 
  }) => {
    // This callback now closes over the latest state values because of its dependency array.
    // This is the correct pattern to avoid race conditions with refs.
    if (!hasMore || isFetchingMore || rowCount === 0) {
      return;
    }

    // Fetch when the user is within 5 rows of the end of the list.
    if (overscanRowStopIndex >= rowCount - 5) {
      fetchMoreImages();
    }
    // By including rowCount, hasMore, and isFetchingMore, we ensure this function
    // always has the latest data and prevents the race condition.
  }, [fetchMoreImages, hasMore, isFetchingMore, rowCount]);

  // Memoize itemData to prevent unnecessary re-renders of the Grid.
  // This must be called unconditionally at the top level of the component.
  const itemData = useMemo(() => ({
    images,
    columnCount,
    selectedImages,
    focusedImageId,
    handleImageClick,
    handleContextMenu
  }), [images, columnCount, selectedImages, focusedImageId, handleImageClick, handleContextMenu]);

  return (
    <>
      <div ref={containerRef} className={`image-grid-container ${isSelectMode ? 'select-mode' : ''}`}>
        {gridSize.width > 0 && gridSize.height > 0 && columnCount > 0 ? (
          <Grid
            ref={gridRef}
            outerRef={outerGridRef}
            className="image-grid hide-scrollbar"
            columnCount={columnCount}
            columnWidth={columnWidth}
            rowCount={rowCount} // rowCount can be 0, react-window handles this
            rowHeight={rowHeight}
            overscanColumnCount={3}
            overscanRowCount={3}
            height={gridSize.height}
            width={gridSize.width}
            itemData={itemData}
            children={CellComponent}
            onItemsRendered={handleItemsRendered}
          />
        ) : (
          // Display initializing message if grid is not ready, but not if it's just loading initial images.
          !imagesLoading && <p className="grid-status-message">Initializing grid...</p>
        )}
        {imagesError && <p className="grid-status-message error-message">{imagesError.message}</p>}
        {imagesLoading && images.length === 0 && !imagesError && <p className="grid-status-message loading-message">Loading images...</p>}
        {isFetchingMore && <p className="grid-status-message loading-more-message">Loading more images...</p>}
        {!imagesLoading && !isFetchingMore && images.length === 0 && !imagesError && (
          <p className="grid-status-message no-images-message">No images found. Add some to your configured paths and run the scanner!</p>
        )}
      </div>

      <ContextMenu
        isOpen={contextMenu.isVisible}
        x={contextMenu.x}
        y={contextMenu.y}
        onClose={handleCloseContextMenu}
        thumbnailData={contextMenu.thumbnailData}
        customItems={contextMenuItems}
        images={images}
        selectedImageIds={selectedImages}
        isSelectMode={isSelectMode}
        trash_only={trash_only}
        actions={{ imageActions, setIsSelectMode, setSelectedImages, openModal }}
      />

    </>
  );
}

export default ImageGrid; // Export as ImageGrid
