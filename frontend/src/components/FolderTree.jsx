import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSearch } from '../context/SearchContext';
import { IoFolderOutline, IoFolderOpenOutline, IoChevronForward, IoChevronDown } from 'react-icons/io5';

// Helper function to build a tree structure from flat paths
const buildFolderTree = (imagePaths) => {
    const nodes = new Map(); // Map fullPath -> node object
    const rootNodes = []; // Top-level nodes for the displayed tree
    const allParentPaths = new Set();

    // Create a node for each imagePath
    imagePaths.forEach(ip => {
        const fullPath = ip.path;
        // Use short_name for display if available, otherwise derive from the last segment of the path
        // Handle root path case where split might result in empty array
        const displayName = ip.short_name || fullPath.split('/').filter(Boolean).pop() || '/';
        
        nodes.set(fullPath, {
            name: displayName,
            path: fullPath, // This is the full path for search
            children: [],
            isLeaf: true, // Assume leaf initially, will change if children are added
            depth: 0, // Will be updated later
            isBasepath: ip.basepath, // Keep original basepath info
        });
    });

    // Build the hierarchy
    nodes.forEach(node => {
        // Determine parent path. If it's a basepath, its display parent is null (it's a root).
        // Otherwise, find its actual parent path. A root-level path like "/Output2" will result in an empty string.
        const parentPath = node.path.substring(0, node.path.lastIndexOf('/'));

        // A node should be a child if its parent path is not an empty string AND its parent exists in the nodes map.
        // A node explicitly marked as a basepath should always be a root.
        if (!node.isBasepath && parentPath && nodes.has(parentPath)) {
            const parentNode = nodes.get(parentPath);
            parentNode.children.push(node);
            parentNode.isLeaf = false; // Parent has children
            allParentPaths.add(parentNode.path); // Mark parent as expandable
        } else {
            // If no parent found in our list of nodes (e.g., parent is ignored or not a basepath),
            // or if it's explicitly a basepath, it's a root node for display.
            rootNodes.push(node);
        }
    });

    // Sort children and set depth
    const sortAndSetDepth = (node, depth) => {
        node.depth = depth;
        node.children.sort((a, b) => a.name.localeCompare(b.name));
        node.children.forEach(child => sortAndSetDepth(child, depth + 1));
    };

    // Sort top-level root nodes and then recursively sort children and set depths
    rootNodes.sort((a, b) => a.name.localeCompare(b.name));
    rootNodes.forEach(node => sortAndSetDepth(node, 0)); // Start depth from 0 for root nodes

    // Convert children objects to sorted arrays
    // The previous logic for converting children to arrays is now integrated into the sorting.
    // The previous logic for converting children to arrays is now integrated into the sorting.

    return { tree: rootNodes, parentPaths: allParentPaths };
};

const FolderTree = ({ webSocketMessage, setWebSocketMessage }) => {
    const { token } = useAuth();
    const { searchTerm, setSearchTerm } = useSearch();
    const [folderTree, setFolderTree] = useState([]); // Initialize as an empty array
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedFolderPath, setSelectedFolderPath] = useState(null);
    const [expandedFolders, setExpandedFolders] = useState(new Set()); // Stores paths of expanded folders
    const [shortNameToPathMap, setShortNameToPathMap] = useState({});

    // Effect to handle WebSocket messages
    useEffect(() => {
        if (!webSocketMessage) return;

        const { type } = webSocketMessage;

        if (type === 'refresh_images' || type === 'image_deleted' || type === 'images_deleted') {
            // When in folder view, a file change might affect the folder structure.
            fetchFolders();
        }
        setWebSocketMessage(null);
    }, [webSocketMessage, setWebSocketMessage]);

    const fetchFolders = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch('/api/folders/', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) {
                throw new Error(`Failed to fetch folders: ${response.statusText}`);
            }
            const responseData = await response.json(); // Expects { folders: ImagePath[] }
            const { tree, parentPaths } = buildFolderTree(responseData.folders); // Pass the array of ImagePath objects
            const newShortNameToPathMap = responseData.folders.reduce((acc, folder) => {
                if (folder.short_name) {
                    acc[folder.short_name] = folder.path;
                }
                return acc;
            }, {});
            setFolderTree(tree);
            setExpandedFolders(parentPaths); // Expand all parent folders by default
            setShortNameToPathMap(newShortNameToPathMap);
        } catch (err) {
            setError('Failed to load folders.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [token]);

    useEffect(() => {
        fetchFolders();
    }, [fetchFolders]);

    // Effect to sync selected folder path with the search term from context
    useEffect(() => {
        if (searchTerm && searchTerm.startsWith('Folder:"') && searchTerm.endsWith('"')) {
            const shortName = searchTerm.substring('Folder:"'.length, searchTerm.length - 1);
            setSelectedFolderPath(shortNameToPathMap[shortName] || null);
        } else {
            // If searchTerm is cleared or not a folder search, deselect.
            setSelectedFolderPath(null);
        }
    }, [searchTerm, shortNameToPathMap]);

    const handleToggleExpand = (path, event) => {
        event.stopPropagation();
        setExpandedFolders(prev => {
            const newSet = new Set(prev);
            if (newSet.has(path)) {
                newSet.delete(path);
            } else {
                newSet.add(path);
            }
            return newSet;
        });
    };

    const renderFolder = (node) => {
        const isExpanded = expandedFolders.has(node.path);
        const hasChildren = node.children && node.children.length > 0;
        const isSelected = selectedFolderPath === node.path;
        const isRoot = node.depth === 0;

        const handleSelect = () => {
            // Allow deselecting by clicking the same folder again
            const newSearchTerm = isSelected ? null : `Folder:"${node.name}"`;
            // Update the search term in the context
            setSearchTerm(newSearchTerm);
        };

        return (
            <li key={node.path} className={`folder-tree-item ${isSelected ? 'active' : ''}`}>
                <div
                    className="folder-tree-node"
                    onClick={handleSelect}
                    style={{ '--indent-level': node.depth }}
                >
                    {hasChildren ? (
                        <span className="folder-toggle-icon" onClick={(e) => handleToggleExpand(node.path, e)}>
                            {isExpanded ? <IoChevronDown /> : <IoChevronForward />}
                        </span>
                    ) : (
                        // Add a placeholder to maintain alignment for leaf nodes, but not for root items that are also leaves
                        <span className="folder-toggle-placeholder"></span>
                    )}
                    <span className="folder-icon">
                        {isExpanded && hasChildren ? <IoFolderOpenOutline /> : <IoFolderOutline />}
                    </span>
                    <span className="folder-name">{node.name}</span>
                </div>
                {hasChildren && isExpanded && (
                    <ul className="folder-tree-children">
                        {node.children.map(renderFolder)}
                    </ul>
                )}
            </li>
        );
    };

    if (loading) {
        return <div className="folder-tree-loading">Loading folders...</div>;
    }

    if (error) {
        return <div className="folder-tree-error">{error}</div>;
    }

    if (!Array.isArray(folderTree) || folderTree.length === 0) {
        return <div className="folder-tree-empty">No folders found.</div>;
    }

    return (
        <div className="folder-tree-container">
            <ul className="folder-tree-root">
                {folderTree.map(renderFolder)}
            </ul>
        </div>
    );
};

export default FolderTree;