import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import React, { useState, useContext } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, Trash2Icon, EyeIcon, EyeOffIcon, PencilIcon, Grid, List, KeyRound } from 'lucide-react';
import { config } from '@/lib/config';

// UI Components
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Switch } from '@/components/ui/switch';
import useAuth from '@/hooks/use-auth';
import { Secret } from '@/models/definitions';
import { DataContext } from '@shared/models/chat-models';
import { getTenantHeaders } from '@/lib/tenant-config';

// Create secret form model
interface SecretFormData {
  name: string;
  apiKey: string;
  isActive?: boolean;
}

// For updates, value can be optional
interface SecretUpdateData {
  name: string;
  apiKey?: string;
  isActive?: boolean;
}

enum ViewMode {
  Grid = "grid",
  List = "list",
}

export default function VaultPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [secret, setSecret] = useState<Secret | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingSecretId, setEditingSecretId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.Grid);
  const [formData, setFormData] = useState<SecretFormData>({
    name: '',
    apiKey: '',
    isActive: true,
  });
  const [showSecretValue, setShowSecretValue] = useState<{[key: number]: boolean}>({});
  const token = useAuth();
  const context = useContext(DataContext);

  // Query to fetch all secrets
  const { data: secrets = [], isLoading } = useQuery<Secret[]>({
    queryKey: ['/md/api/v1/secrets', token, context.selectedTenantGuid],
    enabled: !!token && !!context.selectedTenantGuid,
    refetchOnWindowFocus: false,
  });

  // Mutation to create a new secret
  const createMutation = useMutation({
    mutationFn: async (secret: SecretFormData) => {
      const response = await fetch(`${apiUrl}/md/api/v1/secret`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...getTenantHeaders()
        },
        body: JSON.stringify(secret),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || response.statusText);
      }
      
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/md/api/v1/secrets'] });
      queryClient.invalidateQueries({ queryKey: ['/md/api/v1/secrets/available'] });
      queryClient.invalidateQueries({ queryKey: [`/md/api/v1/secret/${secret?.id}`] });
      toast({
        title: "Secret Created",
        description: "Your API key has been securely stored in the vault.",
      });
      resetForm();
      closeDialog();
    },
    onError: (error) => {
      toast({
        title: "Error Creating Secret",
        description: error instanceof Error ? error.message : "An error occurred while storing your API key.",
        variant: "destructive",
      });
    },
  });

  const apiUrl = config.API_URL;

  // Mutation to update an existing secret
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number, data: SecretUpdateData }) => {
      const response = await fetch(`${apiUrl}/md/api/v1/secret/${id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...getTenantHeaders()
        },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || response.statusText);
      }
      
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/md/api/v1/secrets'] });
      queryClient.invalidateQueries({ queryKey: ['/md/api/v1/secrets/available'] });
      queryClient.invalidateQueries({ queryKey: [`/md/api/v1/secret/${secret?.id}`] });
      toast({
        title: "Secret Updated",
        description: "Your API key has been updated successfully.",
      });
      resetForm();
      closeDialog();
    },
    onError: (error) => {
      toast({
        title: "Error Updating Secret",
        description: error instanceof Error ? error.message : "An error occurred while updating the API key.",
        variant: "destructive",
      });
    },
  });

  // Mutation to delete a secret
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`${apiUrl}/md/api/v1/secret/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...getTenantHeaders()
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || response.statusText);
      }
      
      return;
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['/md/api/v1/secrets'] });
      queryClient.invalidateQueries({ queryKey: ['/md/api/v1/secrets/available'] });
      queryClient.invalidateQueries({ queryKey: [`/md/api/v1/secret/${id}`] });
      toast({
        title: "Secret Deleted",
        description: "The API key has been removed from your vault.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error Deleting Secret",
        description: error instanceof Error ? error.message : "An error occurred while deleting the API key.",
        variant: "destructive",
      });
    },
  });

  // Handle form input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  // Handle provider selection - ensure provider is correctly set in form data
  // const handleProviderChange = (value: string) => {
  //   console.log("Provider changed to:", value);
  //   setFormData({ ...formData, provider: value });
  // };


  // Reset form state
  const resetForm = () => {
    setFormData({
      name: '',
      //description: '',
      apiKey: '',
      //provider: '',
      isActive: true, // Default to active for new secrets
    });
    setIsEditMode(false);
    setEditingSecretId(null);
  };

  // Close dialog helper
  const closeDialog = () => {
    setIsDialogOpen(false);
  };

  // Handle opening the edit dialog
  const handleEdit = (secret: Secret) => {
    console.log("Editing secret:", secret);
    setSecret(secret);
    setFormData({
      name: secret.name,
      //description: secret.description || '',
      apiKey: secret.apiKey, // Don't populate the value for security reasons
      //provider: secret.provider || '',
      isActive: secret.isActive !== undefined ? secret.isActive : true, // Use existing value or default to true
    });
    setIsEditMode(true);
    setEditingSecretId(secret.id);
    setIsDialogOpen(true);
    
    // // Make sure the Select component for provider renders with the correct value
    // setTimeout(() => {
    //   const selectTrigger = document.querySelector(".select-trigger");
    //   if (selectTrigger) {
    //     console.log("Force updating select value to:", secret.provider);
    //   }
    // }, 100);
  };

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    console.log("Form data at submission:", formData);
    
    if (isEditMode && editingSecretId) {
      // Create update data object that makes value optional
      const updateData: SecretUpdateData = {
        name: formData.name,
        //description: formData.description,
        //provider: formData.provider || '', // Ensure provider is at least an empty string
        isActive: formData.isActive // Include the active status
      };
      
      // Only include the value if it was provided
      if (formData.apiKey) {
        updateData.apiKey = formData.apiKey;
      }
      
      console.log("Updating with data:", updateData);
      
      updateMutation.mutate({ 
        id: editingSecretId,
        data: updateData
      });
    } else {
      console.log("Creating with data:", formData);
      createMutation.mutate({
        ...formData,
        //provider: formData.provider || '', // Ensure provider is at least an empty string
        isActive: formData.isActive !== undefined ? formData.isActive : true // Default to active if not set
      });
    }
  };

  // Toggle visibility of a secret value
  const toggleSecretVisibility = (id: number) => {
    setShowSecretValue({
      ...showSecretValue,
      [id]: !showSecretValue[id]
    });
  };
  
  // Toggle active status of API key
  const toggleActiveStatus = (secret: Secret) => {
    updateMutation.mutate({ id: secret.id, data: { ...secret, isActive: !secret.isActive } });
  };

  // Handle delete confirmation
  const handleDelete = (id: number) => {
    deleteMutation.mutate(id);
  };

  // Format the secret value for display (show only partial)
  const formatSecretValue = (value: string, show: boolean) => {
    if (!value) return '••••••••'; // If no value, show masked placeholder
    if (show) return value; // Show full value when toggled
    if (value.length <= 8) return '••••••••';
    return value.substring(0, 4) + '••••••••' + value.substring(value.length - 4);
  };
  
  // Filter secrets based on search query
  const filteredSecrets = secrets?.filter((secret) => {
    if (searchQuery && !(
      secret.name.toLowerCase().includes(searchQuery.toLowerCase()) //||
      //(secret.description && secret.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
      //(secret.provider && secret.provider.toLowerCase().includes(searchQuery.toLowerCase()))
    )) {
      return false;
    }
    return true;
  });

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-secondary">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold">Vault</h1>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
            if (!open) {
              setIsDialogOpen(false);
            }
          }}>
          <DialogTrigger asChild>
            <Button onClick={() => {
              resetForm(); // Ensure form is reset when clicking Add API Key
              setIsDialogOpen(true);
            }}>
              <PlusIcon className="h-4 w-4 mr-2" />
              Add API Key
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{isEditMode ? 'Edit API Key' : 'Add New API Key'}</DialogTitle>
              <DialogDescription>
                {isEditMode 
                  ? 'Update your API key information. Leave the API Key field blank to keep the existing value.' 
                  : 'Store an API key securely in the vault. You can reference this key in agents and tools using the {{secrets_keyname}} syntax.'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="name" className="text-right">
                    Name
                  </Label>
                  <Input
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    className="col-span-3"
                    required
                    placeholder="openai_key"
                  />
                </div>
               
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="apiKey" className="text-right">
                    API Key
                  </Label>
                  <Input
                    id="apiKey"
                    name="apiKey"
                    type="password"
                    value={formData.apiKey}
                    onChange={handleInputChange}
                    className="col-span-3"
                    required={!isEditMode}
                    placeholder="sk-..."
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="isActive" className="text-right">
                    Active
                  </Label>
                  <div className="flex items-center col-span-3">
                    <Switch
                      id="isActive"
                      checked={formData.isActive !== undefined ? formData.isActive : true}
                      onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                    />
                    <span className="ml-2 text-sm text-muted-foreground">
                      {formData.isActive ? 'This API key is active and usable' : 'This API key is inactive'}
                    </span>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {createMutation.isPending || updateMutation.isPending 
                    ? "Saving..." 
                    : isEditMode ? "Update API Key" : "Save API Key"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <Input
          type="search"
          placeholder="Search API keys..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-sm"
        />
        
        <div className="flex items-center space-x-3">
          <span className="text-sm text-gray-500">View:</span>
          <Button 
            size="icon" 
            variant={viewMode === ViewMode.List ? "default" : "outline"}
            aria-label="List view"
            onClick={() => setViewMode(ViewMode.List)}
          >
            <List className="h-4 w-4" />
          </Button>
          <Button 
            size="icon" 
            variant={viewMode === ViewMode.Grid ? "default" : "outline"}
            aria-label="Grid view"
            onClick={() => setViewMode(ViewMode.Grid)}
          >
            <Grid className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="animate-pulse">Loading vault...</div>
        </div>
      ) : !filteredSecrets || filteredSecrets.length === 0 ? (
        <div className="text-center py-8">
          {searchQuery ? (
            <p className="text-muted-foreground mb-4">No API keys matching your search criteria.</p>
          ) : (
            <>
              <p className="text-muted-foreground mb-4">Your vault is empty. Add API keys to use in your agents and tools.</p>
              <Button onClick={() => setIsDialogOpen(true)}>
                <PlusIcon className="h-4 w-4 mr-2" />
                Add First API Key
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className={viewMode === ViewMode.Grid 
            ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            : "flex flex-col space-y-4"
          }>
          {filteredSecrets.map((secret: Secret) => (
            <Card key={secret.id} className={`hover:shadow-lg transition-shadow duration-200 p-6 ${viewMode === ViewMode.List ? "w-full" : ""} ${!secret.isActive ? 'opacity-70' : ''}`}>
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center">
                  <div className="w-10 h-10 rounded-lg bg-accent bg-opacity-10 flex items-center justify-center mr-3">
                    <KeyRound className="h-5 w-5 text-white" />
                  </div>
                  <h3 className="font-semibold">{secret.name}</h3>
                </div>
                <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
                  <Switch 
                    checked={secret.isActive !== undefined ? secret.isActive : true} 
                    aria-label={`Active: ${secret.name}`}
                    onCheckedChange={() => toggleActiveStatus(secret)}
                  />
                </div>
              </div>
              
              {/* {secret.description && (
                <p className="text-sm text-gray-500 mb-4 line-clamp-2">{secret.description}</p>
              )} */}
              
              <div className="flex items-center space-x-2 mb-4">
                <div className="font-mono text-sm bg-muted p-2 rounded w-full overflow-x-auto">
                  {formatSecretValue(secret.apiKey, showSecretValue[secret.id] || false)}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`${showSecretValue[secret.id] ? 'Hide' : 'Reveal'} ${secret.name}`}
                  onClick={() => toggleSecretVisibility(secret.id)}
                >
                  {showSecretValue[secret.id] ? (
                    <EyeOffIcon className="h-4 w-4" />
                  ) : (
                    <EyeIcon className="h-4 w-4" />
                  )}
                </Button>
              </div>
              
              <div className="flex justify-between items-center mt-6">
                {/* <div className="flex items-center">
                  {secret.provider && (
                    <div className="bg-blue-100 text-blue-800 text-xs px-2.5 py-1 rounded mr-2">
                      {secret.provider}
                    </div>
                  )}
                </div> */}
                <div className="flex space-x-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Edit ${secret.name}`}
                    onClick={() => handleEdit(secret)}
                  >
                    <PencilIcon className="h-4 w-4" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Delete"
                      >
                        <Trash2Icon className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete API Key</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete this API key? This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel asChild>
                          <Button variant="outline" type="button">Cancel</Button>
                        </AlertDialogCancel>
                        <AlertDialogAction asChild>
                          <Button variant="destructive" type="button" onClick={() => handleDelete(secret.id)}>
                            Delete
                          </Button>
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
              <div className="text-xs text-gray-500 mt-2">
                Created: {new Date(secret.createdOn).toLocaleDateString()}
              </div>
              
              <div className="flex justify-between items-center">
                <div className="font-mono text-xs text-gray-500">
                  {`{{secrets_${secret.name}}}`}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}