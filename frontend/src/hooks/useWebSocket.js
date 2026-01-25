import { useState, useEffect, useRef } from 'react';

/**
 * Custom hook to manage a WebSocket connection.
 * @param {string} baseUrl - The base URL for the WebSocket endpoint (e.g., 'ws://localhost:8000/ws/image-updates').
 * @param {string|null} token - The authentication token. If provided, it's appended to the URL.
 * @param {function} onMessage - Callback function to handle incoming messages.
 */
export function useWebSocket(baseUrl, token, isAdmin, onMessage) {
    const [isConnected, setIsConnected] = useState(false);
    const ws = useRef(null);
    const messageHandler = useRef(null);
    const pingInterval = useRef(null);
    const reconnectTimeout = useRef(null);
    const pongTimeout = useRef(null);

    messageHandler.current = onMessage;

    useEffect(() => {
        if (!baseUrl) return;

        const clearTimers = () => {
            if (pingInterval.current) clearInterval(pingInterval.current);
            if (pongTimeout.current) clearTimeout(pongTimeout.current);
            if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
        };

        const connect = () => {
            // If we are already connected or connecting, do nothing.
            if (ws.current && (ws.current.readyState === WebSocket.OPEN || ws.current.readyState === WebSocket.CONNECTING)) {
                return;
            }

            let finalUrl = baseUrl;
            if (token) {
                finalUrl += `?token=${encodeURIComponent(token)}`;
                if (isAdmin) {
                    console.log('WebSocket: Connecting as Admin.');
                } else {
                    console.log('WebSocket: Connecting as Authenticated User.');
                }
            } else {
                console.log('WebSocket: Connecting as Anonymous.');
            }
            
            if (ws.current) {
                ws.current.close();
            }

            ws.current = new WebSocket(finalUrl);

            ws.current.onopen = () => {
                console.log('WebSocket connection established');
                setIsConnected(true);
                
                // Clear any pending reconnects
                if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);

                // Start sending pings to keep the connection alive
                pingInterval.current = setInterval(() => {
                    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
                        ws.current.send(JSON.stringify({ type: 'ping' }));
                        
                        // Set a timeout for the pong response
                        if (pongTimeout.current) clearTimeout(pongTimeout.current);
                        pongTimeout.current = setTimeout(() => {
                            console.warn('WebSocket: Pong timeout. Connection likely dead. Closing.');
                            if (ws.current) ws.current.close();
                        }, 5000);
                    }
                }, 20000); // every 20 seconds
            };

            ws.current.onmessage = (event) => {
                try {
                    const messageData = JSON.parse(event.data);
                    // If it's a pong from the server, just ignore it.
                    if (messageData.type === 'pong') {
                        if (pongTimeout.current) clearTimeout(pongTimeout.current);
                        return;
                    }
                    if (messageHandler.current) {
                        messageHandler.current(messageData);
                    }
                } catch (e) {
                    console.error('Failed to parse WebSocket message:', e);
                }
            };

            ws.current.onclose = () => {
                console.log('WebSocket connection closed. Reconnecting in 3 seconds...');
                setIsConnected(false);
                
                if (pingInterval.current) clearInterval(pingInterval.current);
                if (pongTimeout.current) clearTimeout(pongTimeout.current);

                // Simple auto-reconnect logic
                if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
                reconnectTimeout.current = setTimeout(connect, 3000);
            };

            ws.current.onerror = (error) => {
                console.error('WebSocket error:', error);
                // onclose will be called automatically after an error.
                if (ws.current) ws.current.close();
            };
        };

        connect();

        const checkAndReconnect = () => {
            // If socket is closed or closing, reconnect immediately
            if (!ws.current || ws.current.readyState === WebSocket.CLOSED || ws.current.readyState === WebSocket.CLOSING) {
                console.log('Connection check triggered. WebSocket disconnected. Reconnecting...');
                if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
                connect();
            }
        };

        // Handle visibility change to reconnect immediately when app comes to foreground
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                checkAndReconnect();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('online', checkAndReconnect);
        window.addEventListener('pageshow', checkAndReconnect);

        // Cleanup on component unmount
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('online', checkAndReconnect);
            window.removeEventListener('pageshow', checkAndReconnect);
            clearTimers();
            if (ws.current) {
                // Prevent reconnection attempts when the component unmounts
                ws.current.onclose = null;
                ws.current.close();
            }
        };
    }, [baseUrl, token, isAdmin]); // Re-run the effect if the base URL, token, or admin status changes

    return { isConnected };
}