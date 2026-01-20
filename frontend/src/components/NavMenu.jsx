import React from 'react';
import { useAuth } from '../context/AuthContext';

function NavMenuBar({
    currentView,
    setCurrentView,
    trashCount,
}) {
    const { isAdmin } = useAuth();

    return (
        <>
            <div className="navbar-menu-sub">
                <ul className="layout-buttons">
                    <li>
                        <button
                            className={`btn-base btn-primary ${currentView === 'grid' ? 'active' : ''}`}
                            onClick={() => setCurrentView('grid')}
                            title="Grid Layout"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 -960 960 960">
                                <path d="M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120zm0-80h133v-133H200zm213 0h134v-133H413zm214 0h133v-133H627zM200-413h133v-134H200zm213 0h134v-134H413zm214 0h133v-134H627zM200-627h133v-133H200zm213 0h134v-133H413zm214 0h133v-133H627z"/>
                            </svg>
                        </button> 
                    </li>
                    <li>
                        <button
                            className={`btn-base btn-primary ${currentView === 'folders' ? 'active' : ''}`}
                            title="Folder Layout"
                            onClick={() => setCurrentView('folders')}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 -960 960 960"><path d="M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h240l80 80h320q33 0 56.5 23.5T880-640v400q0 33-23.5 56.5T800-160zm0-80h640v-400H447l-80-80H160zm0 0v-480z"/></svg>
                        </button>
                    </li>
                    {isAdmin && (trashCount > 0 || currentView === 'trash') && (
                        <li>
                            <button
                                className={`btn-base btn-orange btn-trash ${currentView === 'trash' ? 'active' : ''}`}
                                title="View Trash"
                                onClick={() => setCurrentView('trash')}
                            > 
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 -960 960 960"><path d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120zm400-600H280v520h400zM360-280h80v-360h-80zm160 0h80v-360h-80zM280-720v520z"/></svg>
                            </button>
                        </li>
                    )}
                </ul>
            </div>
        </>
    );

}

export default NavMenuBar;