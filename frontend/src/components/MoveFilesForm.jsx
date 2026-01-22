import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext'; // Import useAuth to get the token
import { moveImagesApi } from '../api/imageService';
import { fetchFoldersAsTreeApi } from '../api/folderService';
import FolderTree from './FolderTree'; // Import the FolderTree component

const MoveFilesForm = ({ filesToMove, selectedImages, imageIds, onMoveSuccess, onClose }) => {
    const [folders, setFolders] = useState([]);
    const [selectedFolder, setSelectedFolder] = useState(null);
    const safeFilesToMove = Array.from(filesToMove || selectedImages || imageIds || []);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const { token } = useAuth(); // Get token from auth context

    useEffect(() => {
        // Fetch available folders when the component mounts
        const fetchFolders = async () => {
            try {
                const responseData = await fetchFoldersAsTreeApi(token);
                setFolders(responseData.folders);
            } catch (err) {
                setError('Failed to load folders.');
                console.error(err);
            }
        };

        fetchFolders();
    }, [token]); // Add token as a dependency

    const handleMoveConfirm = async () => {
        if (!selectedFolder) {
            setError('Please select a destination folder.');
            return;
        }
        if (safeFilesToMove.length === 0) {
            setError('No files selected to move.');
            return;
        }

        setIsLoading(true);
        setError('');

        try {
            await moveImagesApi({
                imageIds: safeFilesToMove,
                destinationPath: selectedFolder,
                token,
            });

            if (onMoveSuccess) onMoveSuccess();
            if (onClose) onClose();
        } catch (err) {
            setError(err.message || 'An error occurred during the move.');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <section>
            <div className="section-container">
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--accent-primary)' }}>
                    Move Selected Files
                </h3>
                <p style={{ marginBottom: '1.5rem', color: 'var(--text-muted)', fontSize: '1rem' }}>
                    Select a destination folder to move the {safeFilesToMove.length} selected item(s).
                </p>

                <div className="folder-list-container">
                {folders.length > 0 ? (
                    <FolderTree
                        nodes={folders}
                        onSelectFolder={(path) => setSelectedFolder(path)}
                        selectedFolderPath={selectedFolder}
                    />
                ) : (
                    <p>No destination folders available.</p>
                )}
                </div>

                {error && <p style={{ color: 'var(--accent-red)', marginBottom: '1rem' }}>{error}</p>}

                <div className="section-footer" style={{justifyContent: 'space-between'}}>
                    <button className="btn-base btn-orange" onClick={onClose} disabled={isLoading}>Cancel</button>
                    <button className="btn-base btn-green" onClick={handleMoveConfirm} disabled={isLoading || !selectedFolder}>{isLoading ? 'Moving...' : 'Move'}</button>
                </div>
            </div>
        </section>
    );
};

export default MoveFilesForm;