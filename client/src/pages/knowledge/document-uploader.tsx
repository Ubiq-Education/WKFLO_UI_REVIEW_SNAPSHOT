import React, { useState, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Upload, FileText, CheckCircle2, X } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import useAuth from '@/hooks/use-auth';
import { getTenantHeaders } from '@/lib/tenant-config';
import { config } from '@/lib/config';

const DocumentUploader = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const token = useAuth();
  const apiUrl = config.API_URL;

  const allowedExtensions = ['.pdf', '.doc', '.docx', '.txt', '.xls', '.xlsx'];
  const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
  ];

  const handleFile = (selectedFile: File | null) => {
    if (!selectedFile) return;
    
    // Check allowed file types
    const filename = selectedFile.name.toLowerCase();
    
    if (!allowedExtensions.some(ext => filename.endsWith(ext)) || 
        !allowedTypes.some(type => selectedFile.type === type || selectedFile.type === '')) {
      toast({
        title: 'Invalid file type',
        description: 'Only PDF, Word (.doc, .docx), and Excel (.xls, .xlsx) files are supported',
        variant: 'destructive'
      });
      setFile(null);
      setUploadSuccess(false);
      return;
    }
    
    setFile(selectedFile);
    setUploadSuccess(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] || null;
    handleFile(selectedFile);
  };

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleUpload = async () => {
    if (!file) {
      toast({
        title: 'No file selected',
        description: 'Please select a file to upload',
        variant: 'destructive'
      });
      return;
    }

    setUploading(true);
    setProgress(10);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('tags', JSON.stringify(tags)); // <-- Add this line

      // Simulate progress
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + 10, 90));
      }, 300);

      // Send file to the document upload endpoint
      const response = await fetch(`${apiUrl}/md/api/v1/tenant/knowledge/uploader`, {
        method: 'POST',
        headers: { 
          Authorization: `Bearer ${token as string}`,
          ...getTenantHeaders()
        },
        body: formData
      });

      clearInterval(progressInterval);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to upload file');
      }

      setProgress(100);
      setUploadSuccess(true);

      const data = await response.json();
      toast({
        title: 'File uploaded successfully',
        description: 'Document will be indexed shortly',
        variant: 'default'
      });

      setTimeout(() => {
        setProgress(0);
      }, 2000);
      
      queryClient.invalidateQueries({ queryKey: ['/md/api/v1/tenant/knowledge'] });
    } catch (error) {
      toast({
        title: 'Upload failed',
        description: error instanceof Error ? error.message : 'An error occurred during upload',
        variant: 'destructive'
      });
    } finally {
      setUploading(false);
    }
  };

  const openFileSelector = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  return (
    <div className="container mx-auto p-4">
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center">
            <FileText className="mr-2 h-6 w-6" />
            Document Uploader
          </CardTitle>
          <CardDescription>
            Upload documents (PDF, Word, Excel) to enhance your AI agents with knowledge from your documents
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Hidden file input */}
            <input 
              ref={fileInputRef}
              type="file" 
              accept=".pdf,.doc,.docx,.xls,.xlsx" 
              onChange={handleFileChange}
              className="hidden"
              aria-label="Choose document file"
              disabled={uploading}
            />
            
            {/* Drag and drop area */}
            <div
              aria-label="Document drop zone"
              onClick={openFileSelector}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`
                border-2 border-dashed rounded-lg p-8 transition-colors duration-200 
                flex flex-col items-center justify-center cursor-pointer
                ${isDragging ? 'border-orange-500 bg-orange-50' : 'border-gray-300 hover:border-orange-500 hover:bg-orange-50'}
                ${file ? 'bg-slate-50' : ''}
              `}
              style={{ minHeight: "180px" }}
            >
              {!file ? (
                <>
                  <Upload className={`h-12 w-12 mb-4 ${isDragging ? 'text-orange-500' : 'text-gray-400'}`} />
                  <p className={`text-lg font-medium mb-1 ${isDragging ? 'text-orange-600' : 'text-gray-700'}`}>
                    {isDragging ? 'Drop your file here' : 'Drag & drop your file here'}
                  </p>
                  <p className="text-sm text-gray-500 mb-4">or click to browse</p>
                  <p className="text-xs text-gray-500 text-center max-w-md">
                    Supported formats: PDF, Word (.doc, .docx), or Excel (.xls, .xlsx) files
                  </p>
                </>
              ) : (
                <div className="w-full">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3 w-full">
                      <div className="p-2 bg-white rounded-md shadow-sm">
                        <FileText className="h-8 w-8 text-orange-500" />
                      </div>
                      <div className="w-full">
                        <p className="font-medium text-gray-800 truncate max-w-[80%]">{file.name}</p>
                        <p className="text-sm text-gray-500">{(file.size / 1024).toFixed(2)} KB</p>
                      </div>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      disabled={uploading}
                      aria-label="Remove selected file"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFile(null);
                        setProgress(0);
                        setUploadSuccess(false);
                      }}
                    >
                      <X className="h-5 w-5 text-gray-500" />
                    </Button>
                  </div>

                  {progress > 0 && (
                    <div className="w-full space-y-2">
                      <Progress value={progress} className="w-full h-2" />
                      <div className="flex justify-between items-center text-xs text-gray-500">
                        <span>{uploading ? 'Uploading...' : (uploadSuccess ? 'Uploaded' : 'Ready to upload')}</span>
                        <span>{progress}%</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Tags input */}
            <div className="mt-4">
              <label className="block text-sm font-medium mb-1">Tags</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {tags.map((tag, idx) => (
                  <span key={idx} className="inline-flex items-center px-2 py-1 bg-muted rounded text-xs">
                    {tag}
                    <button
                      type="button"
                      className="ml-1 text-muted-foreground hover:text-destructive"
                      aria-label={`Remove tag ${tag}`}
                      onClick={() => setTags(tags.filter((_, i) => i !== idx))}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <Input
                type="text"
                placeholder="Add a tag and press Enter"
                className="border rounded px-2 py-1 text-sm"
                onKeyDown={e => {
                  if (e.key === "Enter" && e.currentTarget.value.trim()) {
                    e.preventDefault();
                    setTags([...tags, e.currentTarget.value.trim()]);
                    e.currentTarget.value = "";
                  }
                }}
              />
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end">
          <Button
            onClick={handleUpload}
            disabled={!file || uploading}
            className={uploadSuccess ? "bg-green-600 hover:bg-green-700" : "bg-orange-500 hover:bg-orange-600"}
          >
            {uploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : uploadSuccess ? (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Uploaded
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Upload Document
              </>
            )}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

export default DocumentUploader;