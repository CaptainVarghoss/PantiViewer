import React from 'react';
import * as MdIcons from 'react-icons/md';

function FooterBar({ onScrollToTop, thumbnailSize, setThumbnailSize, maxThumbnailSize = 500 }) {


    return (
        <div className='footer-bar-container'>
            <div className='footer-version'>Panti Viewer v. 0.0.1b</div>
            <div className='footer-buttons'>Something?</div>
            <div className='footer-slider'>
                <MdIcons.MdPhotoSizeSelectSmall title="Smaller thumbnails" />
                <input
                    type="range"
                    min="100"
                    max={maxThumbnailSize}
                    step="10"
                    value={thumbnailSize}
                    onChange={(e) => setThumbnailSize(Number(e.target.value))}
                    className="thumbnail-size-slider"
                />
                {thumbnailSize}
                <MdIcons.MdPhotoSizeSelectLarge title="Larger thumbnails" />
            </div>
            <div className='footer-totop' onClick={onScrollToTop} style={{ cursor: 'pointer' }}><MdIcons.MdArrowUpward /> Scroll to top</div>
        </div>
    )
}

export default FooterBar;