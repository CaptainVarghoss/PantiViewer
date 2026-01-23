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
  const { deviceId } = useAuth();

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
    handleResetSetting,
    isAuthenticated,
  } = useSettingsFormLogic('device', deviceId);

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

        {Object.entries(groupedSettings).map(([groupName, settingsInGroup]) => (
          <div key={groupName} className="section-container">
            <h4 className="settings-group-title">{groupName}</h4>
            {settingsInGroup.map((setting) => (
              <div key={setting.id} className="form-group">
                {(() => { // eslint-disable-line no-unused-vars
                  const isDisabled = setting.admin_only;
                  const commonProps = {
                    label: setting.display_name || setting.name.replace(/_/g, ' '),
                    disabled: isDisabled
                  };

                  const renderResetButton = () => {
                    return (
                      <button 
                        className="btn-base btn-small btn-red" 
                        style={{marginLeft: '10px'}}
                        onClick={() => handleResetSetting(setting.name)}
                        title="Reset to global default"
                      >
                        Reset
                      </button>
                    );
                  };

                  switch (setting.input_type) {
                    case 'switch':
                      return (
                        <div className="checkbox-container">
                            <span className="checkbox-label">
                                {commonProps.label}
                            </span>
                            {renderResetButton()}
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
                            {renderResetButton()}
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
                            {renderResetButton()}
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
