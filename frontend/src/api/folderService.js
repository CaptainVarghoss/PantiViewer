/**
 * Service layer for all folder-related API requests.
 */

const getHeaders = (token) => {
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

export const fetchFoldersAsTreeApi = async (token) => {
  const response = await fetch('/api/folders/?format=tree', { headers: getHeaders(token) });
  if (!response.ok) throw new Error(`Failed to fetch folders: ${response.statusText}`);
  return response.json();
};