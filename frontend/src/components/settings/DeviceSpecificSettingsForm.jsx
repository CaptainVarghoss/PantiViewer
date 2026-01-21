import React from 'react';
import { useAuth } from '../../context/AuthContext';
import useSettingsFormLogic from '../../hooks/useSettingsFormLogic';

/**
 * Component for managing device-specific user settings.
 * It now includes a toggle to switch between applying device-specific overrides
 * or viewing read-only global settings.
 *
 * @param {object} props - Component props.
 * @param {function} props.onBack - Callback to return to the previous settings menu.
 * @param {function} props.onClose - Callback to close the parent sidebar.
 */
function DeviceSpecificSettingsForm({ onBack, onClose }) {
  const { deviceId, useDeviceSettings, handleUseDeviceSettingsToggle } = useAuth();

  // Read the initial state for the device settings override from localStorage.
  // This value must be passed to the hook to avoid conditional hook errors.
  const initialUseDeviceSettings = useDeviceSettings;

  const {
    loadingLocal,
    message,
    error,
    groupedSettings,
    textInputStates,
    numberInputStates,
    switchStates,
    handleBooleanToggle,
    handleTextInputChange,
    handleTextInputBlur,
    handleNumberInputChange,
    handleNumberInputBlur,
    isAuthenticated,
  } = useSettingsFormLogic('device', deviceId, initialUseDeviceSettings);

  /**
   * Custom handler for navigation toggles to ensure at least one is always enabled.
   * If turning one off would result in both being off, it enables the other one.
   * Defaults to enabling 'right_enabled' if both are off.
   * @param {string} settingName - The name of the setting being toggled ('left_enabled' or 'right_enabled').
   */
  const handleNavToggle = (settingName) => (event) => {
    const isDisabling = !event.target.checked;

    // Call the original handler from the hook to update the state
    handleBooleanToggle(settingName)(event);

    if (isDisabling) {
      if (settingName === 'left_enabled' && !switchStates['right_enabled']) {
        // User is turning off left_enabled while right_enabled is already off.
        // Force right_enabled back on.
        handleBooleanToggle('right_enabled')({ target: { checked: true } });
      } else if (settingName === 'right_enabled' && !switchStates['left_enabled']) {
        // User is turning off right_enabled while left_enabled is already off.
        // Force left_enabled back on.
        handleBooleanToggle('left_enabled')({ target: { checked: true } });
      }
    }
  };
  if (loadingLocal) {
    return (
      <div className="settings-panel-content">
        <p className="settings-loading">Loading device settings...</p>
      </div>
    );
  }

  return (
    <>

      {/* Toggle for "Use Device Specific Settings" */}
      <div className="section-container">
        <div className="form-group">
          <div className="checkbox-container">
              <span className="checkbox-label">
                <p className="section-help">
                  {useDeviceSettings
                    ? "Device-specific settings are active. Changes made here will override global settings."
                    : "Device-specific settings are currently disabled. This device is using global settings (read-only mode). Enable this to allow customization of settings for this device."}
                </p>
                <h4 className="settings-group-title">Use Device Specific Settings -- (ID: {deviceId ? deviceId.substring(0, 8) + '...' : 'N/A'})</h4>
              </span>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  className="checkbox-base"
                  checked={useDeviceSettings}
                  onChange={(e) => handleUseDeviceSettingsToggle(e.target.checked)}
                />
              </label>
          </div>
        </div>
      </div>

      

        {Object.entries(groupedSettings).map(([groupName, settingsInGroup]) => (
          <div key={groupName} className="section-container">
            <h4 className="settings-group-title">{groupName}</h4>
            {settingsInGroup.map((setting) => (
              <div key={setting.id} className="form-group">
                {(() => { // eslint-disable-line no-unused-vars
                  const isDisabled = !useDeviceSettings || setting.admin_only;
                  const commonProps = {
                    label: setting.display_name || setting.name.replace(/_/g, ' '),
                    disabled: isDisabled
                  };

                  switch (setting.input_type) {
                    case 'switch':
                      return (
                        <div className="checkbox-container">
                            <span className="checkbox-label">
                                {commonProps.label}
                            </span>
                            <label className="checkbox-label">
                                <input type="checkbox"
                                    className='checkbox-base'
                                    checked={switchStates[setting.name] || false}
                                    disabled={commonProps.disabled}
                                    onChange={
                                      setting.name === 'left_enabled' || setting.name === 'right_enabled'
                                        ? handleNavToggle(setting.name)
                                        : handleBooleanToggle(setting.name)
                                    } />
                            </label>
                        </div>
                      );
                    case 'number':
                      return (
                        <>
                          <label htmlFor={`device-${setting.name}`} className="form-label">
                            {commonProps.label}
                          </label>
                          <input
                            type="text"
                            pattern="[0-9]*\.?[0-9]*"
                            id={`device-${setting.name}`}
                            value={numberInputStates[setting.name] || ''}
                            onChange={handleNumberInputChange(setting.name)}
                            onBlur={handleNumberInputBlur(setting.name)}
                            className="form-input-base"
                            disabled={commonProps.disabled}
                          />
                        </>
                      );
                    case 'text':
                    default:
                      return (
                        <>
                          <label htmlFor={`device-${setting.name}`} className="form-label">
                            {commonProps.label}
                          </label>
                          <input
                            type="text"
                            id={`device-${setting.name}`}
                            value={textInputStates[setting.name] || ''}
                            onChange={handleTextInputChange(setting.name)}
                            onBlur={handleTextInputBlur(setting.name)}
                            className="form-input-base"
                            disabled={commonProps.disabled}
                          />
                        </>
                      );
                  }
                })()}
              </div>
            ))}
          </div>
        ))}
    </>
  );
}

export default DeviceSpecificSettingsForm;
