/**
 * Service layer for all image-related API requests.
 */

const handleResponse = async (response) => {
  if (!response.ok) {
    const errorText = await response.text();
    console.error('HTTP Error Details:', response.status, response.statusText, errorText);
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json();
};

const getHeaders = (token) => {
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

export const fetchImagesApi = async (token, queryString) => {
  const response = await fetch(`/api/images/?${queryString.toString()}`, { headers: getHeaders(token) });
  return handleResponse(response);
};

export const fetchImageByIdApi = async (imageId, token) => {
  try {
    const response = await fetch(`/api/images/${imageId}`, { headers: getHeaders(token) });
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`HTTP Error Details for image ${imageId}:`, response.status, response.statusText, errorText);
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`Error fetching image ${imageId}:`, error);
    return null;
  }
};

export const deleteImageApi = async (imageId, token) => {
  const response = await fetch(`/api/images/${imageId}/delete`, {
    method: 'POST',
    headers: getHeaders(token),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP error! status: ${response.status}, details: ${errorText}`);
  }
  // No JSON body on success for this endpoint
};

export const restoreImageApi = async (imageId, token) => {
  const response = await fetch(`/api/images/${imageId}/restore`, {
    method: 'POST',
    headers: getHeaders(token),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP error! status: ${response.status}, details: ${errorText}`);
  }
};

export const deleteImagePermanentlyApi = async (imageId, token) => {
  if (!window.confirm("Are you sure you want to permanently delete this image? This action cannot be undone.")) {
    return;
  }
  const response = await fetch(`/api/images/${imageId}/permanent`, {
    method: 'DELETE',
    headers: getHeaders(token),
  });
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
};

export const deleteImagesBulkApi = async (imageIds, token) => {
  const response = await fetch('/api/images/delete-bulk', {
    method: 'POST',
    headers: getHeaders(token),
    body: JSON.stringify(imageIds),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.detail || 'Failed to move images to trash.');
  }
};

export const restoreImagesBulkApi = async (imageIds, token) => {
  const response = await fetch('/api/trash/restore', {
    method: 'POST',
    headers: getHeaders(token),
    body: JSON.stringify(imageIds),
  });
  if (!response.ok) {
    throw new Error('Failed to restore images.');
  }
};

export const deleteImagesPermanentlyBulkApi = async (imageIds, token) => {
  if (window.confirm(`Are you sure you want to PERMANENTLY delete ${imageIds.length} selected image(s)? This cannot be undone.`)) {
    const response = await fetch('/api/trash/delete-permanent', {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify(imageIds),
    });
    if (!response.ok) {
      throw new Error('Failed to permanently delete images.');
    }
    return true; // Confirmed and API call succeeded
  }
  return false; // User cancelled
};

export const moveImagesApi = async ({ imageIds, destinationPath, token }) => {
  const response = await fetch('/api/images/move', {
    method: 'POST',
    headers: getHeaders(token),
    body: JSON.stringify({
      imageIds: imageIds,
      destinationPath: destinationPath,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.detail || 'An error occurred during the move.');
  }
};