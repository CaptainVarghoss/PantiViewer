import React, { useState, useCallback, useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';

import { useAuth } from '../context/AuthContext';
import { useGlobalHotkeys } from '../hooks/useGlobalHotkeys';
import { useWebSocket } from '../hooks/useWebSocket';

import Navbar from './Navbar';
import ImageGrid from "./ImageGrid";
import FolderTree from './FolderTree';
import Modal from './Modal';
import MoveFilesForm from './MoveFilesForm';
import TrashView from './TrashView';

export function AppContent({
  currentView,
  setCurrentView,
}) {
  const { token, isAdmin } = useAuth();

  const [webSocketMessage, setWebSocketMessage] = useState([]);
  const [trashCount, setTrashCount] = useState(0);
  const [selectedImages, setSelectedImages] = useState(new Set());
  const [isSelectMode, setIsSelectMode] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState(null);
  const [modalProps, setModalProps] = useState({});
  const [isClosingModal, setIsClosingModal] = useState(false);

  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);

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
    }
    setCurrentView(view);
  };

  const handleWebSocketMessage = useCallback((message) => {
    console.log("File change detected:", message);
    // Use the functional update form to prevent race conditions.
    // This ensures that we're always appending to the most recent state,
    // even if multiple messages arrive before a re-render.
    setWebSocketMessage(prevMessages => [...prevMessages, message]);
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

  // ... (handleMoveSelected, handleMoveSingleImage, handleTrashBulkAction would also move here)

  return (
    <>
      <header>
        <Navbar
          isConnected={isConnected}
          isSelectMode={isSelectMode}
          setIsSelectMode={setIsSelectMode}
          currentView={currentView}
          setCurrentView={handleSetCurrentView}
          selectedImages={selectedImages}
          setSelectedImages={setSelectedImages}
          trashCount={trashCount}
          setTrashCount={setTrashCount}
          openModal={openModal}
        />
        <ConnectionStatus />
      </header>
      <main>
        {currentView === 'grid' && (
          <ImageGrid
            webSocketMessage={webSocketMessage}
            setWebSocketMessage={setWebSocketMessage}
            isSelectMode={isSelectMode}
            setIsSelectMode={setIsSelectMode}
            selectedImages={selectedImages}
            setSelectedImages={setSelectedImages}
            openModal={openModal}
          />
        )}
        {currentView === 'trash' && (
          <TrashView
            webSocketMessage={webSocketMessage}
            setWebSocketMessage={setWebSocketMessage}
            setTrashCount={setTrashCount}
            setCurrentView={handleSetCurrentView}
            isSelectMode={isSelectMode}
            setIsSelectMode={setIsSelectMode}
            selectedImages={selectedImages}
            setSelectedImages={setSelectedImages}
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
                webSocketMessage={webSocketMessage}
                setWebSocketMessage={setWebSocketMessage}
                isSelectMode={isSelectMode}
                setIsSelectMode={setIsSelectMode}
                selectedImages={selectedImages}
                setSelectedImages={setSelectedImages}
                openModal={openModal}
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
    </>
  );
}