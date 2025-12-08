import React, { createContext, useContext } from 'react';
import { useImageFetching } from '../hooks/useImageActions';

const ImageContext = createContext(null);

export const ImageProvider = ({ children, searchTerm, sortBy, sortOrder, filters, trash_only }) => {
  const imageFetchingState = useImageFetching({
    searchTerm,
    sortBy,
    sortOrder,
    filters,
    trash_only,
  });

  return (
    <ImageContext.Provider value={imageFetchingState}>
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