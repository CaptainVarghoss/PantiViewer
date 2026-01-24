import React, { useState, useEffect, useCallback } from 'react';
import ConfirmationDialog from '../ConfirmDialog';
import { useAuth } from '../../context/AuthContext';
import { useFilters } from '../../context/FilterContext';
import { MdDelete } from "react-icons/md";
import IconPicker from '../IconPicker'; // Import the new component
import TagCluster from '../TagCluster';
import * as MdIcons from 'react-icons/md'; // Import all icons to render them

/**
 * Reads the --theme-color-list CSS custom property from the root element,
 * trims it, and splits it into an array of color variable names.
 * @returns {string[]} An array of color variable names (e.g., ['color-primary', 'accent-red']).
 */
const getThemeColors = () => {
  try {
    const styles = getComputedStyle(document.documentElement);
    const themeColorListString = styles.getPropertyValue('--theme-color-list').trim();
    if (themeColorListString) {
      return themeColorListString.split(' ');
    }
    return [];
  } catch (error) {
    console.error("Failed to read theme colors from CSS:", error);
    return []; // Return an empty array on error
  }
};
/**
 * A helper component to render the editor for a single filter stage (main, second, third).
 * It contains the logic to disable options that are already in use by other stages.
 */
const FilterStageEditor = ({
    stage,
    filter,
    handleInputChange,
    isAdmin,
    baseStageOptions,
    thirdStageOptions,
    themeColors,
    onIconPickerOpen
}) => {
    const otherStageValues = ['main', 'second', 'third']
        .filter(s => s !== stage)
        .map(s => filter[`${s}_stage`]);

    const availableOptions = stage === 'third' ? thirdStageOptions : baseStageOptions;

    const IconComponent = filter[`${stage}_stage_icon`] ? MdIcons[filter[`${stage}_stage_icon`]] : null;

    return (
        <div key={`${filter.id || 'new'}-${stage}`} className="section-fields">
            <h5 className="stage-title">{stage.charAt(0).toUpperCase() + stage.slice(1)} Stage</h5>
            <div className="form-group">
                <select
                    value={filter[`${stage}_stage`] || ''}
                    onChange={(e) => handleInputChange(filter.id, `${stage}_stage`, e.target.value)}
                    className="form-input-base dropdown-base"
                    disabled={!isAdmin}
                >
                    {availableOptions.map(opt => (
                        <option
                            key={opt}
                            value={opt}>
                            {opt}
                        </option>
                    ))}
                </select>
            </div>
            <div className="form-group">
                <select
                    value={filter[`${stage}_stage_color`] || ''}
                    onChange={(e) => handleInputChange(filter.id, `${stage}_stage_color`, e.target.value)}
                    className="form-input-base dropdown-base"
                    disabled={!isAdmin}
                    style={{ backgroundColor: filter[`${stage}_stage_color`] ? `var(--${filter[`${stage}_stage_color`]})` : 'transparent', color: 'white' }}
                >
                    <option value="">-- Select Color --</option>
                    {/* Use themeColors which is an array of strings */}
                    {themeColors.map(colorName => (
                        <option 
                            key={colorName} 
                            value={colorName} 
                            style={{ backgroundColor: `var(--${colorName})` }}
                        >{colorName}</option>
                    ))}
                </select>
            </div>
            <div className="form-group">
                <label>Icon</label>                
                <button
                    type="button"
                    className="btn-base"
                    onClick={() => onIconPickerOpen(filter.id || 'new', `${stage}_stage_icon`)}
                    disabled={!isAdmin}
                >
                    {IconComponent ? <IconComponent size={20} /> : 'Choose Icon'}
                </button>
            </div>
        </div>
    );
};

function FilterManager({ isAdmin }) {
    const { token } = useAuth();
    const { filters } = useFilters();

    // Define options for stage dropdowns based on new rules
    const baseStageOptions = ['show', 'hide', 'show_only'];
    const thirdStageOptions = ['show', 'hide', 'show_only', 'disabled'];
    const [themeColors, setThemeColors] = useState([]);

    // Local state for editing. This is a copy of the filters prop and is only updated on edit or after a save.
    const [editableFilters, setEditableFilters] = useState(() => JSON.parse(JSON.stringify(filters)));

    const [newFilter, setNewFilter] = useState({
        name: '', search_terms: '', header_display: 0, admin_only: false,
        main_stage: 'hide', main_stage_color: '', main_stage_icon: '', // Default unique values
        second_stage: 'show', second_stage_color: '', second_stage_icon: '', // Default unique values
        third_stage: 'disabled', third_stage_color: '', third_stage_icon: '', // Default unique values
        tag_ids: [], neg_tag_ids: []
    });
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState(null);
    const [message, setMessage] = useState(null);
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);
    const [filterToDelete, setFilterToDelete] = useState('');

    // State to manage which tag picker is open
    const [openTagPicker, setOpenTagPicker] = useState({ filterId: null, type: null });

    // State for the Icon Picker
    const [isIconPickerOpen, setIsIconPickerOpen] = useState(false);
    const [iconTarget, setIconTarget] = useState({ filterId: null, field: null });

    const openIconPicker = (filterId, field) => {
        setIconTarget({ filterId, field });
        setIsIconPickerOpen(true);
    };

    const closeIconPicker = () => {
        setIsIconPickerOpen(false);
    };

    // Fetch theme colors from CSS on component mount
    useEffect(() => {
        setThemeColors(getThemeColors());
    }, [token]);

    // This effect now only runs when the modal is first opened or if the filters
    // are changed from outside the settings modal (which is unlikely).
    useEffect(() => {
        const deepCopy = JSON.parse(JSON.stringify(filters)); // Create a deep copy to avoid mutation.
        setEditableFilters(deepCopy);
    }, [filters]);

    const handleInputChange = (id, field, value) => {
        setEditableFilters(prevEditableFilters =>
            prevEditableFilters.map(filter => {
                if (filter.id !== id) return filter;

                const updatedFilter = { ...filter, [field]: value };

                // Logic to prevent duplicate stage values
                if (field.endsWith('_stage')) {
                    const stages = ['main_stage', 'second_stage', 'third_stage'];
                    const changedStage = field;
                    const conflictStage = stages.find(s => s !== changedStage && updatedFilter[s] === value);

                    if (conflictStage) {
                        const allOptions = ['show', 'hide', 'show_only', 'disabled'];
                        const usedValues = stages.map(s => updatedFilter[s]);
                        const newValueForConflict = allOptions.find(opt => !usedValues.includes(opt));
                        if (newValueForConflict) {
                            updatedFilter[conflictStage] = newValueForConflict;
                        }
                    }
                }
                return updatedFilter;
            })
        );
    };

    const handleIconSelect = (iconName) => {
        const { filterId, field } = iconTarget;
        if (filterId === 'new') {
            handleNewFilterChange(field, iconName);
        } else {
            handleInputChange(filterId, field, iconName);
        }
        closeIconPicker();
    };

    const handleNewFilterChange = (field, value) => {
        setNewFilter(prevFilter => {
            const updatedFilter = { ...prevFilter, [field]: value };
    
            if (field.endsWith('_stage')) {
                const stages = ['main_stage', 'second_stage', 'third_stage'];
                const changedStage = field;
                const conflictStage = stages.find(s => s !== changedStage && updatedFilter[s] === value);
    
                if (conflictStage) {
                    const allOptions = ['show', 'hide', 'show_only', 'disabled'];
                    const usedValues = stages.map(s => updatedFilter[s]);
                    const newValueForConflict = allOptions.find(opt => !usedValues.includes(opt));
    
                    if (newValueForConflict) {
                        updatedFilter[conflictStage] = newValueForConflict;
                    }
                }
            }
    
            return updatedFilter;
        });
    };

    const handleDiscardChanges = () => {
        setEditableFilters(JSON.parse(JSON.stringify(filters))); // Revert local state to the original prop state
        setMessage(null);
        setError(null);
    };

    const handleSaveChanges = async () => {
        if (!isAdmin || !hasUnsavedChanges) return; // Guard against saving if no changes
        setIsSaving(true);
        setError(null);
        setMessage(null);

        const updatePromises = editableFilters.map(filter => {
            const originalFilter = filters.find(f => f.id === filter.id);
            if (JSON.stringify(filter) === JSON.stringify(originalFilter)) {
                return Promise.resolve({ ok: true }); // No changes, skip update for this filter
            }

            return fetch(`/api/filters/${filter.id}`, {
                method: 'PUT', // The backend handles partial updates, so sending the whole object is fine.
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify(filter),
            });
        });

        try {
            const results = await Promise.all(updatePromises);
            const failed = results.filter(res => !res.ok);

            if (failed.length > 0) {
                throw new Error(`${failed.length} filter(s) failed to update.`);
            }

            setMessage('All changes saved successfully!');
            // Call the refetch function passed from App.jsx. This will update the parent state,
            // which will now correctly flow down as new props, triggering the useEffect to update local state.
            await refetchFilters();
        } catch (err) {
            setError(err.message || 'An error occurred while saving changes.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleAddNewFilter = async (e) => {
        e.preventDefault();
        if (!isAdmin) return;
        setIsSaving(true);
        setError(null);
        setMessage(null);

        try {
            const response = await fetch('/api/filters/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify(newFilter),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Failed to add filter');
            }

            setMessage('New filter added successfully!');
            setNewFilter({ // Reset form to default values
                name: '', search_terms: '', header_display: 0, admin_only: false,
                main_stage: 'hide', main_stage_color: '', main_stage_icon: '',
                second_stage: 'show', second_stage_color: '', second_stage_icon: '',
                third_stage: 'disabled', third_stage_color: '', third_stage_icon: '',
                tag_ids: [], neg_tag_ids: []
            });

            // Refetch all filters to update list
            const refetchResponse = await fetch('/api/filters/', { headers: { 'Authorization': `Bearer ${token}` } });
            const updatedFilters = await refetchResponse.json();
            refetchFilters();

        } catch (err) {
            setError(err.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteFilter = async () => {
        if (!filterToDelete || !isAdmin) return;

        try {
            const response = await fetch(`/api/filters/${filterToDelete}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` },
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Failed to delete filter');
            }

            setMessage('Filter deleted successfully!');
            // Refetch to update list
            const refetchResponse = await fetch('/api/filters/', { headers: { 'Authorization': `Bearer ${token}` } });
            const updatedFilters = await refetchResponse.json();
            refetchFilters();

        } catch (err) {
            setError(err.message);
        } finally {
            setShowConfirmDialog(false);
            setFilterToDelete('');
        }
    };

    const handleDeleteClick = (filterId) => {
        setFilterToDelete(filterId);
        setShowConfirmDialog(true);
    };
    
    // Compare the current filters state (from props) with the pristine initial state.
    const hasUnsavedChanges = JSON.stringify(editableFilters) !== JSON.stringify(filters);

    return (
        <>
            {isIconPickerOpen && (
                <div className="section-container">
                    <IconPicker
                        onSelectIcon={handleIconSelect}
                        onClose={closeIconPicker}
                    />
                </div>
            )}
            {!isIconPickerOpen && (
                <>
                    <div className="section-container">
                        <div className="section-header">
                            <h3>Configured Filters</h3>
                        </div>
                        {editableFilters.length === 0 ? (
                            <p className="status-text">No filters configured yet.</p>
                        ) : (
                            <div className="section-list">
                                {editableFilters.map(filter => (
                                    <div key={filter.id} className="section-item">
                                        <div className="section-row">
                                            <div className="section-fields">
                                                <div className="form-group">
                                                    <label htmlFor="name">Name</label>
                                                    <input
                                                        type="text"
                                                        value={filter.name || ''}
                                                        id="name"
                                                        onChange={(e) => handleInputChange(filter.id, 'name', e.target.value)}
                                                        className="form-input-base"
                                                        disabled={!isAdmin}
                                                    />
                                                </div>
                                                <div className="form-group form-group-full">
                                                    <label htmlFor="search_terms">Search Terms</label>
                                                    <textarea
                                                        rows="3"
                                                        value={filter.search_terms || ''}
                                                        id="search_terms"
                                                        onChange={(e) => handleInputChange(filter.id, 'search_terms', e.target.value)}
                                                        className="form-input-base"
                                                        disabled={!isAdmin}
                                                    />
                                                </div>
                                            </div>
                                            <div className="section-fields section-fields-toggles">
                                                <div className="checkbox-container">
                                                    <span className="checkbox-label">Admin Only</span>
                                                    <label className="checkbox-label">
                                                        <input
                                                            type="checkbox"
                                                            className="checkbox-base"
                                                            checked={filter.admin_only || false}
                                                            onChange={(e) => handleInputChange(filter.id, 'admin_only', e.target.checked)}
                                                            disabled={!isAdmin}
                                                        />
                                                    </label>
                                                </div>
                                                <div className="checkbox-container">
                                                    <label className="form-label" htmlFor={`filter-header-display-${filter.id}`}>Display Location</label>
                                                    <select
                                                        id={`filter-header-display-${filter.id}`}
                                                        value={filter.header_display}
                                                        onChange={(e) => handleInputChange(filter.id, 'header_display', parseInt(e.target.value, 10))}
                                                        className="form-input-base dropdown-base"
                                                        disabled={!isAdmin}
                                                    >
                                                        <option value={0}>Disabled</option>
                                                        <option value={1}>Top Bar</option>
                                                        <option value={2}>Second Bar</option>
                                                        <option value={3}>Auxiliary Bar</option>
                                                    </select>
                                                </div>
                                            </div>
                                            <div className="section-fields">
                                                {isAdmin && (
                                                    <button onClick={() => handleDeleteClick(filter.id)} className="btn-base btn-red icon-button" title="Delete Filter"><MdDelete size={18} /></button>
                                                )}
                                            </div>
                                        </div>
                                        <div className="section-row">
                                            <div className="section-fields">
                                                <div className="form-group">
                                                    <label>Tags</label>
                                                     <TagCluster.Display type="filter_tags" itemId={filter.id} />
                                                </div>
                                            </div>
                                            <div className="section-fields" style={{ position: 'relative' }}>
                                                <button type="button" className="btn-base" onClick={() => setOpenTagPicker(prev => (prev.filterId === filter.id && prev.type === 'tags') ? { filterId: null, type: null } : { filterId: filter.id, type: 'tags' })}>
                                                    Change Tags
                                                </button>
                                                {openTagPicker.filterId === filter.id && openTagPicker.type === 'tags' && ( <TagCluster.Popup type="filter_tags" itemId={filter.id} onClose={() => setOpenTagPicker({ filterId: null, type: null })} /> )}
                                            </div>
                                        </div>

                                        <div className="section-row">
                                            <div className="section-fields">
                                                <div className="form-group">
                                                    <label>Negative Tags</label>
                                                     <TagCluster.Display type="filter_neg_tags" itemId={filter.id} />
                                                </div>
                                            </div>
                                            <div className="section-fields" style={{ position: 'relative' }}>
                                                <button type="button" className="btn-base" onClick={() => setOpenTagPicker(prev => (prev.filterId === filter.id && prev.type === 'neg_tags') ? { filterId: null, type: null } : { filterId: filter.id, type: 'neg_tags' })}>
                                                    Change Negative Tags
                                                </button>
                                                {openTagPicker.filterId === filter.id && openTagPicker.type === 'neg_tags' && ( <TagCluster.Popup type="filter_neg_tags" itemId={filter.id} onClose={() => setOpenTagPicker({ filterId: null, type: null })} /> )}
                                            </div>
                                        </div>

                                        <div className="section-row">
                                            {['main', 'second', 'third'].map(stage => (
                                                <FilterStageEditor
                                                    key={`${filter.id}-${stage}`}
                                                    stage={stage}
                                                    filter={filter}
                                                    handleInputChange={handleInputChange}
                                                    isAdmin={isAdmin}
                                                    baseStageOptions={baseStageOptions}
                                                    thirdStageOptions={thirdStageOptions}
                                                    themeColors={themeColors}
                                                    onIconPickerOpen={openIconPicker}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                ))}
                                {isAdmin && (
                                    <div className="section-footer">
                                        {hasUnsavedChanges && (
                                            <>
                                                <button onClick={handleDiscardChanges} className="btn-base btn-orange" disabled={isSaving}>
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

                    {isAdmin && (
                        <div className="section-container">
                            <form onSubmit={handleAddNewFilter}>
                                <div className="section-header">
                                    <h3>Add New Filter</h3>
                                </div>
                                <div className="section-list">
                                    <div className="section-item">
                                        <div className="section-row">

                                            <div className="section-fields">
                                                <div className="form-group">
                                                    <label>Name</label>
                                                    <input
                                                        type="text"
                                                        placeholder="Filter Name"
                                                        value={newFilter.name}
                                                        onChange={(e) => handleNewFilterChange('name', e.target.value)}
                                                        className="form-input-base"
                                                        required
                                                    />
                                                </div>
                                                <div className="form-group form-group-full">
                                                    <label>Search Terms</label>
                                                    <textarea
                                                        rows="3"
                                                        placeholder="List of search terms."
                                                        value={newFilter.search_terms}
                                                        onChange={(e) => handleNewFilterChange('search_terms', e.target.value)}
                                                        className="form-input-base"
                                                    />
                                                </div>
                                            </div>
                                            <div className="section-fields section-fields-toggles">
                                                <div className="checkbox-container">
                                                    <span className="checkbox-label">Admin Only</span>
                                                    <label className="checkbox-label">
                                                        <input
                                                            type="checkbox"
                                                            className="checkbox-base"
                                                            checked={newFilter.admin_only || false}
                                                            onChange={(e) => handleNewFilterChange('admin_only', e.target.checked)}
                                                        />
                                                    </label>
                                                </div>
                                                <div className="checkbox-container">
                                                    <label className="form-label" htmlFor="new-filter-header-display">Display Location</label>
                                                    <select
                                                        id="new-filter-header-display"
                                                        value={newFilter.header_display}
                                                        onChange={(e) => handleNewFilterChange('header_display', parseInt(e.target.value, 10))}
                                                        className="form-input-base dropdown-base"
                                                    >
                                                        <option value={0}>Disabled</option>
                                                        <option value={1}>Top Bar</option>
                                                        <option value={2}>Second Bar</option>
                                                        <option value={3}>Auxiliary Bar</option>
                                                    </select>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="section-row">
                                            {['main', 'second', 'third'].map(stage => (
                                                <FilterStageEditor
                                                    key={`new-${stage}`}
                                                    stage={stage}
                                                    filter={newFilter}
                                                    // For the new filter form, we adapt the handlers
                                                    handleInputChange={(id, field, value) => handleNewFilterChange(field, value)}
                                                    isAdmin={true} // Form is only visible to admins
                                                    baseStageOptions={baseStageOptions}
                                                    thirdStageOptions={thirdStageOptions}                                            
                                                    themeColors={themeColors}
                                            onIconPickerOpen={openIconPicker}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                
                                
                                <div className="section-footer">
                                    <button type="submit" className="btn-base btn-primary" disabled={isSaving}>
                                        {isSaving ? 'Adding...' : 'Add Filter'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}
                </>
            )}
            
            <ConfirmationDialog
                isOpen={showConfirmDialog}
                onClose={() => {
                    setShowConfirmDialog(false);
                    setFilterToDelete('');
                }}
                onConfirm={handleDeleteFilter}
                title="Delete Filter"
                message="Are you sure you want to delete this filter? This action cannot be undone."
                confirmText="Delete"
                cancelText="Keep"
                confirmButtonColor="#dc2626"
            />

        </>
    );
};

export default FilterManager;
