import React, { useState, useEffect, useRef, useMemo } from 'react';
import TagCluster from './TagCluster';

// Reusable Context Menu Component
const ContextMenu = ({ 
  x, 
  y, 
  isOpen, 
  onClose, 
  thumbnailData, 
  customItems, 
  images, 
  selectedImageIds, 
  isSelectMode, 
  trash_only, 
  actions 
}) => {
  const menuRef = useRef(null);
  const [showTagCluster, setShowTagCluster] = useState(false);
  const prevIsOpenRef = useRef(isOpen);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        onClose();
      }
    };
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    // If the image associated with the context menu is removed from the view, close the menu.
    if (thumbnailData && images && !images.find(img => img.id === thumbnailData.id)) {
      onClose();
    }

    // Reset the tag cluster view only when the menu is newly opened, not on every re-render.
    if (isOpen && !prevIsOpenRef.current) {
      setShowTagCluster(false);
    }
    prevIsOpenRef.current = isOpen;

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose, thumbnailData, images]);

  const itemsToRender = useMemo(() => {
    const count = selectedImageIds ? selectedImageIds.size : 0;

    if (isSelectMode) {
      if (trash_only) {
        return [
          { label: `Restore ${count} Selected`, action: "restore_selected" },
          { label: `Edit Tags for ${count} Selected`, action: "edit_tags_selected" },
          { label: `Delete ${count} Permanently`, action: "delete_permanent_selected" },
        ];
      } else {
        const items = [
          { label: `Move ${count} Selected`, action: "move_selected" },
          { label: `Delete ${count} Selected`, action: "delete_selected" },
        ];
        if (count > 0) items.unshift({ label: `Edit Tags for ${count} Selected`, action: "edit_tags_selected" });
        return items;
      }
    } else if (customItems) {
      return [{ label: "Select", action: "select" }, ...customItems];
    } else {
      return [
        { label: "Select", action: "select" },
        { label: "Edit Tags", action: "add_tag" },
        { label: "Move", action: "move" },
        { label: "Delete", action: "delete" },
      ];
    }
  }, [isSelectMode, trash_only, selectedImageIds, customItems]);

  if (!isOpen) return null;

  const handleItemClick = (item) => {
    const action = item.action;
    const data = thumbnailData || item;

    if (action === 'add_tag' || action === 'edit_tags_selected') {
      setShowTagCluster(prev => !prev); // Toggle tag cluster visibility
    } else {
      if (actions) {
        const { imageActions, setIsSelectMode, setSelectedImages, openModal } = actions;
        switch (action) {
          case 'select':
            setIsSelectMode(true);
            setSelectedImages(new Set([data.id]));
            break;
          case 'delete':
            imageActions.markImageAsDeleted(data.id);
            break;
          case 'restore':
            imageActions.restoreImage(data.id);
            break;
          case 'delete_permanent':
            imageActions.deleteImagePermanently(data.id);
            break;
          case 'delete_selected':
            imageActions.deleteSelectedImages();
            break;
          case 'move':
            if (openModal) openModal('moveFiles', { filesToMove: new Set([data.id]) });
            break;
          case 'move_selected':
            if (openModal) openModal('moveFiles', { filesToMove: selectedImageIds });
            break;
          case 'restore_selected':
            imageActions.restoreSelectedImages();
            break;
          case 'delete_permanent_selected':
            imageActions.deleteSelectedPermanently();
            break;
          default:
            console.warn(`Unhandled action: ${action}`);
            break;
        }
      }
      onClose();
    }
  };

  return (
    <>
    <div
      className="context-menu"
      ref={menuRef}
      style={{ top: y, left: x }}
    >
      {showTagCluster ? (
        itemsToRender.find(item => item.action === 'edit_tags_selected') ? (
          <TagCluster.Popup
            type="image_tags_bulk"
            itemIds={selectedImageIds}
            onClose={() => {
              setShowTagCluster(false);
              onClose();
              if (actions && actions.setSelectedImages && actions.setIsSelectMode) {
                actions.setSelectedImages(new Set());
                actions.setIsSelectMode(false);
              }
            }}
          />
        ) : (
          <TagCluster.Popup
            type="image_tags"
            itemId={thumbnailData.id}
            onClose={() => {
              setShowTagCluster(false);
              onClose();
            }}
          />
        )
      ) : (
        <ul className="context-menu-list">
          {itemsToRender.map((item) => (
            <li
              key={item.action}
              className="context-menu-item"
              onClick={() => handleItemClick(item)}
            >
              {item.label}
            </li>
          ))}
        </ul>
      )}
    </div>
    </>
  );
};

export default ContextMenu;
