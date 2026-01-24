import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true); // Initial loading for auth status
  const [error, setError] = useState(null);

  // State to hold all tiered settings with metadata
  const [settings, setSettings] = useState({}); // Tiered settings (name: value)
  const [rawSettingsList, setRawSettingsList] = useState([]); // List of full setting objects with metadata

  // Helper to parse setting values based on input_type
  const parseSettingValue = useCallback((value, input_type) => {
    if (input_type === 'switch') {
      if (typeof value === 'boolean') return value;
      return String(value).toLowerCase() === 'true';
    }
    if (input_type === 'number') {
      if (typeof value === 'number') return value;
      const num = parseFloat(value);
      return isNaN(num) ? value : num; // Return original string if not a valid number
    }
    return value; // Default to string
  }, []);

  // Fetch all settings from backend (tiered view)
  const fetchSettings = useCallback(async (authToken) => {
    // Only fetch settings if there's an authentication token
    if (!authToken) {
      console.log('not authorized for some reason')
      setSettings({});
      setRawSettingsList([]);
      return;
    }
    try {
      const response = await fetch(`/api/settings/`, {
        headers: {
          'Authorization': `Bearer ${authToken}` // Use provided token for this fetch
        }
      });
      if (response.ok) {
        const data = await response.json(); // This will be List[schemas.Setting]
        setRawSettingsList(data); // Store the full list with metadata

        // Transform the list into a simple name-value map for easy access in components
        const newSettingsMap = {};

        data.forEach(setting => {
          newSettingsMap[setting.name] = parseSettingValue(setting.value, setting.input_type);
        });

        // Merge device-specific settings from localStorage
        try {
          const stored = localStorage.getItem('panti_device_settings');
          if (stored) {
            const localSettings = JSON.parse(stored);
            
            // Merge local settings, but ensure they are parsed correctly according to metadata
            Object.keys(localSettings).forEach(key => {
              // Find metadata for this setting to know its type
              const settingDef = data.find(s => s.name === key);
              const val = localSettings[key];
              newSettingsMap[key] = settingDef ? parseSettingValue(val, settingDef.input_type) : val;
            });
          }
        } catch (e) {
          console.error("Error parsing local device settings", e);
        }

        setSettings(newSettingsMap); // Store the processed and merged values
      } else {
        console.error("Failed to fetch settings:", response.status, response.statusText);
        // If the token is invalid or unauthorized, it might indicate a session issue.
        // Do NOT call logout directly here to avoid loops. Let the main auth check handle it.
        setError("Failed to fetch settings.");
      }
    } catch (err) {
      console.error("Network error fetching settings:", err);
      setError("Network error fetching settings.");
    }
  }, [parseSettingValue]);

  useEffect(() => {
    // We only want to refetch if the user is already authenticated.
    // On initial load, the main checkAuthStatus effect handles the first fetch.
    const currentToken = localStorage.getItem('token');
    if (currentToken) {
      fetchSettings(currentToken);
    }
  }, [fetchSettings]);

  // Helper to save a local setting and update state immediately
  const saveLocalSetting = useCallback((key, value) => {
    try {
      const stored = localStorage.getItem('panti_device_settings');
      let localSettings = stored ? JSON.parse(stored) : {};
      localSettings[key] = value;
      localStorage.setItem('panti_device_settings', JSON.stringify(localSettings));

      // Update the settings state immediately
      setSettings(prev => ({ ...prev, [key]: value }));
    } catch (e) {
      console.error("Failed to save local setting", e);
    }
  }, []);


  // The main login function - now handles the API calls
  const login = useCallback(async (username, password) => {
    setLoading(true);
    setError(null); // Clear any previous errors

    try {
      // Step 1: Get Access Token from /api/token
      const tokenResponse = await fetch('/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded', // Required for OAuth2PasswordRequestForm
        },
        body: new URLSearchParams({
          username: username,
          password: password,
        }).toString(),
      });

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.json();
        const errorMessage = errorData.detail || 'Login failed';
        setError(errorMessage);
        setLoading(false);
        return { success: false, message: errorMessage };
      }

      const tokenData = await tokenResponse.json();
      const newToken = tokenData.access_token;
      localStorage.setItem('token', newToken); // Store token in local storage

      // Step 2: Fetch User Data using the new token from /api/users/me/
      const userResponse = await fetch('/api/users/me/', {
        headers: {
          'Authorization': `Bearer ${newToken}`,
        },
      });

      if (!userResponse.ok) {
        localStorage.removeItem('token'); // Clear token if user data fetch fails (e.g., token invalid)
        const errorData = await userResponse.json();
        const errorMessage = errorData.detail || 'Failed to fetch user data after login.';
        setError(errorMessage);
        setLoading(false);
        return { success: false, message: errorMessage };
      }

      const userData = await userResponse.json();

      // Step 3: Update authentication states
      setToken(newToken);
      setUser(userData);
      setIsAuthenticated(true);
      setIsAdmin(userData.admin);

      // Step 4: Fetch settings using the new token and user data
      await fetchSettings(newToken); // Pass the new token explicitly

      setLoading(false);
      return { success: true, message: 'Login successful!' };

    } catch (err) {
      console.error('Login process error:', err);
      setError('Network error or unexpected issue during login.');
      setLoading(false);
      return { success: false, message: 'Network error or unexpected issue during login.' };
    }
  }, [fetchSettings]); // `fetchSettings` is a dependency as `login` calls it.

  // The logout function - purely client-side operation for JWT
  const logout = useCallback(() => {
    localStorage.removeItem('token'); // Remove token from local storage
    setToken(null);
    setUser(null);
    setIsAuthenticated(false);
    setIsAdmin(false);
    setSettings({}); // Clear settings on logout
    setRawSettingsList([]); // Clear raw settings on logout
    setError(null); // Clear any errors
    setLoading(false); // Ensure loading is false after logout
  }, []);

  // Effect to re-authenticate user on initial load or token changes
  useEffect(() => {
    const checkAuthStatus = async () => {
      setLoading(true);
      setError(null); // Clear previous errors
      const storedToken = localStorage.getItem('token');

      if (storedToken) {
        try {
          // Attempt to fetch user data using the stored token
          const response = await fetch('/api/users/me/', {
            headers: {
              'Authorization': `Bearer ${storedToken}`
            }
          });
          if (response.ok) {
            const userData = await response.json();
            setToken(storedToken); // Ensure token state is set
            setUser(userData);
            setIsAuthenticated(true);
            setIsAdmin(userData.admin);
            await fetchSettings(storedToken); // Fetch settings for the authenticated user
          } else {
            console.error('Failed to verify token on startup:', response.status, response.statusText);
            logout(); // If token verification fails, consider the user logged out
          }
        } catch (err) {
          console.error('Network error during token verification on startup:', err);
          logout(); // Treat network errors during auth check as logout
        } finally {
          setLoading(false); // Authentication check is complete
        }
      } else {
        setLoading(false); // No token, so not authenticated
        logout(); // Ensure all auth states are reset to logged out
      }
    };

    checkAuthStatus();
  }, [logout, fetchSettings]); // Dependencies for useEffect: logout and fetchSettings

  // Memoize the context value to prevent unnecessary re-renders of consumers
  const contextValue = useMemo(() => ({
    token,
    user,
    isAuthenticated,
    isAdmin,
    loading,
    error,
    settings, // Tiered settings (name: value map)
    rawSettingsList, // Full list of setting objects with metadata
    login, // The centralized login function
    logout,
    fetchSettings, // Expose fetchSettings for manual refresh if needed
    saveLocalSetting // Expose helper to save local settings
  }), [token, user, isAuthenticated, isAdmin, loading, error, settings, rawSettingsList, login, logout, fetchSettings, saveLocalSetting]);

  return (
    <AuthContext.Provider value={{
      ...contextValue,
    }}>
      {children}
    </AuthContext.Provider>
  );
};
