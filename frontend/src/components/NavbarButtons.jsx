import React from 'react';
import FilterButtons from './FilterButtons';


function NavbarButtons({
    toggleNavOpen,
    navOpen,
}) {

    return (
        <>
            <li>
                <button onClick={toggleNavOpen} className="btn-base btn-primary" title={navOpen ? "Close Menu" : "Open Menu"}>
                    {navOpen ? (
                        <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor"><path d="m296-224-56-56 240-240 240 240-56 56-184-183-184 183Zm0-240-56-56 240-240 240 240-56 56-184-183-184 183Z"/></svg>
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M480-200 240-440l56-56 184 183 184-183 56 56-240 240Zm0-240L240-680l56-56 184 183 184-183 56 56-240 240Z"/></svg>
                    )}
                </button>
            </li>
            <FilterButtons displayLocation={1} />
        </>
    );
}

export default NavbarButtons;