import { useState, useCallback, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSearch } from '../context/SearchContext';
import { useFilters } from '../context/FilterContext';
import { useImages } from '../context/ImageContext';
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
 * Hook to access the image feed data and actions like fetching more images.
 */
export const useImageFeed = () => {
  const {
    images,
    imagesLoading,
    imagesError,
    hasMore,
    isFetchingMore,
    fetchImages,
  } = useImages();
  const { token } = useAuth();

  // Action for infinite scrolling
  const fetchMoreImages = useCallback(() => {
    if (hasMore && !isFetchingMore) {
      fetchImages(false); // `false` indicates we are appending, not doing a new search
    }
  }, [hasMore, isFetchingMore, fetchImages]);

  const fetchImageById = useCallback((imageId) => fetchImageByIdApi(imageId, token), [token]);

  return { images, imagesLoading, imagesError, isFetchingMore, hasMore, fetchMoreImages, fetchImageById };
};

/**
 * Hook to manage actions performed on one or more images (delete, restore, etc.).
 */
export const useImageActions = ({ selectedImages, setSelectedImages, setIsSelectMode, openModal }) => {
  const { token } = useAuth();
  const { setImages } = useImages();
 
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

  return {
    markImageAsDeleted,
    restoreImage,
    deleteImagePermanently,
    deleteSelectedImages,
    restoreSelectedImages,
    deleteSelectedPermanently,
    moveSelectedImages,
  };
};