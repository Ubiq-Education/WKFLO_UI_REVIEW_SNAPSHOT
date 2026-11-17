import React, { useState, useRef, useEffect, useContext } from 'react';
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { Secret } from "@shared/schema";
import useAuth from '@/hooks/use-auth';
import { DataContext } from '@shared/models/chat-models';

interface InputWithVariablesProps extends React.InputHTMLAttributes<HTMLInputElement> {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  inputs?: Record<string, any>;
  onValueChange?: (value: string) => void;
  dataField?: string;
}

export function InputWithVariables({
  value,
  onChange,
  inputs = {},
  className,
  onValueChange,
  dataField,
  ...props
}: InputWithVariablesProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const [cursorPos, setCursorPos] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const token = useAuth();
  const context = useContext(DataContext);

  // Get available secrets
  const { data: secrets = [] } = useQuery<Secret[]>({
    queryKey: ['/md/api/v1/secrets', token, context.selectedTenantGuid],
    enabled: !!token && !!context.selectedTenantGuid,
  });

  // Combined variables (inputs + secrets)
  const variables = [
    // From inputs
    ...Object.keys(inputs).map(key => ({
      name: key,
      type: 'input',
      value: `{{${key}}}`
    })),
    
    // From secrets
    ...secrets.map(secret => ({
      name: secret.name,
      type: 'secret',
      value: `{{secrets_${secret.name}}}`
    }))
  ];

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    const newPos = e.target.selectionStart || 0;
    
    // Call the original onChange
    onChange(e);
    
    // Also call onValueChange if provided
    if (onValueChange) {
      onValueChange(newValue);
    }
    
    // Check if we should show dropdown
    const lastTwoChars = newValue.substring(Math.max(0, newPos - 2), newPos);
    
    if (lastTwoChars === '{{') {
      // Show dropdown with variables
      const rect = e.target.getBoundingClientRect();
      
      setDropdownPosition({
        top: rect.bottom + 5,
        left: rect.left + 10
      });
      
      setCursorPos(newPos);
      setShowDropdown(true);
    } else {
      setShowDropdown(false);
    }
  };
  
  const handleVariableSelect = (variableValue: string) => {
    if (!inputRef.current) return;
    
    const curVal = inputRef.current.value;
    const newValue = curVal.substring(0, cursorPos - 2) + variableValue + curVal.substring(cursorPos);
    
    // Update the input value
    if (onValueChange) {
      onValueChange(newValue);
    }
    
    // Create a synthetic event to trigger the original onChange
    const syntheticEvent = {
      target: { 
        ...inputRef.current,
        value: newValue 
      },
      currentTarget: inputRef.current
    } as React.ChangeEvent<HTMLInputElement>;
    
    onChange(syntheticEvent);
    
    // Hide dropdown
    setShowDropdown(false);
    
    // Focus back on input
    inputRef.current.focus();
  };
  
  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current && 
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        value={value}
        onChange={handleInputChange}
        className={className}
        data-field={dataField}
        {...props}
      />
      
      {showDropdown && variables.length > 0 && (
        <Card 
          ref={dropdownRef}
          className="absolute z-50 p-2 w-80 max-h-64 overflow-y-auto shadow-lg bg-white dark:bg-gray-900 border"
          style={{
            top: `${dropdownPosition.top}px`,
            left: `${dropdownPosition.left}px`,
          }}
        >
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
                .map((variable, index) => (
                  <div
                    key={`input-${variable.name}`}
                    className="px-3 py-1.5 text-sm rounded cursor-pointer flex items-center gap-2 hover:bg-gray-100"
                    onClick={() => handleVariableSelect(variable.value)}
                  >
                    <span className="text-blue-500">T</span>
                    <span>{variable.name}</span>
                    <span className="ml-auto text-gray-400 text-xs">String</span>
                  </div>
                ))
              }
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
                .map((variable, index) => (
                  <div
                    key={`secret-${variable.name}`}
                    className="px-3 py-1.5 text-sm rounded cursor-pointer flex items-center gap-2 hover:bg-gray-100"
                    onClick={() => handleVariableSelect(variable.value)}
                  >
                    <span className="text-rose-500">T</span>
                    <span>{variable.name}</span>
                    <span className="ml-auto text-gray-400 text-xs">String</span>
                  </div>
                ))
              }
            </>
          )}
        </Card>
      )}
    </div>
  );
}