import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import ConfirmationDialog from '../ConfirmDialog';
import { MdDelete } from "react-icons/md";

function UserManagement() {
    const { token, user, isAdmin } = useAuth();
    const [allUsers, setAllUsers] = useState([]);
    const [editableUsers, setEditableUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [message, setMessage] = useState(null);
    const [isSaving, setIsSaving] = useState(false);

    // State for password change form
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [passwordChangeMessage, setPasswordChangeMessage] = useState('');
    const [passwordChangeError, setPasswordChangeError] = useState('');

    // State for device IDs
    const [deviceIds, setDeviceIds] = useState([]);
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);
    const [deviceToDelete, setDeviceToDelete] = useState(null);

    const fetchAllUsers = useCallback(async () => {
        if (!isAdmin) {
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const response = await fetch('/api/users/', {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (!response.ok) throw new Error('Failed to fetch users.');
            const data = await response.json();
            // Add a new_password field for the admin password change form
            const usersWithPasswordField = data.map(u => ({ ...u, new_password: '' }));
            setAllUsers(JSON.parse(JSON.stringify(usersWithPasswordField))); // Keep a pristine copy
            setEditableUsers(usersWithPasswordField);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [token, isAdmin]);

    useEffect(() => {
        if (isAdmin) {
            fetchAllUsers();
        }
    }, [fetchAllUsers, isAdmin]);

    const handleInputChange = (id, field, value) => {
        setEditableUsers(prev =>
            prev.map(u => (u.id === id ? { ...u, [field]: value } : u))
        );
    };

    const handleSaveChanges = async () => {
        setIsSaving(true);
        setError(null);
        setMessage(null);

        const updatePromises = editableUsers.map(u => {
            const originalUser = allUsers.find(orig => orig.id === u.id);
            if (JSON.stringify(u) === JSON.stringify(originalUser)) {
                return Promise.resolve({ ok: true });
            }
            return fetch(`/api/users/${u.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                    admin: u.admin,
                    login_allowed: u.login_allowed,
                    ...(u.new_password && { password: u.new_password }) // Only include password if it's being changed
                }),
            });
        });

        try {
            const results = await Promise.all(updatePromises);
            const failed = results.filter(res => !res.ok);
            if (failed.length > 0) throw new Error(`${failed.length} user(s) failed to update.`);
            setMessage('All user changes saved successfully!');
            fetchAllUsers();
        } catch (err) {
            setError(err.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleChangePassword = async (e) => {
        e.preventDefault();
        setPasswordChangeError('');
        setPasswordChangeMessage('');

        if (newPassword !== confirmPassword) {
            setPasswordChangeError("New passwords do not match.");
            return;
        }

        try {
            const response = await fetch('/api/users/change-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ new_password: newPassword }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Failed to change password.');
            }

            setPasswordChangeMessage('Password changed successfully!');
            setNewPassword('');
            setConfirmPassword('');
        } catch (err) {
            setPasswordChangeError(err.message);
        }
    };

    const handleDeleteDeviceClick = (deviceId) => {
        setDeviceToDelete(deviceId);
        setShowConfirmDialog(true);
    };

    const handleConfirmDeleteDevice = async () => {
        if (!deviceToDelete) return;

        try {
            const response = await fetch(`/api/devicesettings/by-device-id/${deviceToDelete}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` },
            });

            if (!response.ok) {
                throw new Error('Failed to delete device settings.');
            }

            setMessage('Device settings cleared successfully!');
            // Refetch device IDs to update the list
            fetchDeviceIds();

        } catch (err) {
            setError(err.message);
        } finally {
            setShowConfirmDialog(false);
            setDeviceToDelete(null);
        }
    };

    const hasUnsavedChanges = JSON.stringify(allUsers) !== JSON.stringify(editableUsers);

    return (
        <>
            <div className="section-container">
                <div className="section-header">
                    <h3>My Account ({user?.username})</h3>
                </div>
                <form id='change-password-form' onSubmit={handleChangePassword}>
                    <div className="section-item">
                        <div className="section-row">
                            <div className="section-fields">
                                <div className="form-group">
                                    <input id='username' autoComplete='username' type='text' readOnly value={user.username} />
                                    <label htmlFor='new-password'>New Password</label>
                                    <input id='new-password' autoComplete='new-password' type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="form-input-base" required />
                                </div>
                                <div className="form-group">
                                    <label htmlFor='confirm-password'>Confirm New Password</label>
                                    <input id='confirm-password' autoComplete='confirm-password' type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="form-input-base" required />
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="section-footer">
                        <button type="submit" className="btn-base btn-primary">Change Password</button>
                    </div>
                    {passwordChangeMessage && <p className="status-text" style={{ color: 'var(--accent-green)' }}>{passwordChangeMessage}</p>}
                    {passwordChangeError && <p className="error-text">{passwordChangeError}</p>}
                </form>
            </div>

            {isAdmin && (
                <div className="section-container">
                    <div className="section-header">
                        <h3>All Users</h3>
                    </div>
                    {loading ? <p>Loading users...</p> : (
                        <div className="section-list">
                            {editableUsers.map(u => (
                                <div key={u.id} className="section-item">
                                    <div className="section-row">
                                        <div className="section-fields">
                                            <p><strong>ID:</strong> {u.id}&nbsp;&nbsp;<strong>Username:</strong> {u.username}</p>
                                            {u.id !== user.id && (
                                                <div className="form-group" style={{ marginTop: '8px' }}>
                                                    <input
                                                        type="text"
                                                        placeholder="New Password"
                                                        value={u.new_password || ''}
                                                        onChange={(e) => handleInputChange(u.id, 'new_password', e.target.value)} className="form-input-base" />
                                                </div>
                                            )}
                                        </div>
                                        <div className="section-fields section-fields-toggles">
                                            <div className="checkbox-container">
                                                <span className="checkbox-label">Admin</span>
                                                <label htmlFor='admin-checkbox' className="checkbox-label">
                                                    <input
                                                        type="checkbox"
                                                        id='admin-checkbox'
                                                        className="checkbox-base"
                                                        checked={u.admin}
                                                        onChange={(e) => handleInputChange(u.id, 'admin', e.target.checked)}
                                                        disabled={u.id === user.id}
                                                    />
                                                </label>
                                            </div>
                                            <div className="checkbox-container">
                                                <span className="checkbox-label">Login Allowed</span>
                                                <label htmlFor='login-checkbox' className="checkbox-label">
                                                    <input
                                                        type="checkbox"
                                                        id='login-checkbox'
                                                        className="checkbox-base"
                                                        checked={u.login_allowed}
                                                        onChange={(e) => handleInputChange(u.id, 'login_allowed', e.target.checked)}
                                                        disabled={u.id === user.id}
                                                    />
                                                </label>
                                            </div>
                                        </div>
                                        <div className="section-fields">
                                            <button className="btn-base btn-red icon-button" disabled>
                                                <MdDelete size={18} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {hasUnsavedChanges && (
                                <div className="section-footer">
                                    <button onClick={handleSaveChanges} className="btn-base btn-green" disabled={isSaving}>
                                        {isSaving ? 'Saving...' : 'Apply User Changes'}
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                    {error && <p className="error-text">{error}</p>}
                    {message && <p className="status-text" style={{ color: 'var(--accent-green)' }}>{message}</p>}
                </div>
            )}

            <ConfirmationDialog
                isOpen={showConfirmDialog}
                onClose={() => setShowConfirmDialog(false)}
                onConfirm={handleConfirmDeleteDevice}
                title="Clear Device Settings"
                message={`Are you sure you want to clear all settings for device ID "${deviceToDelete}"? This will reset the device to use global settings.`}
                confirmText="Clear Settings"
                cancelText="Cancel"
                confirmButtonColor="#dc2626"
            />
        </>
    );
}

export default UserManagement;