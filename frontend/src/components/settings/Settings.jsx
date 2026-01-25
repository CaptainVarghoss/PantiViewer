import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import ImagePathsManagement from './ImagePathsManagement';
import FilterManager from './FilterManager';
import DeviceSpecificSettingsForm from './DeviceSpecificSettingsForm';
import GlobalSettingsForm from './GlobalSettingsForm';
import UserManagement from './UserManagement';
import LogViewer from './LogViewer';
import TagManager from './TagManager';

/**
 * A unified settings component that uses tabs to organize different settings panels.
 *
 * @param {object} props - Component props.
 * @param {Array} props.filters - The list of filters.
 * @param {function} props.setFilters - Function to update filters.
 * @param {function} props.onLogout - Function to handle user logout.
 */
function Settings({ filters, setFilters, onLogout, refetchFilters }) {
    const { isAdmin } = useAuth();
    const [activeTab, setActiveTab] = useState(isAdmin ? 'global' : 'device');

    const renderContent = () => {
        switch (activeTab) {
            case 'paths':
                return <ImagePathsManagement />;
            case 'filters':
                return <FilterManager filters={filters} refetchFilters={refetchFilters} isAdmin={isAdmin} />;
            case 'tags':
                return <TagManager />;
            case 'device':
                return <DeviceSpecificSettingsForm />;
            case 'global':
                return isAdmin ? <GlobalSettingsForm /> : null;
            case 'user':
                return <UserManagement />;
            case 'logs':
                return isAdmin ? <LogViewer /> : null;
            default:
                return <ImagePathsManagement />;
        }
    };

    return (
        <>
            <div className="modal-header">
                <section>
                    <div className="section-container">
                        <div className="tab-container">
                            {isAdmin && (
                                <>
                                    <button className={`tab-item ${activeTab === 'global' ? 'active' : ''}`} onClick={() => setActiveTab('global')}>Global</button>
                                    <button className={`tab-item ${activeTab === 'paths' ? 'active' : ''}`} onClick={() => setActiveTab('paths')}>Folders</button>
                                    <button className={`tab-item ${activeTab === 'filters' ? 'active' : ''}`} onClick={() => setActiveTab('filters')}>Filters</button>
                                    <button className={`tab-item ${activeTab === 'tags' ? 'active' : ''}`} onClick={() => setActiveTab('tags')}>Tags</button>
                                    <button className={`tab-item ${activeTab === 'logs' ? 'active' : ''}`} onClick={() => setActiveTab('logs')}>Logs</button>
                                </>
                            )}
                            <button className={`tab-item ${activeTab === 'device' ? 'active' : ''}`} onClick={() => setActiveTab('device')}>Device</button>
                            <button className={`tab-item ${activeTab === 'user' ? 'active' : ''}`} onClick={() => setActiveTab('user')}>User</button>
                        </div>
                    </div>
                </section>
            </div>
            <div className="modal-body">
                <section>
                    {renderContent()}
                </section>
            </div>
            <div className="modal-footer">
                <section>
                    <div className="section-container">
                        <button onClick={onLogout} className="btn-base btn-red settings-logout-button">Logout</button>
                    </div>
                </section>
            </div>
        </>
    );
}

export default Settings;