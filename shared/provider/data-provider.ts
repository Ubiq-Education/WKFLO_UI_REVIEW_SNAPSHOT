import React, { useState, ReactNode } from 'react';
import { DataContext, initialState, IInitialState, IDataContext } from '../models/chat-models';
import { ChatMessagesProvider } from './chat-messages-provider';

interface DataProviderProps {
  children: ReactNode;
}

export const DataProvider: React.FC<DataProviderProps> = ({ children }) => {
  const [state, setState] = useState<IInitialState>(initialState);

  const updateState = (updates: Partial<IInitialState>) => {
    setState(prevState => ({ ...prevState, ...updates }));
  };

  const contextValue: IDataContext = {
    ...state,
    updateState
  };

  return (
    React.createElement(DataContext.Provider, { value: contextValue }, 
      React.createElement(ChatMessagesProvider, null, children)
    )
  );
};