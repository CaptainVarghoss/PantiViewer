import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import { useSearch } from './SearchContext';
import { useFilters } from './FilterContext';
import { fetchImagesApi } from '../api/imageService';

const ImageContext = createContext(null);

export const ImageProvider = ({ children }) => {
  const [images, setImages] = useState([]);
  const [imagesLoading, setImagesLoading] = useState(false);
  const [imagesError, setImagesError] = useState(null);
  // Use refs for cursors to prevent stale closures and dependency loops.
  const lastSortValueRef = useRef(null);
  const lastContentIdRef = useRef(null);
  const lastLocationIdRef = useRef(null);

  const [hasMore, setHasMore] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [trash_only, setTrashOnly] = useState(false);

  const { token, isAuthenticated, settings } = useAuth();
  const { sortBy, sortOrder, searchTerm } =  useSearch();
  const { filters } = useFilters();

  const imagesPerPage = parseInt(settings?.thumb_num) || 60;

  const fetchImages = useCallback(async (isInitialLoad = false) => {
    // The isFetchingMore check is now inside the non-initial load block
    if (!isAuthenticated || !filters || filters.length === 0) return;

    if (!isInitialLoad && isFetchingMore) return;

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
      if (!isInitialLoad && lastSortValueRef.current) queryString.append('last_sort_value', lastSortValueRef.current);
      if (!isInitialLoad && lastContentIdRef.current) queryString.append('last_content_id', lastContentIdRef.current);
      if (!isInitialLoad && lastLocationIdRef.current) queryString.append('last_location_id', lastLocationIdRef.current);
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
        setImages(prevImages => {
          const existingIds = new Set(prevImages.map(img => img.id));
          const uniqueNewImages = data.filter(img => !existingIds.has(img.id));
          return [...prevImages, ...uniqueNewImages];
        });
      }

      if (data.length > 0) {
        const newLastImage = data[data.length - 1];
        lastLocationIdRef.current = newLastImage.id;
        lastContentIdRef.current = newLastImage.content_id;
        let valForSort = newLastImage[sortBy];
        if (sortBy === 'date_created' && valForSort) {
          const date = new Date(valForSort.replace(' ', 'T'));
          if (!isNaN(date.getTime())) valForSort = date.toISOString();
        }
        lastSortValueRef.current = valForSort;
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
  }, [token, isAuthenticated, imagesPerPage, sortBy, sortOrder, searchTerm, filters, trash_only, isFetchingMore]);

  // This effect triggers a new search when primary search criteria change.
  useEffect(() => {
    if (isAuthenticated && imagesPerPage > 0) {
      // Reset cursors and trigger a new fetch.
      lastSortValueRef.current = null;
      lastContentIdRef.current = null;
      lastLocationIdRef.current = null;
      setHasMore(true);
      fetchImages(true);
    } else if (!isAuthenticated) {
      setImages([]);
      setImagesLoading(false);
      setIsFetchingMore(false);
      setHasMore(false);
      setImagesError(null);
      lastSortValueRef.current = null;
      lastContentIdRef.current = null;
      lastLocationIdRef.current = null;
    }
  }, [isAuthenticated, imagesPerPage, searchTerm, sortBy, sortOrder, filters, trash_only]);

  const contextValue = {
    images,
    setImages,
    imagesLoading,
    setImagesLoading,
    imagesError,
    setImagesError,
    hasMore,
    setHasMore,
    isFetchingMore,
    setIsFetchingMore,
    trash_only,
    setTrashOnly,
    fetchImages
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