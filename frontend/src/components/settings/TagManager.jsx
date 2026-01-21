import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { MdDelete } from "react-icons/md";

/**
 * A component for managing tags.
 * Allows admins to create, edit, and delete tags.
 */
function TagManager() {
  const { token, isAdmin } = useAuth();
  const [tags, setTags] = useState([]);
  const [editableTags, setEditableTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  // State for the "Add New" form
  const [newTag, setNewTag] = useState({ name: '', admin_only: false });

  const fetchTags = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      const response = await fetch('/api/tags/', { headers });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setTags(data);
      setEditableTags(JSON.parse(JSON.stringify(data))); // Deep copy for editing
    } catch (err) {
      console.error('Error fetching tags:', err);
      setError('Failed to load tags.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (isAdmin) {
      fetchTags();
    }
  }, [fetchTags, isAdmin]);

  const handleInputChange = (id, field, value) => {
    setEditableTags(prev =>
      prev.map(tag =>
        tag.id === id ? { ...tag, [field]: value } : tag
      )
    );
  };

  const handleNewTagChange = (field, value) => {
    setNewTag(prev => ({ ...prev, [field]: value }));
  };

  const handleSaveChanges = async () => {
    if (!isAdmin) return;
    setIsSaving(true);
    setError(null);
    setMessage(null);

    const updatePromises = editableTags.map(tag => {
      const originalTag = tags.find(t => t.id === tag.id);
      if (JSON.stringify(tag) === JSON.stringify(originalTag)) {
        return Promise.resolve({ ok: true }); // No changes
      }

      return fetch(`/api/tags/${tag.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(tag),
      });
    });

    try {
      const results = await Promise.all(updatePromises);
      const failed = results.filter(res => !res.ok);

      if (failed.length > 0) {
        throw new Error(`${failed.length} tag(s) failed to update.`);
      }

      setMessage('All changes saved successfully!');
      fetchTags(); // Refetch to sync state
    } catch (err) {
      setError(err.message || 'An error occurred while saving changes.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddNewTag = async (e) => {
    e.preventDefault();
    if (!isAdmin) return;
    setIsSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch('/api/tags/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(newTag),
      });

      if (response.ok) {
        setMessage('New tag added successfully!');
        setNewTag({ name: '', admin_only: false }); // Reset form
        fetchTags();
      } else {
        const errorData = await response.json();
        setError(`Failed to add tag: ${errorData.detail || response.statusText}`);
      }
    } catch (err) {
      setError(err.message || 'An error occurred while adding the tag.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (tagId) => {
    if (!isAdmin) return;
    if (!window.confirm('Are you sure you want to delete this tag? This cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`/api/tags/${tagId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (response.ok) {
        setMessage('Tag deleted successfully!');
        fetchTags();
      } else {
        const errorData = await response.json();
        setError(`Failed to delete tag: ${errorData.detail || response.statusText}`);
      }
    } catch (err) {
      console.error('Error deleting tag:', err);
      setError('Network error or failed to delete tag.');
    }
  };

  const hasUnsavedChanges = JSON.stringify(tags) !== JSON.stringify(editableTags);

  if (!isAdmin) {
    return;
  }

  return (
    <>
      <div className="section-container">
        <div className="section-header">
          <h3>Manage Tags</h3>
        </div>
        {loading ? <p>Loading tags...</p> : (
          <div className="section-list">
            {editableTags.map((tag) => (
              <div key={tag.id} className="section-item">
                <div className="section-row">
                  <div className="section-fields">
                    <div className="form-group">
                      <label>Name:</label>
                      <input type="text" value={tag.name} onChange={(e) => handleInputChange(tag.id, 'name', e.target.value)} className="form-input-base" />
                    </div>
                  </div>
                  <div className="section-fields">
                    <div className="form-group">
                      <label className="checkbox-label">
                        <input type="checkbox" checked={tag.admin_only || false} onChange={(e) => handleInputChange(tag.id, 'admin_only', e.target.checked)} />
                        <span className="checkbox-custom"></span>
                        Admin Only
                      </label>
                    </div>
                  </div>
                  <div className="section-fields">
                    <button onClick={() => handleDelete(tag.id)} className="btn-base btn-red icon-button" title="Delete Tag"><MdDelete size={18} /></button>
                  </div>
                </div>
              </div>
            ))}
            {hasUnsavedChanges && (
              <div className="section-footer">
                <button onClick={handleSaveChanges} className="btn-base btn-green" disabled={isSaving}>{isSaving ? 'Saving...' : 'Apply Changes'}</button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="section-container">
        <form onSubmit={handleAddNewTag}>
          <div className="section-header"><h3>Add New Tag</h3></div>
          <div className="section-list">
            <div className="section-item">
              <div className="section-row">
                <div className="section-fields">
                  <div className="form-group"><label>Name:</label><input type="text" value={newTag.name} onChange={(e) => handleNewTagChange('name', e.target.value)} className="form-input-base" required /></div>
                </div>
                <div className="section-fields">
                  <div className="form-group">
                    <label className="checkbox-label">
                      <input type="checkbox" checked={newTag.admin_only} onChange={(e) => handleNewTagChange('admin_only', e.target.checked)} />
                      <span className="checkbox-custom"></span>
                      Admin Only
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="section-footer">
            <button type="submit" className="btn-base btn-primary" disabled={isSaving}>{isSaving ? 'Adding...' : 'Add Tag'}</button>
          </div>
        </form>
      </div>
    </>
  );
}

export default TagManager;