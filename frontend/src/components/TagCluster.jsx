import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { IoClose, IoAddCircleOutline, IoRemoveCircleOutline } from 'react-icons/io5';


/**
 * A custom hook to handle clicks outside of a specified element.
 * @param {React.RefObject} ref - The ref of the element to monitor.
 * @param {Function} handler - The function to call when a click outside occurs.
 */
function useOutsideAlerter(ref, handler) {
    useEffect(() => {
        function handleClickOutside(event) {
            if (ref.current && !ref.current.contains(event.target)) {
                handler();
            }
        }
        // Bind the event listener
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            // Unbind the event listener on clean up
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [ref, handler]);
}

// A simple event bus for communication between TagCluster components
const tagUpdateManager = new EventTarget();

/**
 * A self-contained component to display and manage tags for different entity types.
 * It exports two sub-components: `TagCluster.Display` and `TagCluster.Popup`.
 */
const TagCluster = () => null; // Base component does nothing itself.

/**
 * Displays the active tags for a given item.
 * @param {string} type - The type of the item (e.g., 'filter_tags', 'filter_neg_tags').
 * @param {number} itemId - The ID of the item.
 */
TagCluster.Display = function TagDisplay({ type, itemId }) {
    const { token } = useAuth();
    const [activeTags, setActiveTags] = useState([]);

    const fetchActiveTags = useCallback(async () => {

        const fetchActiveTags = async () => {
            if (type.startsWith('filter')) {
                const response = await fetch(`/api/filters/${itemId}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.ok) {
                    const filter = await response.json();
                    const tagObjects = type === 'filter_tags' ? filter.tags : filter.neg_tags;
                    setActiveTags(tagObjects || []);
                }
            } else if (type === 'imagepath_tags') {
                const response = await fetch(`/api/imagepaths/${itemId}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.ok) {
                    const pathData = await response.json();
                    // Assuming the API returns tags directly in a 'tags' property
                    setActiveTags(pathData.tags || []);
                }
            } else if (type === 'image_tags') {
                const response = await fetch(`/api/tags/?imageId=${itemId}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.ok) {
                    const imageData = await response.json();
                    // This endpoint returns an array of tags directly
                    setActiveTags(imageData || []);
                }
            }
        };

        fetchActiveTags();
    }, [type, itemId, token]);

    useEffect(() => {
        if (!type || !itemId) return;

        fetchActiveTags(); // Initial fetch

        // Listener for updates from the Popup component
        const handleTagsUpdated = (event) => {
            if (event.detail.itemId === itemId && event.detail.type === type) {
                fetchActiveTags(); // Refetch if the update is for this component
            }
        };

        tagUpdateManager.addEventListener('tagsUpdated', handleTagsUpdated);

        // Cleanup listener on unmount
        return () => tagUpdateManager.removeEventListener('tagsUpdated', handleTagsUpdated);
    }, [type, itemId, fetchActiveTags]);

    return (
        <div className="tag-display-container">
            {activeTags.map(tag => (
                <span key={tag.id} className="tag-badge active">
                    {tag.name}
                </span>
            ))}
        </div>
    );
};

/**
 * Renders a popup menu for toggling tags on an item.
 * @param {string} type - The type of the item (e.g., 'filter_tags', 'filter_neg_tags').
 * @param {number} itemId - The ID of the item.
 * @param {Function} onClose - Callback to close the popup.
 */
TagCluster.Popup = function TagPopup({ type, itemId, itemIds, onClose, onTagSelect, isEmbedded = false }) {
    const { token, isAdmin, settings } = useAuth();
    const wrapperRef = useRef(null);
    
    // Only use the outside alerter if it's not embedded and an onClose function is provided.
    // The handler is a no-op if embedded.
    useOutsideAlerter(wrapperRef, !isEmbedded && onClose ? onClose : () => {});

    const [allTags, setAllTags] = useState([]);
    const [activeTagIds, setActiveTagIds] = useState(new Set());
    const [error, setError] = useState(null);
    const [newTagName, setNewTagName] = useState('');
    const [newTagAdminOnly, setNewTagAdminOnly] = useState(false);
    const [showCreateForm, setShowCreateForm] = useState(false);

    const canModifyTags = isAdmin || (settings?.allow_tag_add === true);

    // Fetch all available tags and the item's current tags
    useEffect(() => {
        const fetchData = async () => {
            try {
                // Fetch all tags (this part is extracted to be reusable)
                await fetchAllTags();

                // Fetch the specific item's current tags based on type
                if (type.startsWith('filter') && itemId) {
                    const filterResponse = await fetch(`/api/filters/${itemId}`, { headers: { 'Authorization': `Bearer ${token}` } });
                    if (!filterResponse.ok) throw new Error('Failed to fetch filter details');
                    const filterData = await filterResponse.json();
                    // The API returns full tag objects in `tags` and `neg_tags` arrays.
                    // We need to extract the IDs from these objects.
                    const tagObjects = type === 'filter_tags' ? filterData.tags : filterData.neg_tags;
                    setActiveTagIds(new Set((tagObjects || []).map(tag => tag.id)));
                }
                // Handle imagepath_tags
                else if (type === 'imagepath_tags' && itemId) {
                    const pathResponse = await fetch(`/api/imagepaths/${itemId}`, { headers: { 'Authorization': `Bearer ${token}` } });
                    if (!pathResponse.ok) throw new Error('Failed to fetch image path details');
                    const pathData = await pathResponse.json();
                    const tagObjects = pathData.tags;
                    setActiveTagIds(new Set((tagObjects || []).map(tag => tag.id)));
                } else if (type === 'image_tags' && itemId) {
                    const imageResponse = await fetch(`/api/tags/?imageId=${itemId}`, { headers: { 'Authorization': `Bearer ${token}` } });
                    if (!imageResponse.ok) throw new Error('Failed to fetch image details');
                    const imageData = await imageResponse.json();
                    // This endpoint returns an array of tags directly.
                    // We just need their IDs.
                    setActiveTagIds(new Set((imageData || []).map(tag => tag.id)));
                } else if (type === 'image_tags_bulk') {
                    // For bulk editing, we start with no active tags. The user will select tags to apply to all.
                    setActiveTagIds(new Set());
                }

            } catch (err) {
                setError(err.message);
            }
        };
        fetchData();
    }, [type, itemId, itemIds, token]);

    // Function to fetch all tags, can be called independently
    const fetchAllTags = async () => {
        const tagsResponse = await fetch('/api/tags/', { headers: { 'Authorization': `Bearer ${token}` } });
        if (!tagsResponse.ok) throw new Error('Failed to fetch all tags');
        const tagsData = await tagsResponse.json();
        setAllTags(tagsData);
    };

    const handleTagToggle = useCallback(async (tag) => {
        // If onTagSelect is provided, we are in selection mode for the search bar.
        if (onTagSelect) {
            onTagSelect(tag);
            return; // Don't proceed with updating tags on an item.
        }

        const newActiveTagIds = new Set(activeTagIds);
        if (newActiveTagIds.has(tag.id)) {
            newActiveTagIds.delete(tag.id);
        } else {
            newActiveTagIds.add(tag.id);
        }

        // Optimistically update the UI
        setActiveTagIds(newActiveTagIds);

        // Persist the change to the backend
        try {
            let response;
            if (type.startsWith('filter')) {
                const field = type === 'filter_tags' ? 'tag_ids' : 'neg_tag_ids';
                const payload = { [field]: Array.from(newActiveTagIds) };
                response = await fetch(`/api/filters/${itemId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify(payload)
                });
            } else if (type === 'imagepath_tags') {
                const payload = { tag_ids: Array.from(newActiveTagIds) };
                response = await fetch(`/api/imagepaths/${itemId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify(payload)
                });
            } else if (type === 'image_tags') {
                // This endpoint is specifically for updating tags on an image
                const payload = { tag_ids: Array.from(newActiveTagIds) };
                response = await fetch(`/api/images/${itemId}/tags`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify(payload)
                });
            } else if (type === 'image_tags_bulk') {
                // This is the new bulk update logic
                const payload = { // Ensure itemIds is not undefined before creating the payload
                    image_ids: Array.from(itemIds),
                    tag_id: tag.id,
                    action: newActiveTagIds.has(tag.id) ? 'add' : 'remove'
                };
                response = await fetch(`/api/images/tags/bulk-update`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify(payload)
                });
            }

            if (!response.ok) {
                throw new Error('Failed to update tags.');
            }

            if (type === 'image_tags_bulk') {
                // For bulk updates, we might need a more general notification
                // or rely on a full refresh triggered by the parent component.
                // For now, we can dispatch for each item if itemIds exists.
                itemIds.forEach(id => tagUpdateManager.dispatchEvent(new CustomEvent('tagsUpdated', { detail: { itemId: id, type: 'image_tags' } })));
            } else {
                // Dispatch a custom event to notify Display components of the change
                tagUpdateManager.dispatchEvent(new CustomEvent('tagsUpdated', {
                    detail: { itemId, type }
                }));
            }

        } catch (err) {
            setError(err.message);
            // Revert optimistic update on error (optional, could refetch)
        }
    }, [activeTagIds, type, itemId, itemIds, token, onTagSelect]);

    const handleCreateTag = async (e) => {
        e.preventDefault();
        if (!newTagName.trim() || !canModifyTags) return;

        try {
            const payload = { name: newTagName.trim() };
            if (newTagAdminOnly) {
                payload.admin_only = true;
            }

            const response = await fetch('/api/tags/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Failed to create tag.');
            }

            // Clear the input and refetch all tags to show the new one
            setNewTagName('');
            setNewTagAdminOnly(false);
            await fetchAllTags();

        } catch (err) {
            setError(err.message);
            // Optionally, provide more specific feedback to the user
        }
    };

    if (error) return <div ref={wrapperRef} className="tag-cluster-popup"><p className="error-text">{error}</p></div>;

    const tagEditorContent = (
        <div className="tag-cluster-content">
            {allTags.map(tag => {
                const isActive = activeTagIds.has(tag.id);
                const tagClasses = `tag-badge ${isActive ? 'active' : ''}`;
                const isClickable = canModifyTags;
                return (
                    <span
                        key={tag.id}
                        className={`${tagClasses} ${isClickable ? '' : 'not-clickable'}`}
                        onClick={isClickable ? () => handleTagToggle(tag) : undefined}
                    >
                        {tag.name}
                    </span>
                );
            })}
            {canModifyTags && (
                <>
                    <span>
                        <button
                            className="tag-create-toggle-btn"
                            onClick={() => setShowCreateForm(prev => !prev)}
                            title={showCreateForm ? "Hide form" : "Create new tag"}
                        >
                            {showCreateForm ? <IoRemoveCircleOutline size={24} /> : <IoAddCircleOutline size={24} />}
                        </button>
                    </span>
                    
                    <div className="tag-create-container">
                        <div className={`tag-create-form-wrapper ${showCreateForm ? 'visible' : ''}`}>
                            <form onSubmit={handleCreateTag} className="tag-create-form" id="tag-create-form">
                                <input
                                    type="text"
                                    name="newTagName"
                                    value={newTagName}
                                    onChange={(e) => setNewTagName(e.target.value)}
                                    placeholder="Create new tag..."
                                    className="form-input-base"
                                />
                                {isAdmin && (
                                    <label style={{ display: 'flex', alignItems: 'center', margin: '0 8px', cursor: 'pointer', whiteSpace: 'nowrap' }} title="Admin only tag">
                                        <input
                                            type="checkbox"
                                            checked={newTagAdminOnly}
                                            onChange={(e) => setNewTagAdminOnly(e.target.checked)}
                                            style={{ marginRight: '4px' }}
                                        />
                                        <span style={{ fontSize: '0.85em' }}>Admin</span>
                                    </label>
                                )}
                                <button type="submit" name="submit" disabled={!newTagName.trim()} className="btn-base btn-green">Add Tag</button>
                            </form>
                        </div>
                    </div>
                </>
            )}
        </div>
    );

    return isEmbedded ? tagEditorContent : (
        <div ref={wrapperRef} className="tag-cluster-popup">
            <button className="tag-cluster-close-btn" onClick={onClose} title="Close"><IoClose size={18} /></button>
            {tagEditorContent}
        </div>
    );
}

export default TagCluster;