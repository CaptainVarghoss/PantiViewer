import React from 'react';
import * as MdIcons from 'react-icons/md'; // Import all icons
import { useFilterActions } from '../hooks/useFilterActions';

/**
 * Renders a list of filter buttons for a specific display location.
 *
 * @param {object} props - Component props.
 * @param {Array} props.filters - The list of all available filters.
 * @param {function} props.handleFilterToggle - The function to call when a filter button is clicked.
 * @param {number} props.displayLocation - The location to render buttons for (e.g., 1 for Top bar).
 */
function FilterButtons({ displayLocation}) {
    const { filters, handleFilterToggle } = useFilterActions();

    const filtersForLocation = filters.filter(f => f.header_display === displayLocation);

    if (filtersForLocation.length === 0) {
        return null;
    }

    return (
        <>
            {filtersForLocation.map(filter => {
                const isActive = filter.activeStageIndex > -1;
                const stageNames = ['main', 'second', 'third'];
                const activeStageName = isActive ? stageNames[filter.activeStageIndex] : 'main';

                const activeColorName = filter[`${activeStageName}_stage_color`];
                const activeIconName = filter[`${activeStageName}_stage_icon`];

                const IconComponent = activeIconName ? MdIcons[activeIconName] : null;

                return (
                    <li>
                        <button key={filter.id} className={`btn-base filter-menu-button ${isActive ? 'active' : ''} ${isActive && activeColorName ? activeColorName : ''}`} onClick={() => handleFilterToggle(filter.id)} title={filter.name}>
                            {IconComponent && <IconComponent size={20} />}
                        </button>
                    </li>
                );
            })}
        </>
    );
}

export default FilterButtons;