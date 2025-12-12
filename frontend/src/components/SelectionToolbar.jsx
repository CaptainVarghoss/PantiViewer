import React from 'react';

/**
 * A toolbar that appears when in selection mode, providing bulk actions.
 *
 * @param {object} props - Component props.
 * @param {number} selectedCount - The number of currently selected items.
 * @param {function} onClearSelection - Callback to clear the current selection.
 * @param {function} onSelectAll - Callback to select all visible items.
 * @param {function} onExit - Callback to exit selection mode.
 * @param {Array<object>} customActions - An array of action objects for the toolbar.
 */
function SelectionToolbar({
  selectedCount,
  onClearSelection,
  onSelectAll,
  onExit,
  customActions = []
}) {
  return (
    <div className="selection-toolbar">
        
        
        <button onClick={onSelectAll} className="btn-base btn-primary toolbar-button">
          Select All
        </button>
        <button onClick={onClearSelection} className="btn-base btn-primary toolbar-button" disabled={selectedCount === 0}>
          Deselect All
        </button>
        <button onClick={onExit} className="btn-base btn-primary exit-selection-button" title="Exit Select Mode">
          Close
        </button>
        <span className="selection-count">{selectedCount} selected</span>
        {customActions.map((action, index) => (
            <button
                key={index}
                onClick={action.handler}
                className={`btn-base btn-primary toolbar-button ${action.danger ? 'toolbar-button-danger' : ''}`}
                disabled={selectedCount === 0}
            >
                {action.label}
            </button>
        ))}
      </div>
  );
}

export default SelectionToolbar;