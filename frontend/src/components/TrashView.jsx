import React, { useState } from 'react';
import ImageGrid from './ImageGrid';
import ConfirmationDialog from './ConfirmDialog';
import { useAuth } from '../context/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * A dedicated view for managing trashed (soft-deleted) images.
 * It displays a grid of deleted items and provides options to
 * restore them or empty the trash permanently.
 */
function TrashView({
    webSocketMessage,
    setWebSocketMessage,
    setCurrentView,
    isSelectMode,
    setIsSelectMode,
    selectedImages,
    setSelectedImages,
    openModal
}) {
    const { token, isAdmin } = useAuth();
    const queryClient = useQueryClient();
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);

    // Fetch trash count to determine if button should be disabled
    const { data: trashCount = 0 } = useQuery({
        queryKey: ['trashCount', token],
        queryFn: async () => {
            const response = await fetch('/api/trash/info', {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (!response.ok) return 0;
            const data = await response.json();
            return data.trash_count;
        },
        enabled: !!token
    });

    const handleEmptyTrash = async () => {
        console.log("Attempting to empty trash...");
        try {
            const response = await fetch('/api/trash/empty', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Failed to empty trash');
            }

            // Invalidate queries to refresh UI
            await queryClient.invalidateQueries({ queryKey: ['trashCount'] });
            await queryClient.invalidateQueries({ queryKey: ['images'] });

            setCurrentView('grid'); // Go back to the main grid
            alert('Trash has been emptied successfully.');

        } catch (error) {
            console.error("Error emptying trash:", error);
            alert(`Error: ${error.message}`);
        } finally {
            setShowConfirmDialog(false);
        }
    };

    const handleConfirmEmptyTrash = () => {
        setShowConfirmDialog(true);
    };

    return (
        <div className="trash-view-container" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div className="trash-view-header">
                <h1>Trash</h1>
                <p>Images here are marked for deletion. You can restore them or empty the trash to permanently delete them.</p>
                {isAdmin && (
                    <button 
                        className="btn-base empty-trash-button" 
                        onClick={handleConfirmEmptyTrash}
                        disabled={trashCount === 0}
                    >
                        Empty Trash
                    </button>
                )}
            </div>

            <div style={{ flex: 1, minHeight: 0 }}>
                <ImageGrid
                    webSocketMessage={webSocketMessage}
                    setWebSocketMessage={setWebSocketMessage}
                    isSelectMode={isSelectMode}
                    setIsSelectMode={setIsSelectMode}
                    selectedImages={selectedImages}
                    setSelectedImages={setSelectedImages}
                    trash_only={true}
                    openModal={openModal}
                    contextMenuItems={[
                        { label: "Restore", action: "restore" },
                        { label: "Delete Permanently", action: "delete_permanent" },
                    ]}
                />
            </div>

            <ConfirmationDialog
                isOpen={showConfirmDialog}
                onClose={() => setShowConfirmDialog(false)}
                onConfirm={handleEmptyTrash}
                title="Permanently Empty Trash?"
                message={`Are you sure you want to permanently delete all items in the trash? This action cannot be undone.`}
                confirmText="Empty Trash"
                cancelText="Cancel"
                confirmButtonColor="#dc2626" // Red for destructive action
            />
        </div>
    );
}

export default TrashView;