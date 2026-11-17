import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import React, { useState, useContext } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, Trash2Icon, PencilIcon, Grid, List, Brain, Tags, DollarSign } from 'lucide-react';
import { config } from '@/lib/config';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import useAuth from '@/hooks/use-auth';
import { AIModel } from '@/models/definitions';
import { DataContext } from '@shared/models/chat-models';
import { getTenantHeaders } from '@/lib/tenant-config';
import EntityTagsPanel from '@/components/tags/entity-tags-panel';

interface AIModelFormData {
  name: string;
  provider: string;
  endpoint: string;
  deploymentName: string;
  model: string;
  apiVersion: string
  type: string;
  secretId: number | null;
  authMode: 'apiKey' | 'managedIdentity';
  isActive?: boolean;
}


interface AIModelUpdateData {
  name: string;
  provider: string;
  endpoint: string;
  model: string;
  type: string;
  secretId: number | null;
  authMode: 'apiKey' | 'managedIdentity';
  isActive?: boolean;
}

enum ViewMode {
  Grid = "grid",
  List = "list",
}

export default function AIModelsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [model, setModel] = useState<AIModel | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingModelId, setEditingModelId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.Grid);
  const [taggingModelId, setTaggingModelId] = useState<number | null>(null);
  const [formData, setFormData] = useState<AIModelFormData>({
    name: '',
    provider: 'openai',
    endpoint: '',
    deploymentName: '',
    model: '',
    apiVersion: '',
    type: '',
    secretId: null,
    authMode: 'apiKey',
    isActive: true,
  });

  const token = useAuth();
  const context = useContext(DataContext);
  const apiUrl = config.API_URL;

  const { data: currentSecret = null } = useQuery<{ id: number; name: string }>({
    queryKey: [`/md/api/v1/secret/${model?.secretId}`, token, context.selectedTenantGuid],
    enabled: !!token && !!context.selectedTenantGuid && model !== null && model?.secretId !== null,
    refetchOnWindowFocus: false
  });

  // Fetch available secrets for secretId select
  const { data: availableSecrets = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ['/md/api/v1/secrets/available', token, context.selectedTenantGuid],
    enabled: !!token && !!context.selectedTenantGuid,
    refetchOnWindowFocus: false
  });
  

  const { data: models = [], isLoading } = useQuery<AIModel[]>({
    queryKey: ['/md/api/v1/ai-models', token, context.selectedTenantGuid],
    enabled: !!token && !!context.selectedTenantGuid,
    refetchOnWindowFocus: false
  });

  const createMutation = useMutation({
    mutationFn: async (model: AIModelFormData) => {
      const response = await fetch(`${apiUrl}/md/api/v1/ai-model`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...getTenantHeaders()
        },
        body: JSON.stringify(model),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || response.statusText);
      }
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/md/api/v1/ai-models'] });
      toast({ title: "Model Created", description: "AI Model has been added." });
      resetForm();
      closeDialog();
    },
    onError: (error) => {
      toast({ title: "Error Creating Model", description: error instanceof Error ? error.message : "An error occurred.", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number, data: AIModelUpdateData }) => {
      const response = await fetch(`${apiUrl}/md/api/v1/ai-model/${id}`, {
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
      queryClient.invalidateQueries({ queryKey: ['/md/api/v1/ai-models'] });
      toast({ title: "Model Updated", description: "AI Model has been updated." });
      resetForm();
      closeDialog();
    },
    onError: (error) => {
      toast({ title: "Error Updating Model", description: error instanceof Error ? error.message : "An error occurred.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`${apiUrl}/md/api/v1/ai-model/${id}`, {
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/md/api/v1/ai-models'] });
      toast({ title: "Model Deleted", description: "AI Model has been removed." });
    },
    onError: (error) => {
      toast({ title: "Error Deleting Model", description: error instanceof Error ? error.message : "An error occurred.", variant: "destructive" });
    },
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const resetForm = () => {
    setFormData({ name: '', provider: 'azure', endpoint: '', deploymentName: '', model: '', apiVersion: '', type: '', secretId: null, authMode: 'apiKey', isActive: true });
    setIsEditMode(false);
    setEditingModelId(null);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
  };

  const handleEdit = (model: AIModel) => {
    setModel(model);
    queryClient.invalidateQueries({ queryKey: ['/md/api/v1/secrets/available'] });
    setFormData({
      name: model.name,
      provider: model.provider,
      endpoint: model.endpoint,
      deploymentName: model.deploymentName,
      model: model.model,
      apiVersion: model.apiVersion,
      type: model.type,
      secretId: model.secretId ?? null,
      authMode: model.authMode ?? 'apiKey',
      isActive: model.isActive !== undefined ? model.isActive : true
    });
    setIsEditMode(true);
    setEditingModelId(model.id);
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.provider === 'azure' && formData.authMode !== 'managedIdentity' && formData.secretId === null) {
      toast({ title: "Secret Required", description: "Please select a linked secret, or switch to Managed Identity authentication.", variant: "destructive" });
      return;
    }
    if (isEditMode && editingModelId) {
      updateMutation.mutate({ id: editingModelId, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const toggleActiveStatus = (model: AIModel) => {
    updateMutation.mutate({ id: model.id, data: { ...model, authMode: model.authMode ?? 'apiKey', isActive: !model.isActive } });
  };

  const handleDelete = (id: number) => {
    deleteMutation.mutate(id);
  };

  const filteredModels = models?.filter((model) => {
    if (searchQuery && !(
      model.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      model.provider.toLowerCase().includes(searchQuery.toLowerCase())
    )) {
      return false;
    }
    return true;
  });

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-secondary">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold">AI Models</h1>
        <Dialog open={isDialogOpen} onOpenChange={(open: boolean) => { if (!open) setIsDialogOpen(false); }}>
          <DialogTrigger asChild>
            <Button onClick={() => { resetForm(); setIsDialogOpen(true); }}>
              <PlusIcon className="h-4 w-4 mr-2" />
              Add Model
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{isEditMode ? 'Edit Model' : 'Add New Model'}</DialogTitle>
              <DialogDescription>
                {isEditMode ? 'Update your AI model information.' : 'Add a new AI model to your workspace.'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="name" className="text-right">Name</Label>
                  <Input id="name" name="name" value={formData.name} onChange={handleInputChange} className="col-span-3" required placeholder="gpt-4" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="provider" className="text-right">Provider</Label>
                  <Select
                    value={formData.provider}
                    onValueChange={(value) => setFormData({ ...formData, provider: value })}
                  >
                    <SelectTrigger id="provider" className="col-span-3">
                      <SelectValue placeholder="Select provider" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="openai">OpenAI</SelectItem>
                      <SelectItem value="azure">Azure OpenAI</SelectItem>
                      <SelectItem value="google">Google AI</SelectItem>
                      <SelectItem value="anthropic">Anthropic</SelectItem>
                      {/* <SelectItem value="cohere">Cohere</SelectItem> */}
                    </SelectContent>
                  </Select>
                </div>
                {formData.provider === 'azure' && (
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="authMode" className="text-right">Authentication</Label>
                    <Select
                      value={formData.authMode}
                      onValueChange={(value: 'apiKey' | 'managedIdentity') => setFormData({
                        ...formData,
                        authMode: value,
                        secretId: value === 'managedIdentity' ? null : formData.secretId,
                      })}
                    >
                      <SelectTrigger id="authMode" className="col-span-3">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="apiKey">API Key</SelectItem>
                        <SelectItem value="managedIdentity">Azure Managed Identity</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {!(formData.provider === 'azure' && formData.authMode === 'managedIdentity') && (
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="secretId" className="text-right">Linked Secret</Label>
                    <Select
                      value={formData.secretId !== null ? String(formData.secretId) : ''}
                      onValueChange={value => setFormData({ ...formData, secretId: value ? Number(value) : null })}
                    >
                      <SelectTrigger id="secretId" className="col-span-3">
                        <SelectValue placeholder="Select a secret to link (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="null">None</SelectItem>
                        {[currentSecret,...availableSecrets].filter(m => m != null).map(secret => (
                          <SelectItem key={secret.id} value={String(secret.id)}>{secret.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {formData.provider === 'azure' && formData.authMode === 'managedIdentity' && (
                  <div className="grid grid-cols-4 items-center gap-4">
                    <div className="col-start-2 col-span-3">
                      <p className="text-xs text-gray-500">
                        Not required — this model will authenticate using the service's managed identity
                      </p>
                    </div>
                  </div>
                )}
                {formData.provider === 'azure' && (
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="endpoint" className="text-right">Endpoint</Label>
                    <Input id="endpoint" name="endpoint" value={formData.endpoint} onChange={handleInputChange} className="col-span-3" required placeholder="https://your-azure-endpoint.openai.azure.com/" />
                  </div>
                )}
                {formData.provider === 'azure' && (
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="deploymentName" className="text-right">Deployment Name</Label>
                    <Input id="deploymentName" name="deploymentName" value={formData.deploymentName} onChange={handleInputChange} className="col-span-3" required placeholder="your-deployment-name" />
                  </div>
                )}
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="model" className="text-right">Model</Label>
                  <Input id="model" name="model" value={formData.model} onChange={handleInputChange} className="col-span-3" required placeholder="gpt-4, gpt-35-turbo, llama-2, etc." />
                </div>
                {formData.provider === 'azure' && (
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="apiVersion" className="text-right">API Version</Label>
                    <Input id="apiVersion" name="apiVersion" value={formData.apiVersion} onChange={handleInputChange} className="col-span-3" required placeholder="your-api-version" />
                  </div>
                )}
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="type"  className="text-right">Type *</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(value) => setFormData({ ...formData, type: value })}
                  >
                    <SelectTrigger id="type" className="col-span-3">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">Text</SelectItem>
                      <SelectItem value="chat">Chat</SelectItem>
                      <SelectItem value="reasoning">Reasoning</SelectItem>
                      <SelectItem value="vision">Vision</SelectItem>
                      <SelectItem value="analytics">Analytics</SelectItem>
                    </SelectContent>
                  </Select>
                </div>




                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="isActive" className="text-right">Active</Label>
                  <div className="flex items-center col-span-3">
                    <Switch id="isActive" checked={formData.isActive !== undefined ? formData.isActive : true} onCheckedChange={(checked: boolean) => setFormData({ ...formData, isActive: checked })} />
                    <span className="ml-2 text-sm text-muted-foreground">{formData.isActive ? 'This model is active' : 'This model is inactive'}</span>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {createMutation.isPending || updateMutation.isPending ? "Saving..." : isEditMode ? "Update Model" : "Save Model"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <Input type="search" placeholder="Search models..." value={searchQuery} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)} className="max-w-sm" />
        <div className="flex items-center space-x-3">
          <span className="text-sm text-gray-500">View:</span>
          <Button size="icon" variant={viewMode === ViewMode.List ? "default" : "outline"} onClick={() => setViewMode(ViewMode.List)} aria-label="List view" aria-pressed={viewMode === ViewMode.List}><List className="h-4 w-4" /></Button>
          <Button size="icon" variant={viewMode === ViewMode.Grid ? "default" : "outline"} onClick={() => setViewMode(ViewMode.Grid)} aria-label="Grid view" aria-pressed={viewMode === ViewMode.Grid}><Grid className="h-4 w-4" /></Button>
        </div>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-8"><div className="animate-pulse">Loading models...</div></div>
      ) : !filteredModels || filteredModels.length === 0 ? (
        <div className="text-center py-8">
          {searchQuery ? (
            <p className="text-muted-foreground mb-4">No models matching your search criteria.</p>
          ) : (
            <>
              <p className="text-muted-foreground mb-4">No AI models found. Add a model to get started.</p>
              <Button onClick={() => setIsDialogOpen(true)}><PlusIcon className="h-4 w-4 mr-2" />Add First Model</Button>
            </>
          )}
        </div>
      ) : (
        <div className={viewMode === ViewMode.Grid ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" : "flex flex-col space-y-4"}>
          {filteredModels.map((model: AIModel) => (
            <Card key={model.id} className={`hover:shadow-lg transition-shadow duration-200 p-6 ${viewMode === ViewMode.List ? "w-full" : ""} ${!model.isActive ? 'opacity-70' : ''}`}>
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center">
                  <div className="w-10 h-10 rounded-lg bg-accent bg-opacity-10 flex items-center justify-center mr-3">
                    <Brain className="h-5 w-5 text-white" />
                  </div>
                  <h3 className="font-semibold">{model.name}</h3>
                </div>
                <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
                  <Switch checked={model.isActive !== undefined ? model.isActive : true} onCheckedChange={() => toggleActiveStatus(model)} aria-label={`Toggle ${model.name} active`} />
                </div>
              </div>
              <div className="text-sm text-gray-700 mb-2 flex items-center gap-2">
                <span>Provider: {model.provider}</span>
                {model.provider === 'azure' && (
                  <Badge variant="outline" className={model.authMode === 'managedIdentity' ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-800"}>
                    {model.authMode === 'managedIdentity' ? 'Managed Identity' : 'API Key'}
                  </Badge>
                )}
              </div>
              {model.provider === 'azure' && (
                <div className="text-sm text-gray-700 mb-2">Endpoint: {model.endpoint}</div>
              )}
              <div className="text-sm text-gray-700 mb-2">Model: {model.model}</div>
              <div className="text-sm text-gray-700 mb-2">Type: {model.type}</div>
              {(model.tags?.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-1 mt-3">
                  {model.tags!.slice(0, 3).map((tag) => (
                    <span
                      key={tag.id}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs border bg-white"
                      style={tag.color ? { borderColor: tag.color } : { borderColor: "#e5e7eb" }}
                    >
                      {tag.color && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />}
                      {tag.name}
                    </span>
                  ))}
                  {model.tags!.length > 3 && (
                    <span className="text-xs text-muted-foreground self-center">+{model.tags!.length - 3}</span>
                  )}
                </div>
              )}
              <div className="flex justify-between items-center mt-6">
                <div className="flex space-x-2">
                  <Button variant="ghost" size="icon" onClick={() => handleEdit(model)} title="Edit Model"><PencilIcon className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => setTaggingModelId(model.id)} title="Manage Tags"><Tags className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => navigate(`/aimodels/${model.id}/ai-credit`)} title="AI Credit"><DollarSign className="h-4 w-4" /></Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label="Delete">
                        <Trash2Icon className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Model</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete this model? This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel asChild>
                          <Button variant="outline" type="button">Cancel</Button>
                        </AlertDialogCancel>
                        <AlertDialogAction asChild>
                          <Button variant="destructive" type="button" onClick={() => handleDelete(model.id)}>
                            Delete
                          </Button>
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
              <div className="text-xs text-gray-500 mt-2">Created: {new Date(model.createdOn).toLocaleDateString()}</div>
            </Card>
          ))}
        </div>
      )}

      {/* Tags management dialog */}
      <Dialog
        open={taggingModelId !== null}
        onOpenChange={(open) => { if (!open) setTaggingModelId(null); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage Tags</DialogTitle>
            <DialogDescription>
              Assign or remove tags for this AI model.
            </DialogDescription>
          </DialogHeader>
          {taggingModelId !== null && (
            <EntityTagsPanel entityType="AIModel" entityId={taggingModelId} />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTaggingModelId(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
