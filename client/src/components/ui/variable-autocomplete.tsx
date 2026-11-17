import React, { useState, useEffect, useRef, useContext } from 'react';
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Secret } from "@shared/schema";
import useAuth from '@/hooks/use-auth';
import { DataContext } from '@shared/models/chat-models';

interface VariableAutocompleteProps {
  inputString: string;
  onSelect: (variable: string) => void;
  position: { top: number; left: number };
  inputs?: Record<string, any>;
  textAreaRef: React.RefObject<HTMLTextAreaElement | HTMLInputElement>;
}

export default function VariableAutocomplete({ 
  inputString, 
  onSelect, 
  position, 
  inputs = {},
  textAreaRef
}: VariableAutocompleteProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const token = useAuth();
  
  const context = useContext(DataContext);

  // Fetch secrets
  const { data: secrets = [] } = useQuery<Secret[]>({
    queryKey: ['/md/api/v1/secrets', token, context.selectedTenantGuid],
    enabled: !!token && !!context.selectedTenantGuid,
  });
  
  // Combine inputs and secrets
  const variables: { name: string; type: string; value: string }[] = [
    // Add inputs
    ...Object.entries(inputs).map(([key, value]) => ({
      name: key,
      type: 'input',
      value: `{{${key}}}`
    })),
    
    // Add secrets
    ...secrets.map((secret) => ({
      name: secret.name,
      type: 'secret',
      value: `{{secrets_${secret.name}}}`
    }))
  ];

  useEffect(() => {
    // Reset selection when dropdown opens
    setSelectedIndex(0);
    
    // Add keyboard event listeners for navigation
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!variables.length) return;
      
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => (prev + 1) % variables.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => (prev - 1 + variables.length) % variables.length);
          break;
        case 'Enter':
          e.preventDefault();
          if (variables[selectedIndex]) {
            onSelect(variables[selectedIndex].value);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onSelect('');
          break;
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [variables, selectedIndex, onSelect]);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node) && 
          textAreaRef.current && !textAreaRef.current.contains(event.target as Node)) {
        onSelect('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [dropdownRef, onSelect, textAreaRef]);

  if (variables.length === 0) {
    return null;
  }

  return (
    <Card 
      ref={dropdownRef}
      className="fixed z-50 p-2 w-80 max-h-64 overflow-y-auto shadow-lg bg-white dark:bg-gray-900 border"
      style={{ 
        top: `${position.top}px`, 
        left: `${position.left}px`,
      }}
    >
      <div className="flex flex-col space-y-1">
        {/* Inputs section */}
        {variables.filter(v => v.type === 'input').length > 0 && (
          <>
            <div className="text-sm font-semibold text-gray-500 pl-2 py-1">
              <span className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline>
                  <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path>
                </svg>
                Inputs
              </span>
            </div>
            {variables
              .filter(v => v.type === 'input')
              .map((variable, index) => {
                const isSelected = variables.indexOf(variable) === selectedIndex;
                return (
                  <div
                    key={`input-${variable.name}`}
                    className={`px-3 py-1.5 text-sm rounded cursor-pointer flex items-center gap-2 ${
                      isSelected ? 'bg-primary/10 text-primary' : 'hover:bg-gray-100'
                    }`}
                    onClick={() => onSelect(variable.value)}
                  >
                    <span className="text-blue-500">T</span>
                    <span>{variable.name}</span>
                    <span className="ml-auto text-gray-400 text-xs">String</span>
                  </div>
                );
              })}
          </>
        )}

        {/* Secrets section */}
        {variables.filter(v => v.type === 'secret').length > 0 && (
          <>
            <div className="text-sm font-semibold text-gray-500 pl-2 py-1 mt-2">
              <span className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
                Secrets
              </span>
            </div>
            {variables
              .filter(v => v.type === 'secret')
              .map((variable, index) => {
                const isSelected = variables.indexOf(variable) === selectedIndex;
                return (
                  <div
                    key={`secret-${variable.name}`}
                    className={`px-3 py-1.5 text-sm rounded cursor-pointer flex items-center gap-2 ${
                      isSelected ? 'bg-primary/10 text-primary' : 'hover:bg-gray-100'
                    }`}
                    onClick={() => onSelect(variable.value)}
                  >
                    <span className="text-rose-500">T</span>
                    <span>{variable.name}</span>
                    <span className="ml-auto text-gray-400 text-xs">String</span>
                  </div>
                );
              })}
          </>
        )}
      </div>
    </Card>
  );
}