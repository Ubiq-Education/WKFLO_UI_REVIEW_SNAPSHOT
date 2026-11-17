import React, { useState, useRef, useContext } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from "@/lib/queryClient";
import { config } from '@/lib/config';
import { Trash2, Search, FileText, AlertCircle, FilePlus2, FileCode, Download, Trash } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import DocumentUploader from './document-uploader';
import useAuth from '@/hooks/use-auth';
import { saveAs } from "file-saver";
import { X } from 'lucide-react'; // Add this import if not present
import { getTenantHeaders } from '@/lib/tenant-config';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { DataContext } from '@shared/models/chat-models';

interface Document {
  id: string;
  fileName: string;
  tags?: string[];
  blobUrl?: string;
}

interface QueryResult {
  text: string;
  source: string;
  similarity: number;
}

const KnowledgePage: React.FC = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [activeTab, setActiveTab] = useState('documents');
  const [queryDialogOpen, setQueryDialogOpen] = useState(false);
  const [queryText, setQueryText] = useState('');
  const [queryResults, setQueryResults] = useState<QueryResult[]>([]);
  const [isQuerying, setIsQuerying] = useState(false);
  const [searchTags, setSearchTags] = useState<string[]>([]);
  const token = useAuth();
  const apiUrl = config.API_URL;
  const tenantHeaders = getTenantHeaders();
    
  const headers: Record<string, string> = {
    ...tenantHeaders,
  };

  const context = useContext(DataContext);
  
  // Fetch all documents
  const { data: documents = [], isLoading, error } = useQuery<Document[]>({
      queryKey: ["/md/api/v1/tenant/knowledge", token, context.selectedTenantGuid],
      enabled: !!token && !!context.selectedTenantGuid
    });
  
  const updateTagsMutation = useMutation({
    mutationFn: async ({ docId, tags }: { docId: string; tags: string[] }) => {
      const response = await apiRequest("PUT", `/md/api/v1/tenant/knowledge/${encodeURIComponent(docId)}/tags`, { tags }, token);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/md/api/v1/tenant/knowledge'] });
      toast({ title: 'Tags updated', description: 'Document tags updated.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Tag update failed', description: error.message, variant: 'destructive' });
    },
  });

  // // Upload mutation
  // const uploadMutation = useMutation({
  //   mutationFn: async (formData: FormData) => {
  //     setIsUploading(true); 
  //     setUploadProgress(10);
      
  //     const interval = setInterval(() => {
  //       setUploadProgress(prev => Math.min(prev + 5, 90));
  //     }, 500);
      
  //     try {
  //       const response = await fetch(`${apiUrl}/md/api/v1/tenant/knowledge/uploader`, {
  //         method: 'POST',
  //         body: formData,
  //       });
        
  //       clearInterval(interval);
        
  //       if (!response.ok) {
  //         const errorData = await response.json().catch(() => ({}));
  //         throw new Error(errorData.message || 'Upload failed');
  //       }
        
  //       setUploadProgress(100);
  //       return await response.json();
  //     } catch (error) {
  //       clearInterval(interval);
  //       setUploadProgress(0);
  //       throw error;
  //     } finally {
  //       setTimeout(() => {
  //         setIsUploading(false);
  //         setUploadProgress(0);
  //       }, 1000);
  //     }
  //   },
  //   onSuccess: () => {
  //     toast({
  //       title: 'Document uploaded',
  //       description: 'Your document has been processed and is now available for use',
  //     });
      
  //     queryClient.invalidateQueries({ queryKey: ['/md/api/v1/tenant/knowledge'] });
  //   },
  //   onError: (error: Error) => {
  //     toast({
  //       title: 'Upload failed',
  //       description: error.message || 'There was an error uploading your document',
  //       variant: 'destructive',
  //     });
  //   },
  // });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (doc: Document) => {
      // Show confirmation toast
      toast({
        title: 'Deleting document...',
        description: `Removing ${doc.fileName} from your knowledge base`,
      });
      
      // Execute the delete API call
      const response = await apiRequest("DELETE", `/md/api/v1/tenant/knowledge/${encodeURIComponent(doc.id)}`, {}, token);
      return response.json();
    },
    onSuccess: async () => {
      toast({
        title: 'Document deleted',
        description: 'The document has been removed from your knowledge base',
      });
      
      // Invalidate and refetch documents
      queryClient.invalidateQueries({ queryKey: ['/md/api/v1/tenant/knowledge'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Delete failed',
        description: error.message || 'There was an error deleting your document',
        variant: 'destructive',
      });
    },
  });

  // Document query mutation
  const queryMutation = useMutation({
    mutationFn: async (query: string) => {
      setIsQuerying(true);
      try {
        const response = await apiRequest("POST", '/md/api/v1/tenant/knowledge/query', { query, tags: searchTags, limit: 5 }, token);
        return response.json();
      } finally {
        setIsQuerying(false);
      }
    },
    onSuccess: (result) => {
      setQueryResults((result)?.data || []);
    },
    onError: (error: Error) => {
      toast({
        title: 'Query failed',
        description: error.message || 'There was an error querying your knowledge base',
        variant: 'destructive',
      });
    },
  });

  // const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
  //   const file = event.target.files?.[0];
  //   if (!file) return;

  //   const formData = new FormData();
  //   formData.append('file', file);
  //   uploadMutation.mutate(formData);
  // };

  const handleQuerySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (queryText.trim()) {
      queryMutation.mutate(queryText);
    }
  };

  const handleDownload = async (docId: string, fileName: string) => {
    try {
      const response = await fetch(
        apiUrl + `/md/api/v1/tenant/knowledge/download/${encodeURIComponent(docId)}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token as string}`,
            ...getTenantHeaders()
          }
        }
      );
      if (!response.ok) throw new Error("Download failed");
      const blob = await response.blob();
      saveAs(blob, fileName);
    } catch (error) {
      toast({
        title: "Download failed",
        description: error instanceof Error ? error.message : "Could not download file.",
        variant: "destructive",
      });
    }
  };

  const getFileIcon = (filename: string) => {
    const extension = filename.split('.').pop()?.toLowerCase();
    
    switch(extension) {
      case 'pdf':
        return <img src="/assets/pdf_icon.png" alt="PDF" className="h-full w-full object-contain" />;
      case 'doc':
      case 'docx':
        return <img src="/assets/word_icon.png" alt="Word" className="h-full w-full object-contain" />;
      case 'xls':
      case 'xlsx':
      case 'csv':
        return <img src="/assets/excel_icon.png" alt="Excel" className="h-full w-full object-contain" />;
      case 'ppt':
      case 'pptx':
        return <FilePlus2 className="h-5 w-5 text-orange-500" />;
      case 'js':
      case 'ts':
      case 'json':
      case 'html':
      case 'css':
      case 'md':
        return <FileCode className="h-5 w-5 text-purple-600" />;
      default:
        return <FileText className="h-full w-full text-white mr-1 ml-1" />;
    }
  };

  // Formatting similarity score as percentage
  const formatSimilarity = (score: number) => {
    return `${Math.round(score * 100)}%`;
  };

  // Track tags and input for each document by id
  const [tagsById, setTagsById] = useState<Record<string, string[]>>({});
  const [tagInputById, setTagInputById] = useState<Record<string, string>>({});

  // Initialize tags state when documents change
  React.useEffect(() => {
    if (documents && documents.length > 0) {
      const tagsInit: Record<string, string[]> = {};
      const inputInit: Record<string, string> = {};
      documents.forEach(doc => {
        tagsInit[doc.id] = doc.tags || [];
        inputInit[doc.id] = '';
      });
      setTagsById(tagsInit);
      setTagInputById(inputInit);
    }
  }, [documents]);

  const handleTagRemove = (docId: string, idx: number) => {
    const newTags = tagsById[docId].filter((_, i) => i !== idx);
    setTagsById(prev => ({ ...prev, [docId]: newTags }));
    updateTagsMutation.mutate({ docId, tags: newTags });
  };

  const handleTagAdd = (docId: string, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && tagInputById[docId].trim()) {
      const newTags = [...tagsById[docId], tagInputById[docId].trim()];
      setTagsById(prev => ({ ...prev, [docId]: newTags }));
      setTagInputById(prev => ({ ...prev, [docId]: '' }));
      updateTagsMutation.mutate({ docId, tags: newTags });
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-secondary">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold">Knowledge Management</h1>
      </div>
      <p className="text-gray-500 mb-6">
        Upload and manage documents that your AI agents can reference for more knowledgeable responses.
      </p>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="documents">Document Library</TabsTrigger>
          <TabsTrigger value="search">Knowledge Search</TabsTrigger>
          <TabsTrigger value="document-uploader">Document Uploader</TabsTrigger>
        </TabsList>

        <TabsContent value="documents" className="space-y-4">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold">Document Library</h2>
            <div>
              <Button 
                variant="outline"
                onClick={() => setActiveTab('document-uploader')}
              >
                <FileText className="h-4 w-4 mr-2" />
                View Upload Options
              </Button>
            </div>
          </div>

          {isUploading && (
            <Card className="mb-4">
              <CardContent className="pt-6">
                <div className="mb-2 text-sm font-medium">Uploading document...</div>
                <Progress value={uploadProgress} className="h-2" />
              </CardContent>
            </Card>
          )}

          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>
                Failed to load documents. Please try again.
              </AlertDescription>
            </Alert>
          )}

          {!isLoading && documents.length === 0 && (
            <Card>
              <CardContent className="pt-6 pb-6 flex flex-col items-center justify-center text-center text-gray-500">
                <FileText className="h-12 w-12 mb-4 opacity-30" />
                <p className="mb-4">No documents in your knowledge base yet.</p>
                <Button
                  variant="outline"
                  onClick={() => setActiveTab('document-uploader')}
                >
                  Go to Upload Section
                </Button>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {documents.map((doc: Document, index: number) => (
              <Card key={doc.fileName + "_" + index } className="hover:shadow-lg transition-shadow duration-200 p-6">
                <div className="flex items-center mb-4">
                  <div className="w-10 h-10 rounded-lg bg-primary bg-opacity-10 flex items-center justify-center mr-3">
                    {getFileIcon(doc.fileName)}
                  </div>
                  <h3 className="font-semibold truncate max-w-[80%]">
                    {doc.fileName}
                  </h3>
                </div>
                
                <div className="flex justify-between items-center">
                  <div className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    {doc.fileName.split('.').pop()?.toUpperCase() || 'DOC'}
                  </div>
                  
                  <div className="flex justify-end items-center gap-2 mt-4">
                    {doc.blobUrl && (
                      <Button
                        
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => handleDownload(doc.id, doc.fileName)}
                        title="Download file"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    )}
                    {/* <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteMutation.mutate(doc)}
                      disabled={deleteMutation.isPending}
                      className="h-8 w-8 text-destructive hover:text-destructive hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button> */}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button 
                          size="icon" 
                          variant="ghost"
                          className="h-8 w-8"
                          aria-label={`Delete ${doc.fileName}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Trash className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete the document.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction 
                            onClick={() => deleteMutation.mutate(doc)}
                            disabled={deleteMutation.isPending}
                          >
                            {deleteMutation.isPending ? "Deleting..." : "Delete"}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mb-2">
                  {tagsById[doc.id] && tagsById[doc.id].length > 0 ? (
                    tagsById[doc.id].map((tag, idx) => (
                      <div key={idx} className="inline-flex px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        {tag}
                        <button
                          type="button"
                          className="ml-1 text-muted-foreground hover:text-destructive"
                          aria-label={`Remove tag ${tag}`}
                          onClick={() => handleTagRemove(doc.id, idx)}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))
                  ) : (
                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                      No Tags
                    </span>
                  )}
                  <Input
                    type="text"
                    value={tagInputById[doc.id] || ''}
                    placeholder="Add tag and press Enter"
                    className="border rounded px-2 py-1 text-xs h-8 md:text-xs"
                    onChange={e => setTagInputById(prev => ({ ...prev, [doc.id]: e.target.value }))}
                    onKeyDown={e => handleTagAdd(doc.id, e)}
                  />
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="search" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Search Knowledge Base</CardTitle>
              <CardDescription>
                Query your documents to find relevant information
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleQuerySubmit} className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="query">Query</Label>
                  <Textarea
                    id="query"
                    placeholder="Enter your query here..."
                    value={queryText}
                    onChange={(e) => setQueryText(e.target.value)}
                    className="min-h-[100px]"
                  />
                </div>
                <div className="mb-4">
                  <Label>Tags (optional)</Label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {searchTags.map((tag, idx) => (
                      <span key={idx} className="inline-flex items-center px-2 py-1 bg-muted rounded text-xs">
                        {tag}
                        <button
                          type="button"
                          className="ml-1 text-muted-foreground hover:text-destructive"
                          aria-label={`Remove search tag ${tag}`}
                          onClick={() => setSearchTags(searchTags.filter((_, i) => i !== idx))}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <Input
                    type="text"
                    placeholder="Add a tag and press Enter"
                    onKeyDown={e => {
                      if (e.key === "Enter" && e.currentTarget.value.trim()) {
                        e.preventDefault();
                        setSearchTags([...searchTags, e.currentTarget.value.trim()]);
                        e.currentTarget.value = "";
                      }
                    }}
                  />
                </div>
                <Button type="submit" disabled={isQuerying || !queryText.trim()}>
                  {isQuerying ? (
                    <>Searching...</>
                  ) : (
                    <>
                      <Search className="h-4 w-4 mr-2" />
                      Search
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          {queryResults.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Search Results</CardTitle>
                <CardDescription>
                  Found {queryResults.length} relevant passages in your knowledge base
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {queryResults.map((result, index) => (
                  <div
                    key={index}
                    className="border rounded-lg p-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="font-medium bg-primary flex items-center w-20 h-20">
                        {getFileIcon(result.source)}
                        
                      </div><span className="ml-2">{result.source}</span>
                      <span className="text-sm bg-green-100 text-green-800 px-2 py-1 rounded-full">
                        Match: {formatSimilarity(result.similarity)}
                      </span>
                    </div>
                    <p className="text-gray-700" dangerouslySetInnerHTML={{ __html: result.text }}></p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>



        <TabsContent value="document-uploader" className="space-y-4">
          <DocumentUploader />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default KnowledgePage;