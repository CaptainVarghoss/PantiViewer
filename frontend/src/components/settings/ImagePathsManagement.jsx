import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import TagCluster from '../TagCluster';
import { MdDelete } from "react-icons/md";

/**
 * Manages image paths, allowing all users to view, and admins to add, edit, and delete.
 * @param {object} props - Component props.
 * @param {function} props.onBack - Callback to return to the previous menu.
 */
function ImagePathsManagement({ onBack }) {
  const { token, isAdmin, isAuthenticated } = useAuth();
  const [imagePaths, setImagePaths] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  // State for in-place editing
  const [editablePaths, setEditablePaths] = useState([]);

  // State to manage which tag picker is open
  const [openTagPicker, setOpenTagPicker] = useState({ pathId: null, type: null });

  // State for the "Add New" form
  const [newPath, setNewPath] = useState({ path: '', short_name: '', description: '', admin_only: true, is_ignored: false });


  const fetchImagePaths = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      const response = await fetch('/api/imagepaths/', { headers });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setImagePaths(data);
      setEditablePaths(JSON.parse(JSON.stringify(data))); // Deep copy for editing
    } catch (err) {
      console.error('Error fetching image paths:', err);
      setError('Failed to load image paths.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchImagePaths();
  }, [fetchImagePaths]);

  const handleInputChange = (id, field, value) => {
    setEditablePaths(prev =>
      prev.map(path =>
        path.id === id ? { ...path, [field]: value } : path
      )
    );
  };

  const handleNewPathChange = (field, value) => {
    setNewPath(prev => ({ ...prev, [field]: value }));
  };

  const handleCancelChanges = () => {
    setEditablePaths(JSON.parse(JSON.stringify(imagePaths))); // Reset to original
    setMessage(null);
    setError(null);
  };

  const handleSaveChanges = async () => {
    if (!isAdmin) return;
    setIsSaving(true);
    setError(null);
    setMessage(null);

    const updatePromises = editablePaths.map(path => {
      const originalPath = imagePaths.find(p => p.id === path.id);
      if (JSON.stringify(path) === JSON.stringify(originalPath)) {
        return Promise.resolve({ ok: true }); // No changes, skip
      }

      // For PUT, only send changed fields
      const payload = {};
      if (path.path !== originalPath.path) payload.path = path.path;
      if (path.short_name !== originalPath.short_name) payload.short_name = path.short_name;
      if (path.description !== originalPath.description) payload.description = path.description;
      if (path.admin_only !== originalPath.admin_only) payload.admin_only = path.admin_only;
      if (path.is_ignored !== originalPath.is_ignored) payload.is_ignored = path.is_ignored;

      return fetch(`/api/imagepaths/${path.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
    });

    try {
      const results = await Promise.all(updatePromises);
      const failed = results.filter(res => !res.ok);

      if (failed.length > 0) {
        throw new Error(`${failed.length} path(s) failed to update.`);
      }

      setMessage('All changes saved successfully!');
      fetchImagePaths(); // Refetch to sync state
    } catch (err) {
      setError(err.message || 'An error occurred while saving changes.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddNewPath = async (e) => {
    e.preventDefault();
    if (!isAdmin) return;
    setIsSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch('/api/imagepaths/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...newPath,
          short_name: newPath.short_name === '' ? null : newPath.short_name,
        }),
      });

      if (response.ok) {
        setMessage('New path added successfully!');
        setNewPath({ path: '', short_name: '', description: '', admin_only: true, is_ignored: false }); // Reset form
        fetchImagePaths();
      } else {
        const errorData = await response.json();
        setError(`Failed to add path: ${errorData.detail || response.statusText}`);
      }
    } catch (err) {
      setError(err.message || 'An error occurred while adding the path.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (pathId) => {
    if (!isAdmin) return;
    if (!window.confirm('Are you sure you want to delete this image path? This cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`/api/imagepaths/${pathId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        setMessage('Image path deleted successfully!');
        fetchImagePaths(); // Refetch to update the list
      } else {
        const errorData = await response.json();
        setError(`Failed to delete path: ${errorData.detail || response.statusText}`);
      }
    } catch (err) {
      console.error('Error deleting image path:', err);
      setError('Network error or failed to delete image path.');
    }
  };

  const hasUnsavedChanges = JSON.stringify(imagePaths) !== JSON.stringify(editablePaths);

  return (
    <>
      <div className="section-container">
        <div className="section-header">
          <h3>Configured Folder Paths</h3>
        </div>
        {loading ? (
          <p>Loading folder paths...</p>
        ) : editablePaths.length === 0 ? (
          <p className="status-text">No folder paths configured yet.</p>
        ) : (
          <div className="section-list">
            {editablePaths.map((path) => (
              <div key={path.id} className="section-item">
                <div className="section-row">
                  <div className="section-fields">
                    <div className="form-group">
                      <label>Full Path:</label>
                      <input
                        type="text"
                        value={path.path}
                        onChange={(e) => handleInputChange(path.id, 'path', e.target.value)}
                        className="form-input-base"
                        disabled={!isAdmin}
                      />
                    </div>
                    <div className="form-group">
                      <label>Short Name:</label>
                      <input
                        type="text"
                        value={path.short_name || ''}
                        onChange={(e) => handleInputChange(path.id, 'short_name', e.target.value)}
                        className="form-input-base"
                        disabled={!isAdmin}
                      />
                    </div>
                  </div>
                  <div className="section-fields">
                    <div className="path-edit-toggles">
                      <div className="checkbox-container">
                        <span className="checkbox-label">Admin Only</span>
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            className="checkbox-base"
                            checked={path.admin_only}
                            onChange={(e) => handleInputChange(path.id, 'admin_only', e.target.checked)}
                            disabled={!isAdmin}
                          />
                        </label>
                      </div>
                      <div className="checkbox-container">
                        <span className="checkbox-label">Ignore</span>
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            className="checkbox-base"
                            checked={path.is_ignored}
                            onChange={(e) => handleInputChange(path.id, 'is_ignored', e.target.checked)}
                            disabled={!isAdmin}
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                  {isAdmin && (
                    <div className="section-fields">
                      <button onClick={() => handleDelete(path.id)} className="btn-base btn-red icon-button" title="Delete Path">
                        <MdDelete size={18} />
                      </button>
                    </div>
                  )}
                </div>
                <div className="section-row">
                    <div className="section-fields">
                        <div className="form-group">
                            <label>Tags</label>
                            <TagCluster.Popup type="imagepath_tags" itemId={path.id} isEmbedded={true} />
                        </div>
                    </div>
                </div>
              </div>
            ))}
            {isAdmin && (
              <div className="section-footer">
                {hasUnsavedChanges && (
                  <>
                    <button onClick={handleCancelChanges} className="btn-base btn-orange" disabled={isSaving}>
                      Discard Changes
                    </button>
                    <button onClick={handleSaveChanges} className="btn-base btn-green" disabled={isSaving || !hasUnsavedChanges}>
                      {isSaving ? 'Saving...' : 'Apply Changes'}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {isAuthenticated && isAdmin && (
        <>
          <div className="section-container">
            <form onSubmit={handleAddNewPath}>
              <div className="section-header">
                <h3>Add New Folder Path</h3>
              </div>
              <div className="section-list">
                <div className="section-item">
                  <div className="section-row">
                    <div className="section-fields">
                      <div className="form-group">
                        <label htmlFor="path" className="settings-label">
                          Full Path:
                        </label>
                        <input
                          type="text"
                          value={newPath.path}
                          onChange={(e) => handleNewPathChange('path', e.target.value)}
                          className="form-input-base"
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="shortName" className="settings-label">
                          Short Name:
                        </label>
                        <input
                          type="text"
                          value={newPath.short_name}
                          onChange={(e) => handleNewPathChange('short_name', e.target.value)}
                          className="form-input-base"
                          required
                        />
                      </div>
                    </div>
                    <div className="section-fields">
                      <div className="checkbox-container">
                        <span className="checkbox-label">Admin Only</span>
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            className="checkbox-base"
                            checked={newPath.admin_only}
                            onChange={(e) => handleNewPathChange('admin_only', e.target.checked)}
                          />
                        </label>
                      </div>
                      <div className="checkbox-container">
                        <span className="checkbox-label">Ignore Path</span>
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            className="checkbox-base"
                            checked={newPath.is_ignored}
                            onChange={(e) => handleNewPathChange('is_ignored', e.target.checked)}
                          />
                        </label>
                      </div>
                    </div>
                    <div className="section-fields"></div>
                  </div>
                </div>
              </div>
              <div className="section-footer">
                <button type="submit" className="btn-base btn-primary" disabled={isSaving}>
                  {isSaving ? 'Adding...' : 'Add Path'}
                </button>
              </div>
            </form>
          </div>
        </>
       )}      
    </>
  );
}

export default ImagePathsManagement;