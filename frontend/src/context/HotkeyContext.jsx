import React, { createContext, useState, useContext } from 'react';

const HotkeyContext = createContext();

export const useHotkeyContext = () => useContext(HotkeyContext);

export const HotkeyProvider = ({ children }) => {
  const [contextStack, setContextStack] = useState(['grid']); // Default with 'grid'

  const pushContext = (context) => {
    setContextStack(prevStack => [...prevStack, context]);
  };

  const popContext = () => {
    setContextStack(prevStack => {
      if (prevStack.length > 1) {
        return prevStack.slice(0, -1);
      }
      return prevStack; // Keep at least one context in the stack
    });
  };

  const value = {
    activeContext: contextStack[contextStack.length - 1],
    pushContext,
    popContext,
    // For backward compatibility or simple cases, you can keep a way to set the root context
    setActiveContext: (context) => setContextStack([context]),
  };

  return (
    <HotkeyContext.Provider value={value}>
      {children}
    </HotkeyContext.Provider>
  );
};