import React from 'react';
import * as MdIcons from 'react-icons/md';
import { useAuth } from '../context/AuthContext';

function FooterBar({ onScrollToTop }) {
    const { settings, saveLocalSetting } = useAuth();

    const thumbSize = settings.thumb_size ? parseInt(settings.thumb_size, 10) : null;
    const maxThumbSize = settings.max_thumb_size ? parseInt(settings.max_thumb_size, 10) : null;

    const handleSizeChange = (e) => {
        saveLocalSetting('thumb_size', e.target.value);
    };
    
    return (
        <div className='footer-bar-container'>
            <div className='footer-version'>Panti Viewer v.0.0.1b</div>
            <div className='footer-slider'>
                <MdIcons.MdPhotoSizeSelectSmall title="Smaller thumbnails" />
                <input
                    type="range"
                    min="100"
                    max={maxThumbSize}
                    step="10"
                    value={thumbSize}
                    onChange={handleSizeChange}
                    className="thumbnail-size-slider"
                />
                {thumbSize}
                <MdIcons.MdPhotoSizeSelectLarge title="Larger thumbnails" />
            </div>
            <div className='footer-totop' onClick={onScrollToTop} style={{ cursor: 'pointer' }}><MdIcons.MdArrowUpward /> Scroll to top</div>
        </div>
    )
}

export default FooterBar;