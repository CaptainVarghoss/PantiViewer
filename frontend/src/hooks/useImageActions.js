import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import {
  deleteImageApi, // For single deletion
  restoreImageApi, // For single restore
  deleteImagePermanentlyApi, // For single permanent delete
  deleteImagesBulkApi, // For bulk deletion
  restoreImagesBulkApi, // For bulk restore
  deleteImagesPermanentlyBulkApi, // For bulk permanent delete
} from '../api/imageService';

/**
 * Hook to manage actions performed on one or more images (delete, restore, etc.).
 */
export const useImageActions = ({ selectedImages, setSelectedImages, setIsSelectMode, openModal }) => {
  const { token } = useAuth();
  const queryClient = useQueryClient();

  // A generic onSuccess handler to invalidate queries and reset selection state
  const onActionSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['images'] }); // Invalidate all image queries (grid and trash)
    queryClient.invalidateQueries({ queryKey: ['trashCount'] }); // Invalidate trash count for the navbar
    setSelectedImages(new Set());
    setIsSelectMode(false);
  };

  // A generic onError handler for mutations
  const onActionError = (error) => {
    console.error("Image action failed:", error);
    alert(`Action failed: ${error.message}`);
  };

  // Define mutations for each action
  const deleteMutation = useMutation({
    mutationFn: (ids) => deleteImagesBulkApi(ids, token),
    onSuccess: onActionSuccess,
    onError: onActionError,
  });

  const restoreMutation = useMutation({
    mutationFn: (ids) => restoreImagesBulkApi(ids, token),
    onSuccess: onActionSuccess,
    onError: onActionError,
  });

  const permanentDeleteMutation = useMutation({
    mutationFn: (ids) => deleteImagesPermanentlyBulkApi(ids, token),
    // The API returns 204 No Content, so onSuccess receives no data.
    onSuccess: onActionSuccess,
    onError: onActionError,
  });

  // --- Define user-facing action functions ---

  const markImageAsDeleted = (imageId) => {
    deleteMutation.mutate([imageId]);
  };

  const restoreImage = (imageId) => {
    restoreMutation.mutate([imageId]);
  };

  const deleteImagePermanently = async (imageId) => {
    if (window.confirm("Are you sure you want to permanently delete this image? This cannot be undone.")) {
      try {
        await deleteImagePermanentlyApi(imageId, token);
        onActionSuccess(); // Manually trigger success handling
      } catch (error) {
        alert(`Action failed: ${error.message}`);
      }
    }
  };

  const deleteSelectedImages = async () => {
    deleteMutation.mutate(Array.from(selectedImages));
  };

  const restoreSelectedImages = async () => {
    restoreMutation.mutate(Array.from(selectedImages));
  };

  const deleteSelectedPermanently = async () => {
    if (window.confirm(`Are you sure you want to permanently delete ${selectedImages.size} images? This cannot be undone.`)) {
      permanentDeleteMutation.mutate(Array.from(selectedImages));
    }
  };

  const moveSelectedImages = (imageIds = selectedImages) => {
    openModal('moveFiles', {
      imageIds: Array.from(imageIds),
      onMoveComplete: () => {
        queryClient.invalidateQueries({ queryKey: ['images'] });
        setSelectedImages(new Set());
        setIsSelectMode(false);
      }
    });
  };

  return {
    markImageAsDeleted,
    restoreImage,
    deleteImagePermanently,
    deleteSelectedImages,
    restoreSelectedImages,
    deleteSelectedPermanently,
    moveSelectedImages,
    // Expose loading states for UI feedback
    isDeleting: deleteMutation.isPending,
    isRestoring: restoreMutation.isPending,
    isDeletingPermanently: permanentDeleteMutation.isPending,
  };
};