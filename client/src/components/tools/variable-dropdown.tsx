import { useState, useEffect, useContext } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Secret } from "@shared/schema";
import useAuth from "@/hooks/use-auth";
import { DataContext } from '@shared/models/chat-models';

interface VariableDropdownProps {
  textareaValue: string;
  onInsertVariable: (value: string) => void;
  inputs?: Record<string, any>;
}

export function VariableDropdown({ 
  textareaValue, 
  onInsertVariable,
  inputs = {}
}: VariableDropdownProps) {
  const [open, setOpen] = useState(false);
  const token = useAuth();
  const context = useContext(DataContext);

  // Fetch secrets from API
  const { data: secrets = [] } = useQuery<Secret[]>({
    queryKey: ['/md/api/v1/secrets', token, context.selectedTenantGuid],
    enabled: !!token && !!context.selectedTenantGuid,
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          className="text-xs px-2 h-8"
        >
          <span className="flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 mr-1">
              <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline>
              <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path>
            </svg>
            Variables
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2">
        <div className="space-y-4">
          {/* Input variables section */}
          {Object.keys(inputs).length > 0 && (
            <div>
              <h3 className="text-sm font-medium mb-2 flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 mr-1 text-blue-500">
                  <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline>
                  <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path>
                </svg>
                Input Variables
              </h3>
              <ScrollArea className="h-32">
                <div className="space-y-1">
                  {Object.keys(inputs).map((key) => (
                    <Button
                      key={key}
                      variant="ghost"
                      className="w-full justify-start text-sm h-8 px-2"
                      onClick={() => {
                        onInsertVariable(`{{${key}}}`);
                        setOpen(false);
                      }}
                    >
                      <span className="text-blue-500 mr-2 font-mono">T</span>
                      {key}
                    </Button>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Secrets section */}
          {secrets.length > 0 && (
            <div>
              <h3 className="text-sm font-medium mb-2 flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 mr-1 text-rose-500">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
                Secrets
              </h3>
              <ScrollArea className="h-32">
                <div className="space-y-1">
                  {secrets.map((secret) => (
                    <Button
                      key={secret.id}
                      variant="ghost"
                      className="w-full justify-start text-sm h-8 px-2"
                      onClick={() => {
                        onInsertVariable(`{{secrets_${secret.name}}}`);
                        setOpen(false);
                      }}
                    >
                      <span className="text-rose-500 mr-2 font-mono">T</span>
                      {secret.name}
                    </Button>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}