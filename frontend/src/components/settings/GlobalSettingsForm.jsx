import React from 'react';
import useSettingsFormLogic from '../../hooks/useSettingsFormLogic'; // Import the new hook

/**
 * Component for managing global application settings.
 * This component is only accessible to admin users.
 * Now refactored to use `useSettingsFormLogic` hook.
 *
 * @param {object} props - Component props.
 */
function GlobalSettingsForm() {
  const {
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
    isAuthenticated,
    isAdmin
  } = useSettingsFormLogic('global'); // Specify 'global' form type

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
        <p className="settings-loading">Loading global settings...</p>
      </div>
    );
  }

  if (!isAuthenticated || !isAdmin) {
      return (
          <div className="settings-panel-content">
              <p className="settings-message error">{error || "Access Denied: You must be an administrator to view and edit global settings."}</p>
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
              {(() => {
                const commonProps = {
                  label: `${setting.display_name || setting.name.replace(/_/g, ' ')}`,
                  disabled: setting.admin_only && !isAdmin, // Global settings might be admin_only
                  description: setting.description,
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
                        <label htmlFor={`global-${setting.name}`} className="form-label">
                          {commonProps.label}
                        </label>
                        <input
                          type="text"
                          pattern="[0-9]*\.?[0-9]*"
                          id={`global-${setting.name}`}
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
                        <label htmlFor={`global-${setting.name}`} className="form-label">
                          {commonProps.label}
                        </label>
                        <input
                          type="text"
                          id={`global-${setting.name}`}
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

export default GlobalSettingsForm;