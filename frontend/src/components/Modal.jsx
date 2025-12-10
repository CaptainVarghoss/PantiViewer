import React, { useState, useEffect, useRef, useCallback } from 'react';
import { IoChevronBack, IoChevronForward, IoClose, IoExpand, IoContract } from 'react-icons/io5';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import TagCluster from './TagCluster';
import { useGlobalHotkeys } from '../hooks/useGlobalHotkeys';
import { useHotkeyContext } from '../context/HotkeyContext';
import { useImageFeed } from '../hooks/useImageActions';
import Settings from './Settings'; // Import the new unified Settings component

/**
 * A unified modal component for displaying either an image with details or application settings.
 * The behavior and content are determined by the `modalType` prop.
 *
 * @param {object} props - Component props.
 * @param {boolean} props.isOpen - Controls the visibility of the modal.
 * @param {function} props.onClose - Callback function to close the modal.
 * @param {string} props.modalType - Type of modal to display ('image' or 'settings').
 * @param {object} [props.modalProps] - Props specific to the modal type.
 *    For 'image': { currentImage, images, onNavigate, searchTerm, setSearchTerm }
 * @param {object} [props.modalProps.currentImage] - The initial image to display.
 */
function Modal({ isOpen, onClose, modalType, modalProps = {}, filters, refetchFilters, isFullscreen, toggleFullScreen }) {
    const { token, isAuthenticated, settings, isAdmin, logout } = useAuth();
    const { pushContext, popContext } = useHotkeyContext();
    const modalContentRef = useRef(null);
    const imageSectionRef = useRef(null); // Ref for the image section

    // --- Image Modal State & Navigation Logic ---
    const { images, hasMore, fetchMoreImages } = useImageFeed();
    const [currentImage, setCurrentImage] = useState(modalProps.currentImage);
    const [navigationDirection, setNavigationDirection] = useState(0);
    const currentIndex = (modalType === 'image' && currentImage && images) ? images.findIndex(img => img.id === currentImage.id) : -1;
    const canGoPrev = currentIndex > 0;    
    const canGoNext = (currentIndex !== -1 && currentIndex < images.length - 1) || (currentIndex === images.length - 1 && hasMore);

    const getAnimationBounds = () => {
        // On exit, we need the bounds of the CURRENT image in the grid, not the original one.
        if (currentImage) {
            const gridCard = document.querySelector(`[data-image-id="${currentImage.id}"]`);
            if (gridCard) {
                return gridCard.getBoundingClientRect();
            }
        }
        // Fallback to the originally clicked element's bounds if the current one isn't found.
        // This can happen if the image has been filtered out of the grid in the background.
        return modalProps.originBounds;
    };

    // --- Settings Modal State and Logic ---
    const [openSections, setOpenSections] = useState({});

    const handleAccordionClick = (sectionName) => {
        setOpenSections(prev => ({ ...prev, [sectionName]: !prev[sectionName] }));
    };

    const handleLogout = () => {
        logout();
        onClose();
    };

    // --- Image Modal State and Logic ---
    const { searchTerm, setSearchTerm } = modalProps;
    const [blobImageUrl, setBlobImageUrl] = useState(null);
    const [isFetchingOriginal, setIsFetchingOriginal] = useState(false);
    const [originalImageError, setOriginalImageError] = useState(null);
    const [touchStartX, setTouchStartX] = useState(0);
    const [touchStartY, setTouchStartY] = useState(0);
    const [imageTranslateX, setImageTranslateX] = useState(0);
    const [swipeDirection, setSwipeDirection] = useState(null); // 'horizontal', 'vertical', or null
    const modalVariants = {
        hidden: {
            // Use a function to get the latest bounds on exit
            scale: 0,
            opacity: 0,
            x: getAnimationBounds() ? getAnimationBounds().x + getAnimationBounds().width / 2 - window.innerWidth / 2 : 0,
            y: getAnimationBounds() ? getAnimationBounds().y + getAnimationBounds().height / 2 - window.innerHeight / 2 : 0,
            transition: {
                type: "spring",
                stiffness: 200,
                damping: 30,
            },
        },
        visible: {
            scale: 1,
            opacity: 1,
            x: 0,
            y: 0,
            transition: {
                type: "spring",
                stiffness: 200,
                damping: 30,
            },
        },
    };

    const imageSlideVariants = {
        enter: (direction) => ({
            x: direction > 0 ? '100%' : '-100%', // Enter from right for next, left for prev
            opacity: 0,
        }),
        center: {
            zIndex: 1,
            x: 0,
            opacity: 1,
            transition: {
                x: { type: "spring", stiffness: 300, damping: 35 },
                opacity: { duration: 0.4 }
            },
        },
        exit: (direction) => ({
            zIndex: 0,
            x: direction < 0 ? '100%' : '-100%', // Exit to right for prev, left for next
            opacity: 0,
            transition: {
                x: { type: "spring", stiffness: 300, damping: 35 },
                opacity: { duration: 0.4 }
            },
        }),
    };

    const videoSlideVariants = {
        ...imageSlideVariants, // Videos can use the same logic
    };

    // State to manage which tag picker is open
    const usePreview = settings?.enable_previews === true;
    const SWIPE_THRESHOLD = 85;
    const TAP_THRESHOLD = 10;

    useEffect(() => {
        if (modalType !== 'image') return;

        if (!isOpen || !currentImage || usePreview || !isAuthenticated) return;

        const fetchOriginalImage = async () => {
            setIsFetchingOriginal(true);
            setOriginalImageError(null);
            const { content_hash: CHECKSUM, filename: FILENAME } = currentImage;

            if (!CHECKSUM || !FILENAME) {
                setOriginalImageError("Image data missing (checksum or filename).");
                setIsFetchingOriginal(false);
                return;
            }

            try {
                const response = await fetch(`/api/images/original/${CHECKSUM}`, {
                    headers: { 'Authorization': `Bearer ${token}` },
                });
                if (!response.ok) throw new Error(`Failed to load original image: ${response.statusText}`);
                const blob = await response.blob();
                const url = URL.createObjectURL(blob);
                setBlobImageUrl(url);
            } catch (error) {
                console.error('Error fetching original image:', error);
                setOriginalImageError(error.message);
                setBlobImageUrl(null);
            } finally {
                setIsFetchingOriginal(false);
            }
        };

        fetchOriginalImage();

        // Cleanup function: This will be called when the component unmounts
        // or when the dependencies of the effect change.
        return () => {
            if (blobImageUrl) {
                URL.revokeObjectURL(blobImageUrl);
            }
        };
    }, [isOpen, currentImage, usePreview, isAuthenticated, token, modalType]); // blobImageUrl is intentionally omitted

    // Set the active hotkey context when the modal opens or closes
    useEffect(() => {
        if (isOpen) {
            pushContext('modal');
            // Return a cleanup function that will be called when the modal closes (or component unmounts)
            return () => {
                popContext();
            };
        }
    }, [isOpen, pushContext, popContext]);

    const canModifyTags = isAdmin || (settings?.allow_tag_add === true);

    let imageUrlToDisplay;
    if (modalType === 'image') {
        const PREVIEWS_DIR = currentImage?.previews_path;
        const previewUrl = `${PREVIEWS_DIR}/${currentImage?.checksum}_preview.webp`;
        imageUrlToDisplay = usePreview ? previewUrl : blobImageUrl;
    }

    const navigateImage = useCallback(async (direction) => {
        if (!images || images.length === 0) return;
        const newIndex = currentIndex + direction;

        setNavigationDirection(direction);

        if (newIndex >= 0 && newIndex < images.length) {
            const newImage = images[newIndex];
            setCurrentImage(newImage);
            // If an onNavigate callback is provided, call it with the new image's ID.
            modalProps.onNavigate?.(newImage.id);
        } else if (direction > 0 && newIndex >= images.length && hasMore && fetchMoreImages) {
            await fetchMoreImages();
            // The `images` array from the hook will update, and we can try to navigate again.
            if (images[newIndex]) {
                const newImage = images[newIndex];
                setCurrentImage(newImage);
                modalProps.onNavigate?.(newImage.id);
            }
        }
    }, [currentIndex, images, hasMore, fetchMoreImages, modalProps.onNavigate]);


    const handleNext = useCallback(() => navigateImage(1), [navigateImage]); // direction: 1 for next
    const handlePrev = useCallback(() => navigateImage(-1), [navigateImage]); // direction: -1 for prev

    // Use the global hotkeys hook for modal-specific actions
    useGlobalHotkeys({
        isModalOpen: isOpen && modalType === 'image',
        modalType: modalType,
        closeModal: onClose,
        canGoPrev: canGoPrev,
        canGoNext: canGoNext,
        handlePrev: handlePrev,
        handleNext: handleNext,
        toggleFullScreen: toggleFullScreen,
        // The modal takes priority, so grid-specific handlers are not needed here.
        // The hook's internal logic will correctly prioritize the modal.
    });


    const handleTouchStart = useCallback((e) => {
        setTouchStartX(e.touches[0].clientX);
        setTouchStartY(e.touches[0].clientY);
        setSwipeDirection(null); // Reset swipe direction
    }, []);

    const handleTouchMove = useCallback((e) => {
        if (touchStartX === 0 || touchStartY === 0) return;

        const diffX = e.touches[0].clientX - touchStartX;
        const diffY = e.touches[0].clientY - touchStartY;

        let currentSwipeDirection = swipeDirection;

        if (!currentSwipeDirection) {
            // Determine direction after a small threshold to avoid ambiguity
            if (Math.abs(diffX) > 10 || Math.abs(diffY) > 10) {
                if (Math.abs(diffX) > Math.abs(diffY)) {
                    currentSwipeDirection = 'horizontal';
                } else {
                    currentSwipeDirection = 'vertical';
                }
                setSwipeDirection(currentSwipeDirection);
            }
        }

        if (currentSwipeDirection === 'horizontal') {
            e.preventDefault(); // Prevent vertical scroll only when swiping horizontally
            setImageTranslateX(Math.max(-window.innerWidth / 1.5, Math.min(window.innerWidth / 1.5, diffX)));
        }
    }, [touchStartX, touchStartY, swipeDirection]);

    const handleTouchEnd = useCallback((e) => {
        const diffX = e.changedTouches[0].clientX - touchStartX;
        const diffY = e.changedTouches[0].clientY - touchStartY;
        setImageTranslateX(0);

        if (swipeDirection === 'horizontal' && Math.abs(diffX) > SWIPE_THRESHOLD) {
            if (diffX > 0 && canGoPrev) handlePrev();
            else if (diffX < 0 && canGoNext) handleNext();
        } else if (Math.abs(diffX) <= TAP_THRESHOLD && Math.abs(diffY) <= TAP_THRESHOLD) {
            e.preventDefault();
            e.stopPropagation();
            onClose();
        }
        setTouchStartX(0);
        setTouchStartY(0);
        setSwipeDirection(null);
    }, [touchStartX, touchStartY, canGoPrev, canGoNext, handlePrev, handleNext, onClose, swipeDirection]);

    // Effect to add and remove the non-passive touchmove listener
    useEffect(() => {
        const imageSection = imageSectionRef.current;
        if (isOpen && modalType === 'image' && imageSection) {
            // Add the event listener with passive: false to be able to preventDefault on iOS
            imageSection.addEventListener('touchmove', handleTouchMove, { passive: false });

            // Cleanup function to remove the event listener
            return () => {
                imageSection.removeEventListener('touchmove', handleTouchMove, { passive: false });
            };
        }
    }, [isOpen, modalType, handleTouchMove]);


    const renderAiParameters = (paramsString) => {
        try {
            let paramsObject = JSON.parse(paramsString);
            let finalParams = {};

            // Check for SwarmUI specific nested structure and flatten it
            if (paramsObject.sui_image_params || paramsObject.sui_extra_data) {
                if (paramsObject.sui_image_params && typeof paramsObject.sui_image_params === 'object') {
                    finalParams = { ...finalParams, ...paramsObject.sui_image_params };
                }
                if (paramsObject.sui_extra_data && typeof paramsObject.sui_extra_data === 'object') {
                    finalParams = { ...finalParams, ...paramsObject.sui_extra_data };
                }
            } else {
                finalParams = paramsObject;
            }

            return (
                <>
                    {Object.entries(finalParams).map(([key, value]) => (
                        <li key={key}><strong className="modal-info-label">{key.replace(/_/g, ' ')}:</strong> {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}</li>
                    ))}
                </>
            );
        } catch (e) {
            // If not JSON, treat as a custom string format
            const lines = paramsString.split('\n').filter(line => line.trim() !== '');
            const firstLineIsPrompt = !lines[0].includes(':') && lines.length > 1;
            const prompt = firstLineIsPrompt ? lines.shift() : null;
            return (
                <ul className="modal-info-list">
                    {prompt && <li><strong className="modal-info-label">Prompt:</strong> {prompt}</li>}
                    {lines.map((line, index) => {
                        const parts = line.split(':');
                        const key = parts[0];
                        const value = parts.slice(1).join(':').trim();
                        return <li key={index}><strong className="modal-info-label">{key}:</strong> {value}</li>;
                    })}
                </ul>
            );
        }
    };

    const renderMetadata = (meta) => {
        if (!meta) return <p className="modal-text-gray">No metadata available.</p>;
        try {
            const metaObject = typeof meta === 'string' ? JSON.parse(meta) : meta;
            return (
                <>
                    {Object.entries(metaObject).map(([key, value]) => {
                        if (key === 'parameters' && typeof value === 'string') {
                            return renderAiParameters(value);
                        }
                        return <li key={key}><strong className="modal-info-label">{key.replace(/_/g, ' ')}:</strong> {typeof value === 'object' ? JSON.stringify(value) : String(value)}</li>;
                    })}
                </>
            );
        } catch (e) {
            return <p className="modal-error-text">Failed to parse metadata.</p>;
        }
    };

    // --- Render Logic ---
    const renderImageModalContent = () => (
        <>
            {/* Navigation Buttons */}
            {canGoPrev && (
                <button onClick={(e) => { e.stopPropagation(); handlePrev(); }} className="modal-nav-button modal-nav-button--prev" title="Previous Image">
                    <IoChevronBack size={32} />
                </button>
            )}
            {canGoNext && (
                <button onClick={(e) => { e.stopPropagation(); handleNext(); }} className="modal-nav-button modal-nav-button--next" title="Next Image">
                    <IoChevronForward size={32} />
                </button>
            )}
            <div ref={modalContentRef} className="modal-content" id="image" onClick={(e) => e.stopPropagation()}>
                <div className="modal-body">
                    <div ref={imageSectionRef} className="modal-image-section" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} style={{ position: 'relative' }}>
                        <AnimatePresence initial={false} custom={navigationDirection}>
                            {currentImage.is_video ? (
                                <motion.video
                                    key={currentImage.id}
                                    controls
                                    src={imageUrlToDisplay}
                                    alt={currentImage.filename}
                                    className="modal-main-image"
                                    custom={navigationDirection}
                                    variants={videoSlideVariants}
                                    initial="enter"
                                    animate="center"
                                    exit="exit"
                                    style={{ transform: `translateX(${imageTranslateX}px)`, position: 'absolute' }}
                                />
                            ) : (
                                <motion.img
                                    key={currentImage.id}
                                    src={imageUrlToDisplay}
                                    alt={currentImage.filename}
                                    className="modal-main-image"
                                    onClick={onClose}
                                    custom={navigationDirection}
                                    variants={imageSlideVariants}
                                    initial="enter"
                                    animate="center"
                                    exit="exit"
                                    style={{ transform: `translateX(${imageTranslateX}px)`, position: 'absolute' }}
                                    onError={(e) => { e.target.src = "https://placehold.co/1200x800/333333/FFFFFF?text=Image+Not+Found"; }}
                                />
                            )}
                        </AnimatePresence>
                    </div>
                    <section>
                        <div className="section-container">
                            <div className="section-row">
                                <div className="section-fields" style={{width: '100%'}}>
                                    <div className="form-group modal-tags">
                                        Tags
                                        <TagCluster.Popup type="image_tags" itemId={currentImage.id} isEmbedded={true} />
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="section-container">
                            <h3 className="section-header">Metadata</h3>
                            <ul className="section-list modal-info-list">
                                <li key="id"><strong className="modal-info-label">ID:</strong> {currentImage.id}</li>
                                <li key="path"><strong className="modal-info-label">Path:</strong> {currentImage.path}</li>
                                <li key="filename"><strong className="modal-info-label">Filename:</strong> {currentImage.filename}</li>
                                <li key="checksum"><strong className="modal-info-label">Checksum:</strong> {currentImage.content_hash}</li>
                                <li key="is_video"><strong className="modal-info-label">Is Video:</strong> {currentImage.is_video ? 'Yes' : 'No'}</li>
                                <li key="date_created"><strong className="modal-info-label">Date Created:</strong> {new Date(currentImage.date_created).toLocaleString()}</li>
                                <li key="date_modified"><strong className="modal-info-label">Date Modified:</strong> {new Date(currentImage.date_modified).toLocaleString()}</li>
                                <li key="width"><strong className="modal-info-label">Width:</strong> {currentImage.width}</li>
                                <li key="height"><strong className="modal-info-label">Height:</strong> {currentImage.height}</li>
                            </ul>
                            <ul className="section-list modal-info-list">{renderMetadata(currentImage.exif_data)}</ul>
                        </div>
                    </section>
                </div>
            </div>
        </>
    );

    const renderSettingsModalContent = () => (
        <div ref={modalContentRef} className="modal-content" id="settings" onClick={(e) => e.stopPropagation()}>
            <Settings filters={filters} refetchFilters={refetchFilters} onLogout={handleLogout} />
        </div>
    );

    const renderGenericModalContent = () => {
        const { ContentComponent, ...restProps } = modalProps;
        if (!ContentComponent) return null;

        // Pass down relevant props to the content component
        const contentProps = {
            ...restProps,
            onClose: onClose, // Provide the onClose handler to the inner component
        };

        return (
            <div ref={modalContentRef} className="modal-content" onClick={(e) => e.stopPropagation()}><ContentComponent {...contentProps} /></div>
        );
    };

    return (
        <motion.div
            key={`modal-${modalType}`}
            className="modal-overlay"
            onClick={onClose}
            variants={modalVariants}
            initial="hidden"
            animate="visible" exit="hidden">
            <div className="modal-controls">
                {modalType === 'image' && (
                    <button onClick={(e) => { e.stopPropagation(); toggleFullScreen(); }} className="btn-base btn-primary modal-fullscreen-button" title="Toggle Fullscreen (f)">
                        {isFullscreen ? <IoContract size={24} /> : <IoExpand size={24} />}
                    </button>
                )}
                <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="btn-base btn-primary modal-close-button" title="Close">
                    <IoClose size={24} />
                </button>
            </div>
            {modalType === 'image' && currentImage && renderImageModalContent()}
            {modalType === 'settings' && renderSettingsModalContent()}
            {modalProps.ContentComponent && renderGenericModalContent()}
        </motion.div>
    );
}

export default Modal;