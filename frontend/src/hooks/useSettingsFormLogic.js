import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

/**
 * A custom React hook to encapsulate the common logic for settings forms
 * (Global and Device-Specific settings).
 * Handles fetching, state management for various input types, and updating settings.
 *
 * @param {string} formType - 'global' or 'device'. Determines API endpoints and logic.
 * @param {string} [deviceId] - Required if formType is 'device'. The unique ID of the device.
 * @returns {object} An object containing states and handlers needed by the settings forms.
 */
function useSettingsFormLogic(formType, deviceId = null) {
  const { user, token, isAdmin, isAuthenticated, loading: authLoading, fetchSettings, settings, saveLocalSetting } = useAuth();

  const [settingsList, setSettingsList] = useState([]); // List of full setting objects (Global or Device-accessible)
  const [loadingLocal, setLoadingLocal] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // States for individual boolean/custom switches, dynamically updated
  const [switchStates, setSwitchStates] = useState({});
  const [textInputStates, setTextInputStates] = useState({});
  const [numberInputStates, setNumberInputStates] = useState({});

  // Helper to convert string 'True'/'False' to boolean
  const parseBooleanSetting = useCallback((value) => value?.toLowerCase() === 'true', []);
  // Helper to convert string to number
  const parseNumberSetting = useCallback((value) => {
    const num = parseFloat(value);
    return isNaN(num) ? '' : num;
  }, []);

  // Main fetch function, dynamic based on formType
  const fetchCurrentSettings = useCallback(async () => {
    setLoadingLocal(true);
    setError('');

    let endpoint = '';
    let headers = { 'Authorization': `Bearer ${token}` };

    if (!isAuthenticated || !user || !token) {
        setLoadingLocal(false);
        setError("User not authenticated.");
        return;
    }

    if (formType === 'global') {
      if (!isAdmin) {
        setError("Access Denied: Only administrators can view global settings.");
        setLoadingLocal(false);
        return;
      }
      endpoint = '/api/settings/';
    } else if (formType === 'device') {
      // For device settings, we fetch global settings to get metadata and defaults
      endpoint = `/api/settings/`;
    } else {
      setError("Invalid form type provided.");
      setLoadingLocal(false);
      return;
    }

    try {
      const response = await fetch(endpoint, { headers });
      if (response.ok) {
        const rawData = await response.json();

        // For the 'device' formType, filter out admin-only settings
        const dataToProcess = formType === 'device' ? rawData.filter(setting => !setting.admin_only) : rawData;
        setSettingsList(dataToProcess);

        const initialSwitchStates = {};
        const initialTextInputStates = {};
        const initialNumberInputStates = {};

        // Load local overrides if applicable
        let localSettings = {};
        let settingsUpdated = false;

        if (formType === 'device') {
          try {
            const stored = localStorage.getItem('panti_device_settings');
            if (stored) {
              localSettings = JSON.parse(stored);
            }
          } catch (e) {
            console.error("Failed to parse local device settings", e);
          }
        }

        // Populate initial states based on the values in rawData
        dataToProcess.forEach(setting => {
          let value = setting.value;
          
          // Apply local override if exists
          if (formType === 'device' && localSettings.hasOwnProperty(setting.name)) {
             value = localSettings[setting.name];
          } else if (formType === 'device') {
             // If not in local storage, create it from global setting
             localSettings[setting.name] = value;
             settingsUpdated = true;
          }

          switch (setting.input_type) {
            case 'switch':
              initialSwitchStates[setting.name] = parseBooleanSetting(value);
              break;
            case 'number':
              initialNumberInputStates[setting.name] = parseNumberSetting(value);
              break;
            case 'text':
            default:
              initialTextInputStates[setting.name] = value;
              break;
          }
        });

        // Save initialized settings to localStorage if any were missing
        if (formType === 'device' && settingsUpdated) {
            localStorage.setItem('panti_device_settings', JSON.stringify(localSettings));
        }

        setSwitchStates(initialSwitchStates);
        setTextInputStates(initialTextInputStates);
        setNumberInputStates(initialNumberInputStates);

        setError('');
      } else {
        const errorData = await response.json();
        setError(`Failed to fetch settings: ${errorData.detail || response.statusText}`);
      }
    } catch (err) {
      console.error(`useSettingsFormLogic (${formType}): Network error while fetching settings:`, err);
      setError('Network error while fetching settings.');
    } finally {
      setLoadingLocal(false);
    }
  }, [formType, user, token, settings, isAdmin, isAuthenticated, deviceId, authLoading, parseBooleanSetting, parseNumberSetting]);


  useEffect(() => {
    // Determine when to fetch based on formType and auth status
    const shouldFetch = !authLoading && isAuthenticated;

    if (shouldFetch) {
      fetchCurrentSettings();
    } else if (!authLoading && !shouldFetch) {
      // Clear state if not authorized or missing deviceId for device form
      setLoadingLocal(false);
      setSettingsList([]);
      setSwitchStates({});
      setTextInputStates({});
      setNumberInputStates({});
      setError(""); // Clear error to avoid showing old errors if unauthenticated
      if (!isAuthenticated) {
        setError("User not authenticated.");
      } else if (formType === 'global' && !isAdmin) {
        setError("Access Denied: Only administrators can view global settings.");
      }
    }
  }, [isAuthenticated, isAdmin, authLoading, deviceId, formType, fetchCurrentSettings]);


  // Main update function, dynamic based on formType
  const handleUpdateSetting = useCallback(async (settingName, valueToSave) => {
    setMessage('');
    setError('');

    if (!isAuthenticated || !user || !token) {
      setError("Authorization failed for update.");
      console.warn(`useSettingsFormLogic (${formType}): Unauthorized attempt to update setting.`);
      return;
    }

    let actualValueToSave = valueToSave;
    let apiEndpoint = '';
    let apiMethod = 'PUT'; // Default method for updates
    let requestBody = {};

    const settingMetadata = settingsList.find(s => s.name === settingName);
    if (!settingMetadata) {
        setError(`Setting '${settingName}' metadata not found. Cannot update.`);
        console.error(`useSettingsFormLogic (${formType}): Setting metadata not found for ${settingName}.`);
        return;
    }

    // Convert boolean/number to string for backend if necessary
    if (settingMetadata.input_type === 'switch' && typeof valueToSave === 'boolean') {
      actualValueToSave = valueToSave ? 'True' : 'False';
    } else if (settingMetadata.input_type === 'number' && typeof valueToSave === 'number') {
      actualValueToSave = String(valueToSave);
    }

    // Determine API endpoint and payload based on formType
    if (formType === 'global') {
        if (!isAdmin) {
            setError(`"${settingMetadata.display_name}" is an admin-only setting and you are not authorized to change it.`);
            console.warn(`useSettingsFormLogic (${formType}): Attempted to change global setting ${settingName} by non-admin.`);
            return;
        }
        apiEndpoint = `/api/settings/${settingMetadata.id}`; // Update global setting by ID
        requestBody = { name: settingName, value: actualValueToSave };

         try {
          const response = await fetch(apiEndpoint, {
            method: apiMethod,
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify(requestBody),
          });
    
          if (response.ok) {
            setMessage(`Setting '${settingMetadata.display_name}' updated successfully!`);
            console.log(`useSettingsFormLogic (${formType}): Successfully updated ${settingName}.`);
            await fetchCurrentSettings(); // Re-fetch to update local state and reflect changes
            await fetchSettings(token); // Also refresh the AuthContext settings
    
          } else {
            const errorData = await response.json();
            setError(`Failed to update setting: ${errorData.detail || response.statusText}`);
            console.error(`useSettingsFormLogic (${formType}): Failed to update ${settingName}:`, errorData);
          }
        } catch (err) {
          console.error(`useSettingsFormLogic (${formType}): Network error or failed to update setting:`, err);
          setError('Network error or failed to update setting.');
        }

    } else if (formType === 'device') {
        if (settingMetadata.admin_only) {
            setError(`"${settingMetadata.display_name}" is an admin-only setting and cannot be overridden by device.`);
            return;
        }
        
        // Update LocalStorage via AuthContext helper
        saveLocalSetting(settingName, actualValueToSave);
        setMessage(`Device setting '${settingMetadata.display_name}' saved locally.`);
    }
  }, [formType, user, token, isAdmin, isAuthenticated, deviceId, settingsList, fetchCurrentSettings, fetchSettings, saveLocalSetting]);

  // Handler to reset a device setting to global default
  const handleResetSetting = useCallback(async (settingName) => {
    if (formType !== 'device') return;

    try {
      const stored = localStorage.getItem('panti_device_settings');
      if (stored) {
        let localSettings = JSON.parse(stored);
        if (localSettings.hasOwnProperty(settingName)) {
          delete localSettings[settingName];
          localStorage.setItem('panti_device_settings', JSON.stringify(localSettings));
          
          setMessage(`Device setting reset to global default.`);
          
          // Refresh to pull global value back into state (and re-populate LS with it)
          await fetchCurrentSettings();
          await fetchSettings(token);
        }
      }
    } catch (e) {
      console.error("Failed to reset device setting", e);
      setError("Failed to reset setting.");
    }
  }, [formType, fetchCurrentSettings, fetchSettings, token]);

  // Generic toggle handler for single boolean switches
  const handleBooleanToggle = useCallback((settingName) => () => {
    setSwitchStates(prev => {
      const currentValue = prev[settingName];
      const newValue = !currentValue;
      const newState = { ...prev, [settingName]: newValue };
      handleUpdateSetting(settingName, newValue);
      return newState;
    });
  }, [handleUpdateSetting]);

  // Generic change handler for text inputs
  const handleTextInputChange = useCallback((settingName) => (e) => {
    setTextInputStates(prev => ({ ...prev, [settingName]: e.target.value }));
  }, []);

  // Generic blur handler for text inputs (saves on blur)
  const handleTextInputBlur = useCallback((settingName) => (e) => {
    handleUpdateSetting(settingName, e.target.value);
  }, [handleUpdateSetting]);

  // Generic change handler for number inputs
  const handleNumberInputChange = useCallback((settingName) => (e) => {
    const value = e.target.value;
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setNumberInputStates(prev => ({ ...prev, [settingName]: value }));
    }
  }, []);

  // Generic blur handler for number inputs (saves on blur)
  const handleNumberInputBlur = useCallback((settingName) => (e) => {
      const numValue = parseFloat(e.target.value);
      if (!isNaN(numValue)) {
          handleUpdateSetting(settingName, numValue);
      } else if (e.target.value === '') {
          handleUpdateSetting(settingName, '');
      } else {
          setError(`Invalid number for ${settingName}. Please enter a valid number.`);
      }
  }, [handleUpdateSetting]);

  // Group settings by their 'group' property for rendering
  const groupedSettings = useMemo(() => {
    const groups = {};
    settingsList.forEach(setting => {
      const groupName = setting.group || 'Other';
      if (!groups[groupName]) {
        groups[groupName] = [];
      }
      groups[groupName].push(setting);
    });
    return groups;
  }, [settingsList]);

  return {
    loadingLocal,
    message,
    error,
    groupedSettings,
    switchStates,
    textInputStates,
    numberInputStates,
    handleBooleanToggle,
    handleTextInputChange,
    handleTextInputBlur,
    handleNumberInputChange,
    handleNumberInputBlur,
    handleResetSetting, // Export reset handler
    isAuthenticated, // Export for conditional rendering in components
    isAdmin // Export for conditional rendering in components
  };
}

export default useSettingsFormLogic;
