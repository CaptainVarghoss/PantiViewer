import { useState, useCallback, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  fetchImagesApi,
  fetchImageByIdApi,
  deleteImageApi,
  restoreImageApi,
  deleteImagePermanentlyApi,
  deleteImagesBulkApi,
  restoreImagesBulkApi,
  deleteImagesPermanentlyBulkApi,
} from '../api/imageService';

/**
 * Hook to manage fetching images, including pagination, filtering, and loading states.
 */
export const useImageFetching = ({ searchTerm, sortBy, sortOrder, filters, trash_only = false }) => {
  const { token, isAuthenticated, settings } = useAuth();
  const [images, setImages] = useState([]);
  const [imagesLoading, setImagesLoading] = useState(true);
  const [imagesError, setImagesError] = useState(null);
  const [lastId, setLastId] = useState(null);
  const [lastSortValue, setLastSortValue] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);

  const lastIdRef = useRef(lastId);
  const lastSortValueRef = useRef(lastSortValue);
  useEffect(() => {
    lastIdRef.current = lastId;
    lastSortValueRef.current = lastSortValue;
  }, [lastId, lastSortValue]);

  const imagesPerPage = parseInt(settings.thumb_num) || 60;

  const fetchImages = useCallback(async (isInitialLoad, isWsRefresh = false) => {
    if (isInitialLoad && !isWsRefresh) {
      setImagesLoading(true);
    } else if (!isInitialLoad) {
      setIsFetchingMore(true);
    }
    setImagesError(null);

    try {
      const limit = isInitialLoad ? Math.max(images.length, imagesPerPage * 2) : imagesPerPage;

      const queryString = new URLSearchParams();
      queryString.append('limit', limit);
      queryString.append('sort_by', sortBy);
      queryString.append('sort_order', sortOrder);

      if (searchTerm) queryString.append('search_query', searchTerm);
      if (!isInitialLoad && lastIdRef.current) queryString.append('last_id', lastIdRef.current);
      if (!isInitialLoad && lastSortValueRef.current) queryString.append('last_sort_value', lastSortValueRef.current);
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
        if (isWsRefresh) {
            const newImageIds = new Set(data.map(img => img.id));
            const combined = [...data, ...images];
            const uniqueImages = Array.from(new Map(combined.map(item => [item.id, item])).values());
            setImages(uniqueImages.filter(img => newImageIds.has(img.id)));
        } else {
            setImages(data);
        }
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
      return data;
    } catch (error) {
      console.error('Error fetching images:', error);
      setImagesError('Failed to load images.');
      setHasMore(false);
    } finally {
      setImagesLoading(false);
      setIsFetchingMore(false);
    }
  }, [token, imagesPerPage, sortBy, sortOrder, searchTerm, filters, trash_only]);

  const fetchImageById = useCallback((imageId) => fetchImageByIdApi(imageId, token), [token]);

  useEffect(() => {
    if (searchTerm === null) {
      setImages([]);
      setImagesLoading(false);
      return;
    }
    if ((!filters || filters.length === 0) && !trash_only) {
      setImagesLoading(false);
      setImages([]);
      return;
    }

    if (isAuthenticated && imagesPerPage > 0) {
      setLastId(null);
      setLastSortValue(null);
      setHasMore(true);
      fetchImages(true);
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

  return { images, setImages, imagesLoading, imagesError, isFetchingMore, hasMore, fetchImages, fetchImageById };
};

/**
 * Hook to manage actions performed on one or more images (delete, restore, etc.).
 */
export const useImageActions = ({ setImages, selectedImages, setSelectedImages, setIsSelectMode, openModal }) => {
  const { token } = useAuth();
 
  // A more robust handler that can deal with API calls that might not return a value on success (e.g., return undefined)
  const handleApiAction = async (apiCall, idsToRemove) => {
    try {
      await apiCall();
      // If the apiCall succeeds (doesn't throw), we proceed to update the UI.
      const ids = new Set(Array.isArray(idsToRemove) ? idsToRemove : [idsToRemove]);
      setImages(prev => prev.filter(img => !ids.has(img.id)));
      setSelectedImages(prev => new Set([...prev].filter(id => !ids.has(id))));
    } catch (error) {
      console.error("An error occurred during the image action:", error);
      // Optionally, show an error to the user
      alert(`Action failed: ${error.message}`);
    }
  };
 
  const markImageAsDeleted = async (imageId) => {
    await handleApiAction(() => deleteImageApi(imageId, token), imageId);
  };
  const restoreImage = async (imageId) => {
    await handleApiAction(() => restoreImageApi(imageId, token), imageId);
  };
  const deleteImagePermanently = async (imageId) => {
    // The confirmation is inside the API call, so we just call it.
    await handleApiAction(() => deleteImagePermanentlyApi(imageId, token), imageId);
  };
 
  const deleteSelectedImages = async () => {
    const ids = Array.from(selectedImages);
    await handleApiAction(() => deleteImagesBulkApi(ids, token), ids);
  };
 
  const restoreSelectedImages = async () => {
    const ids = Array.from(selectedImages);
    await handleApiAction(() => restoreImagesBulkApi(ids, token), ids);
  };
 
  const deleteSelectedPermanently = async () => {
    const ids = Array.from(selectedImages);
    // The confirmation is inside the API call. It returns true if the user confirms and the call succeeds.
    const success = await deleteImagesPermanentlyBulkApi(ids, token);
    if (success) { // Only update UI if the action was confirmed and executed
      const idsToRemove = new Set(ids);
      setImages(prev => prev.filter(img => !idsToRemove.has(img.id)));
      setSelectedImages(new Set());
    }
  };

  const moveSelectedImages = (imageIds = selectedImages) => {
    openModal('moveImages', { imageIds: Array.from(imageIds), onClose: () => setIsSelectMode(false) });
  };

  return { markImageAsDeleted, restoreImage, deleteImagePermanently, deleteSelectedImages, restoreSelectedImages, deleteSelectedPermanently, moveSelectedImages };
};