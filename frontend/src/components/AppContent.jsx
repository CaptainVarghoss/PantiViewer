import React, { useState, useCallback, useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Toaster, toast } from 'sonner';

import { useAuth } from '../context/AuthContext';
import { useGlobalHotkeys } from '../hooks/useGlobalHotkeys';
import { useWebSocket } from '../hooks/useWebSocket';

import Navbar from './Navbar';
import FooterBar from './FooterBar';
import ImageGrid from "./ImageGrid";
import FolderTree from './FolderTree';
import Modal from './Modal';
import MoveFilesForm from './MoveFilesForm';
import TrashView from './TrashView';

export function AppContent({
  currentView,
  setCurrentView,
}) {
  const { token, isAdmin, settings } = useAuth();

  const [webSocketMessage, setWebSocketMessage] = useState([]);
  const [selectedImages, setSelectedImages] = useState(new Set());
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [currentImages, setCurrentImages] = useState([]);
  const [thumbnailSize, setThumbnailSize] = useState(() => {
    const saved = localStorage.getItem('panti_thumbnail_size');
    return saved ? parseInt(saved, 10) : 200;
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState(null);
  const [modalProps, setModalProps] = useState({});
  const [isClosingModal, setIsClosingModal] = useState(false);

  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);
  const gridRef = useRef(null);
  const outerGridRef = useRef(null);

  const handleSetThumbnailSize = (size) => {
    setThumbnailSize(size);
    localStorage.setItem('panti_thumbnail_size', size);
  };

  const handleScrollToTop = () => {
    outerGridRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleFullScreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        alert(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    const isPwaEnabled = settings?.enable_pwa === true || settings?.enable_pwa === 'True';
    if (isPwaEnabled) {
      const link = document.createElement('link');
      link.rel = 'manifest';
      link.href = '/manifest.json';
      document.head.appendChild(link);

      return () => {
        if (document.head.contains(link)) {
          document.head.removeChild(link);
        }
      };
    }
  }, [settings?.enable_pwa]);

  const openModal = (type, newProps) => {
    setModalType(type);
    if (type === 'moveFiles') {
      setModalProps({ ...newProps, ContentComponent: MoveFilesForm });
    } else {
      setModalProps(newProps);
    }
    setIsModalOpen(true);
  };

  useEffect(() => {
    if (isClosingModal) {
      setIsModalOpen(false);
      setIsClosingModal(false);
    }
  }, [isClosingModal]);

  const closeModal = () => {
    if (modalType === 'image' && modalProps.currentImage) {
      const imageId = modalProps.currentImage.id;
      const cardElement = document.querySelector(`[data-image-id="${imageId}"]`);
      if (cardElement) {
        const newBounds = cardElement.getBoundingClientRect();
        setModalProps(currentProps => ({ ...currentProps, originBounds: newBounds }));
        setIsClosingModal(true);
      } else {
        setIsModalOpen(false);
      }
    } else {
      setIsModalOpen(false);
    }
  };

  const handleSetCurrentView = (view) => {
    if (currentView !== view) {
      setIsSelectMode(false);
      setSelectedImages(new Set());
      setCurrentImages([]);
    }
    setCurrentView(view);
  };

  const handleWebSocketMessage = useCallback((message) => {
    if (message.type === 'toast') {
        const { message: toastMessage, level, options } = message.payload;
        const toastFunc = toast[level] || toast;
        toastFunc(toastMessage, options);
        return;
    }
    console.log("File change detected:", message);
    setWebSocketMessage(prevMessages => {
      const currentMessages = Array.isArray(prevMessages) ? prevMessages : [];
      return [...currentMessages, message];
    });
  }, []);

  useGlobalHotkeys({
    isModalOpen,
    modalType,
    closeModal,
    toggleFullScreen,
    isGridActive: !isModalOpen,
  });

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const websocketUrl = `${protocol}//${window.location.hostname}:8000/ws/image-updates`;
  const { isConnected } = useWebSocket(websocketUrl, token, isAdmin, handleWebSocketMessage);

  const ConnectionStatus = () => (
    <div id="connection" style={{ borderColor: isConnected ? 'var(--accent-green)' : 'var(--accent-red)', backgroundColor: isConnected ? 'var(--accent-green)' : 'var(--accent-red)' }}></div>
  );

  return (
    <>
      <Toaster />
      <header>
        <Navbar
          isConnected={isConnected}
          isSelectMode={isSelectMode}
          setIsSelectMode={setIsSelectMode}
          currentView={currentView}
          setCurrentView={handleSetCurrentView}
          selectedImages={selectedImages}
          setSelectedImages={setSelectedImages}
          openModal={openModal}
          images={currentImages}
        />
        <ConnectionStatus />
      </header>
      <main>
        {currentView === 'grid' && (
          <ImageGrid
            gridRef={gridRef}
            outerGridRef={outerGridRef}
            webSocketMessage={webSocketMessage}
            setWebSocketMessage={setWebSocketMessage}
            isSelectMode={isSelectMode}
            setIsSelectMode={setIsSelectMode}
            selectedImages={selectedImages}
            setSelectedImages={setSelectedImages}
            openModal={openModal}
            onImagesLoaded={setCurrentImages}
            thumbnailSize={thumbnailSize}
          />
        )}
        {currentView === 'trash' && (
          <TrashView
            webSocketMessage={webSocketMessage}
            setWebSocketMessage={setWebSocketMessage}
            setCurrentView={handleSetCurrentView}
            isSelectMode={isSelectMode}
            setIsSelectMode={setIsSelectMode}
            selectedImages={selectedImages}
            setSelectedImages={setSelectedImages}
            openModal={openModal}
            onImagesLoaded={setCurrentImages}
          />
        )}
        {currentView === 'folders' && (
          <div className="folder-layout-container">
            <div className="folder-tree-panel">
              <FolderTree
                webSocketMessage={webSocketMessage}
                setWebSocketMessage={setWebSocketMessage}
              />
            </div>
            <div className="image-grid-panel">
              <ImageGrid
                gridRef={gridRef}
                outerGridRef={outerGridRef}
                webSocketMessage={webSocketMessage}
                setWebSocketMessage={setWebSocketMessage}
                isSelectMode={isSelectMode}
                setIsSelectMode={setIsSelectMode}
                selectedImages={selectedImages}
                setSelectedImages={setSelectedImages}
                openModal={openModal}
                onImagesLoaded={setCurrentImages}
                thumbnailSize={thumbnailSize}
              />
            </div>
          </div>
        )}
      </main>
      <AnimatePresence>
        {isModalOpen && (
          <Modal
            isOpen={isModalOpen}
            onClose={closeModal}
            modalType={modalType}
            modalProps={modalProps}
            isFullscreen={isFullscreen}
            toggleFullScreen={toggleFullScreen}
          />
        )}
      </AnimatePresence>
      <footer>
        <FooterBar
          onScrollToTop={handleScrollToTop}
          thumbnailSize={thumbnailSize}
          setThumbnailSize={handleSetThumbnailSize}
          maxThumbnailSize={settings?.thumb_size || 500}
        />
      </footer>
    </>
  );
}