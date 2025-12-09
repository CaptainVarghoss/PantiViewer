import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { useSearch } from './SearchContext';
import { useFilters } from './FilterContext';
import { fetchImagesApi } from '../api/imageService';

const ImageContext = createContext(null);

export const ImageProvider = ({ children }) => {
  const [images, setImages] = useState([]);
  const [imagesLoading, setImagesLoading] = useState(false);
  const [imagesError, setImagesError] = useState(null);
  const [lastId, setLastId] = useState(null);
  const [lastSortValue, setLastSortValue] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [trash_only, setTrashOnly] = useState(false);

  const { token, isAuthenticated, settings } = useAuth();
  const { sortBy, sortOrder, searchTerm } =  useSearch();
  const { filters } = useFilters();

  const imagesPerPage = parseInt(settings?.thumb_num) || 60;

  const fetchImages = useCallback(async (isInitialLoad = false) => {
    // Don't fetch if not authenticated or if a fetch is already in progress for "load more"
    if (!isAuthenticated || (!isInitialLoad && isFetchingMore)) return;

    if (isInitialLoad) {
      setImagesLoading(true);
    } else {
      setIsFetchingMore(true);
    }
    setImagesError(null);

    try {
      // For an initial load, fetch enough to fill the screen, potentially more than one page.
      // For subsequent loads ("load more"), fetch one page.
      const limit = isInitialLoad ? Math.max(images.length, imagesPerPage * 2) : imagesPerPage;

      const queryString = new URLSearchParams();
      queryString.append('limit', limit);
      queryString.append('sort_by', sortBy);
      queryString.append('sort_order', sortOrder);

      if (searchTerm) queryString.append('search_query', searchTerm);
      // For "load more", include pagination cursors.
      if (!isInitialLoad && lastId) queryString.append('last_id', lastId);
      if (!isInitialLoad && lastSortValue) queryString.append('last_sort_value', lastSortValue);
      if (trash_only) queryString.append('trash_only', 'true');

      if (filters) {
        const activeStages = {};
        filters.forEach(filter => {
          if (filter.activeStageIndex >= 0) activeStages[filter.id] = filter.activeStageIndex;
        });
        if (Object.keys(activeStages).length > 0) queryString.append('active_stages_json', JSON.stringify(activeStages));
      }

      const data = await fetchImagesApi(token, queryString.toString());

      if (isInitialLoad) {
        setImages(data);
      } else {
        // Append new images, ensuring no duplicates are added
        setImages(prevImages => {
          const existingIds = new Set(prevImages.map(img => img.id));
          const uniqueNewImages = data.filter(img => !existingIds.has(img.id));
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
    } catch (error) {
      console.error('Error fetching images:', error);
      setImagesError('Failed to load images.');
      setHasMore(false);
    } finally {
      setImagesLoading(false);
      setIsFetchingMore(false);
    }
  }, [token, isAuthenticated, imagesPerPage, sortBy, sortOrder, searchTerm, filters, trash_only, lastId, lastSortValue, isFetchingMore, images.length]);

  // This effect triggers a new search when primary search criteria change.
  useEffect(() => {
    if (isAuthenticated && imagesPerPage > 0) {
      // Reset pagination and trigger a new fetch
      setLastId(null);
      setLastSortValue(null);
      setHasMore(true);
      fetchImages(true); // `true` signifies a new search
    } else if (!isAuthenticated) {
      // Clear all data on logout
      setImages([]);
      setImagesLoading(false);
      setIsFetchingMore(false);
      setHasMore(false);
      setLastId(null);
      setLastSortValue(null);
      setImagesError(null);
    }
  }, [isAuthenticated, imagesPerPage, searchTerm, sortBy, sortOrder, filters, trash_only]); // `fetchImages` is not a dependency here to prevent loops

  const contextValue = {
    images,
    setImages,
    imagesLoading,
    setImagesLoading,
    imagesError,
    setImagesError,
    lastId,
    setLastId,
    lastSortValue,
    setLastSortValue,
    hasMore,
    setHasMore,
    isFetchingMore,
    setIsFetchingMore,
    trash_only,
    setTrashOnly,
    fetchImages // Expose fetchImages for "load more"
  };

  return (
    <ImageContext.Provider value={contextValue}>
      {children}
    </ImageContext.Provider>
  );
};

export const useImages = () => {
  const context = useContext(ImageContext);
  if (context === null) {
    throw new Error('useImages must be used within an ImageProvider');
  }
  return context;
};