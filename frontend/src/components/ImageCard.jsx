import React, { forwardRef } from 'react';

/**
 * Renders a single image card with its thumbnail and filename.
 *
 * @param {object} props - The component props.
 * @param {object} props.image - The image object containing details like id, filename, and meta.
 */
const ImageCard = forwardRef(({ image, onClick, onContextMenu, isSelected, isFocused, refreshKey }, ref) => {
  
  return (
    <div
      ref={ref}
      key={image.id}
      className={`btn-base btn-primary image-card ${isSelected ? 'selected' : ''} ${isFocused ? 'focused' : ''}`}
      onClick={(e) => onClick(e, image)}
      data-image-id={image.id} // Add data attribute for easy selection
      style={{ transition: 'transform 0.3s ease-in-out, opacity 0.3s ease-in-out' }}
    >
      <div className="image-card-inner">
        <img
          src={image.thumbnail_url || ''}
          alt={image.filename}
          className={`thumbnail ${image.thumbnail_missing ? 'missing' : ''}`}
          onContextMenu={(e) => {
            onContextMenu(e, image);
          }}
        />
      </div>
    </div>
  );
});

export default ImageCard;
