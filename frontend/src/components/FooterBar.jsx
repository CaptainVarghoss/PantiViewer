import React from 'react';
import * as MdIcons from 'react-icons/md';

function FooterBar({ onScrollToTop }) {


    return (
        <div className='footer-bar-container'>
            <div className='footer-version'>Panti Viewer v. 0.0.1b</div>
            <div className='footer-buttons'>Something?</div>
            <div className='footer-slider'>Slider goes here</div>
            <div className='footer-totop' onClick={onScrollToTop} style={{ cursor: 'pointer' }}><MdIcons.MdArrowUpward /> Scroll to top</div>
        </div>
    )
}

export default FooterBar;