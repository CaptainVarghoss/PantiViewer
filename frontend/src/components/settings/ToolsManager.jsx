import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

function ToolsManager() {
    const { token } = useAuth();
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState(null);
    const [error, setError] = useState(null);

    const handleAction = async (url, body = null) => {
        setLoading(true);
        setMessage(null);
        setError(null);
        try {
            const options = {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            };
            if (body) {
                options.body = JSON.stringify(body);
            }

            const response = await fetch(url, options);
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || `Error: ${response.statusText}`);
            }

            const result = await response.json();
            setMessage(result.message);
        } catch (err) {
            setError(err.message || 'An unexpected error occurred.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="section-container">
            <div className="section-header">
                <h3>Administrative Tools</h3>
            </div>
            
            {message && <div className="status-text success" style={{marginBottom: '1rem'}}>{message}</div>}
            {error && <div className="status-text error" style={{marginBottom: '1rem'}}>{error}</div>}

            <div className="section-list">
                {/* Manual Scan */}
                <div className="section-item">
                    <div className="section-row">
                        <div className="section-fields">
                            <div className="form-group">
                                <label>Manual File Scan</label>
                                <p className="modal-text-gray" style={{fontSize: '0.9em'}}>
                                    Triggers a scan of all configured folder paths for new images and videos.
                                </p>
                            </div>
                        </div>
                        <div className="section-fields">
                            <button 
                                onClick={() => handleAction('/api/scan-files/')} 
                                className="btn-base btn-yellow"
                                disabled={loading}
                            >
                                Run Scan
                            </button>
                        </div>
                    </div>
                </div>

                {/* Metadata Refresh */}
                <div className="section-item">
                    <div className="section-row">
                        <div className="section-fields">
                            <div className="form-group">
                                <label>Refresh All Metadata</label>
                                <p className="modal-text-gray" style={{fontSize: '0.9em'}}>
                                    Reprocesses EXIF data, dimensions, and other metadata for all images in the database.
                                </p>
                            </div>
                        </div>
                        <div className="section-fields">
                            <button 
                                onClick={() => handleAction('/api/reprocess-metadata/', { scope: 'all' })} 
                                className="btn-base btn-green"
                                disabled={loading}
                            >
                                Refresh Metadata
                            </button>
                        </div>
                    </div>
                </div>

                {/* FTS Rebuild */}
                <div className="section-item">
                    <div className="section-row">
                        <div className="section-fields">
                            <div className="form-group">
                                <label>Rebuild Search Index</label>
                                <p className="modal-text-gray" style={{fontSize: '0.9em'}}>
                                    Rebuilds the Full Text Search (FTS) index. Run this if search results seem incorrect or incomplete.
                                </p>
                            </div>
                        </div>
                        <div className="section-fields">
                            <button 
                                onClick={() => handleAction('/api/rebuild-fts/')} 
                                className="btn-base btn-primary"
                                disabled={loading}
                            >
                                Rebuild Index
                            </button>
                        </div>
                    </div>
                </div>

                {/* Purge Thumbnails */}
                <div className="section-item">
                    <div className="section-row">
                        <div className="section-fields">
                            <div className="form-group">
                                <label>Purge Thumbnails</label>
                                <p className="modal-text-gray" style={{fontSize: '0.9em'}}>
                                    Deletes all generated thumbnail files. They will be regenerated automatically when images are viewed.
                                </p>
                            </div>
                        </div>
                        <div className="section-fields">
                            <button 
                                onClick={() => handleAction('/api/purge-thumbnails/')} 
                                className="btn-base btn-red"
                                disabled={loading}
                            >
                                Purge Thumbnails
                            </button>
                        </div>
                    </div>
                </div>

                {/* Purge Previews */}
                <div className="section-item">
                    <div className="section-row">
                        <div className="section-fields">
                            <div className="form-group">
                                <label>Purge Previews</label>
                                <p className="modal-text-gray" style={{fontSize: '0.9em'}}>
                                    Deletes all generated preview images. They will be regenerated on demand.
                                </p>
                            </div>
                        </div>
                        <div className="section-fields">
                            <button 
                                onClick={() => handleAction('/api/purge-previews/')} 
                                className="btn-base btn-red"
                                disabled={loading}
                            >
                                Purge Previews
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default ToolsManager;