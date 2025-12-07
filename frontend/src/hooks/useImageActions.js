import { useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  deleteImageApi,
  restoreImageApi,
  deleteImagePermanentlyApi,
  deleteImagesBulkApi,
  restoreImagesBulkApi,
  deleteImagesPermanentlyBulkApi,
} from '../api/imageService';

/**
 * Custom hook to manage image actions like deleting, restoring, etc.
 * It encapsulates the logic for single and bulk image operations.
 */
export const useImageActions = ({ setImages, selectedImages, setSelectedImages, setIsSelectMode, openModal }) => {
  const { token } = useAuth();

  const markImageAsDeleted = useCallback(async (imageId) => {
    try {
      await deleteImageApi(imageId, token);
      setImages(prevImages => prevImages.filter(img => img.id !== imageId));
    } catch (error) {
      console.error(`Error marking image ${imageId} as deleted:`, error);
      alert(`Error moving image to trash: ${error.message}`);
    }
  }, [token, setImages]);

  const restoreImage = useCallback(async (imageId) => {
    try {
      await restoreImageApi(imageId, token);
      setImages(prevImages => prevImages.filter(img => img.id !== imageId));
    } catch (error) {
      console.error(`Error restoring image ${imageId}:`, error);
      alert(`Error restoring image: ${error.message}`);
    }
  }, [token, setImages]);

  const deleteImagePermanently = useCallback(async (imageId) => {
    try {
      await deleteImagePermanentlyApi(imageId, token);
      setImages(prevImages => prevImages.filter(img => img.id !== imageId));
    } catch (error) {
      console.error(`Error permanently deleting image ${imageId}:`, error);
      alert(`Error permanently deleting image: ${error.message}`);
    }
  }, [token, setImages]);

  const deleteSelectedImages = useCallback(async () => {
    const imageIds = Array.from(selectedImages);
    if (imageIds.length === 0) return;

    try {
      await deleteImagesBulkApi(imageIds, token);
      // UI updates via websocket, just clear selection
      setSelectedImages(new Set());
      setIsSelectMode(false);
    } catch (error) {
      console.error("Error during bulk delete:", error);
      alert(`Error: ${error.message}`);
    }
  }, [selectedImages, token, setSelectedImages, setIsSelectMode]);

  const restoreSelectedImages = useCallback(async () => {
    const imageIds = Array.from(selectedImages);
    if (imageIds.length === 0) return;

    try {
      await restoreImagesBulkApi(imageIds, token);
      setImages(prev => prev.filter(img => !selectedImages.has(img.id)));
      setSelectedImages(new Set());
      setIsSelectMode(false);
    } catch (error) {
      alert(`Error: ${error.message}`);
    }
  }, [selectedImages, token, setImages, setSelectedImages, setIsSelectMode]);

  const deleteSelectedPermanently = useCallback(async () => {
    const imageIds = Array.from(selectedImages);
    if (imageIds.length === 0) return;

    try {
      const wasDeleted = await deleteImagesPermanentlyBulkApi(imageIds, token);
      if (wasDeleted) {
        setImages(prev => prev.filter(img => !selectedImages.has(img.id)));
        setSelectedImages(new Set());
        setIsSelectMode(false);
      }
    } catch (error) {
      alert(`Error: ${error.message}`);
    }
  }, [selectedImages, token, setImages, setSelectedImages, setIsSelectMode]);

  const moveSelectedImages = useCallback(() => {
    if (!openModal || selectedImages.size === 0) return;

    openModal('moveFiles', {
      filesToMove: Array.from(selectedImages),
      onMoveSuccess: () => {
        // After a successful move, remove the images from the current view
        setImages(prev => prev.filter(img => !selectedImages.has(img.id)));
        setSelectedImages(new Set());
        setIsSelectMode(false);
      },
    });

  }, [openModal, selectedImages, setImages, setSelectedImages, setIsSelectMode]);

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