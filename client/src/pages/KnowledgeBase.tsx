import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { BookOpen, Upload, FileText, Trash2, ArrowLeft, File, CheckCircle, XCircle } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ModernFilePickerInline } from '@/components/ModernFilePickerInline';
import { extractFileUrlFromUploadResponse } from '@/lib/utils';

export default function KnowledgeBase() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [uploadDialog, setUploadDialog] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<any>(null);
  const [uploadData, setUploadData] = useState({
    title: "",
    category: "",
    description: "",
    fileUrl: "",
    fileName: "",
    fileType: "",
    fileSizeBytes: 0,
  });
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [fileUploadProgress, setFileUploadProgress] = useState(0);

  const handleFileSelected = async (files: File[]) => {
    if (files.length === 0) return;

    const file = files[0]; // Knowledge base only supports single file
    setIsUploadingFile(true);
    setFileUploadProgress(0);

    try {
      // Get upload parameters
      const response = await fetch('/api/object-storage/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`Failed to get upload URL: ${response.statusText}`);
      }

      const data = await response.json();
      if (!data.uploadURL) {
        throw new Error("Invalid upload URL response");
      }

      // Ensure URL is absolute
      let uploadURL = data.uploadURL;
      if (uploadURL.startsWith('/')) {
        uploadURL = `${window.location.origin}${uploadURL}`;
      }

      // Upload file
      const uploadResponse = await fetch(uploadURL, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type,
        },
      });

      if (!uploadResponse.ok) {
        throw new Error(`Upload failed: ${uploadResponse.statusText}`);
      }

      // Extract file URL
      let fileUrl: string | null = null;
      try {
        const text = await uploadResponse.text();
        let responseBody: any = null;
        if (text) {
          try {
            responseBody = JSON.parse(text);
          } catch {
            responseBody = text;
          }
        }

        const mockFile = {
          response: {
            body: responseBody,
            url: uploadResponse.headers.get('Location') || undefined,
          },
          meta: {
            originalUploadURL: uploadURL,
          },
        };

        fileUrl = extractFileUrlFromUploadResponse(mockFile, responseBody);
      } catch (e) {
        // Fallback: extract from upload URL
        try {
          const urlObj = new URL(uploadURL);
          fileUrl = urlObj.pathname;
        } catch {
          fileUrl = uploadURL;
        }
      }

      if (fileUrl) {
        const absoluteUrl = fileUrl.startsWith('/')
          ? `${window.location.origin}${fileUrl}`
          : fileUrl;

        setUploadData(prev => ({
          ...prev,
          fileUrl: absoluteUrl,
          fileName: file.name,
          fileType: file.type || '',
          fileSizeBytes: file.size,
        }));
      }

      setFileUploadProgress(100);
    } catch (error: any) {
      console.error('[KnowledgeBase] Upload error:', error);
      toast({
        variant: "destructive",
        title: "Upload Failed",
        description: error.message || "Failed to upload file",
      });
    } finally {
      setIsUploadingFile(false);
    }
  };

  const { data: adminUser } = useQuery({
    queryKey: ["/api/admin/me"],
    retry: false,
  });

  const { data: documents = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/knowledge-base/documents"],
    enabled: !!adminUser,
  });

  const uploadMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch("/api/knowledge-base/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to upload document");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge-base/documents"] });
      setUploadDialog(false);
      setUploadData({
        title: "",
        category: "",
        description: "",
        fileUrl: "",
        fileName: "",
        fileType: "",
        fileSizeBytes: 0,
      });
      setFileUploadProgress(0);
      setIsUploadingFile(false);
      toast({
        title: "Document Uploaded",
        description: "Knowledge base document has been processed and uploaded successfully",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Upload Failed",
        description: error.message || "Failed to upload document",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/knowledge-base/documents/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to delete document");
      // DELETE endpoints may return 204 No Content with empty body
      if (response.status === 204 || response.headers.get("content-length") === "0") {
        return null;
      }
      const text = await response.text();
      return text ? JSON.parse(text) : null;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge-base/documents"] });
      setDeleteDialog(false);
      setSelectedDoc(null);
      toast({
        title: "Document Deleted",
        description: "Knowledge base document has been deleted successfully",
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Delete Failed",
        description: "Failed to delete document",
      });
    },
  });

  const handleUpload = () => {
    if (!uploadData.title || !uploadData.fileUrl) {
      toast({
        variant: "destructive",
        title: "Missing Information",
        description: "Please provide a title and upload a file",
      });
      return;
    }

    uploadMutation.mutate(uploadData);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  if (!adminUser) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-96">
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>You must be logged in as an admin to access this page</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate("/admin/login")} className="w-full">
              Go to Admin Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin")} data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <BookOpen className="h-8 w-8" />
              AI Chatbot Knowledge Base
            </h1>
            <p className="text-muted-foreground">Manage documents for the AI assistant</p>
          </div>
        </div>
        <Button onClick={() => setUploadDialog(true)} data-testid="button-upload">
          <Upload className="h-4 w-4 mr-2" />
          Upload Document
        </Button>
      </div>

      <Alert>
        <FileText className="h-4 w-4" />
        <AlertDescription>
          Upload user guides, best practices, and documentation (PDF, DOCX, TXT). The AI chatbot will use these documents to answer user questions.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Knowledge Base Documents ({documents.length})</CardTitle>
          <CardDescription>Documents available to the AI assistant</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading documents...</div>
          ) : documents.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No documents uploaded yet. Upload your first document to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((doc) => (
                  <tr key={doc.id} data-testid={`row-document-${doc.id}`}>
                    <TableCell className="font-medium">{doc.title}</TableCell>
                    <TableCell>
                      {doc.category ? (
                        <Badge variant="outline">{doc.category}</Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">No category</span>
                      )}
                    </TableCell>
                    <TableCell className="flex items-center gap-2">
                      <File className="h-4 w-4" />
                      <span className="text-sm">{doc.fileName}</span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatFileSize(doc.fileSizeBytes)}
                    </TableCell>
                    <TableCell>
                      {doc.isActive ? (
                        <Badge variant="default" className="bg-green-500">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          <XCircle className="h-3 w-3 mr-1" />
                          Inactive
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(doc.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedDoc(doc);
                          setDeleteDialog(true);
                        }}
                        data-testid={`button-delete-${doc.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </tr>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={uploadDialog} onOpenChange={setUploadDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Upload Knowledge Base Document</DialogTitle>
            <DialogDescription>
              Upload a PDF, DOCX, or TXT file. The text will be automatically extracted for the AI assistant.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="title">Document Title *</Label>
              <Input
                id="title"
                value={uploadData.title}
                onChange={(e) => setUploadData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="e.g., Inspect360 User Guide"
                data-testid="input-title"
              />
            </div>
            <div>
              <Label htmlFor="category">Category (optional)</Label>
              <Input
                id="category"
                value={uploadData.category}
                onChange={(e) => setUploadData(prev => ({ ...prev, category: e.target.value }))}
                placeholder="e.g., User Guide, Best Practices, Compliance"
                data-testid="input-category"
              />
            </div>
            <div>
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                value={uploadData.description}
                onChange={(e) => setUploadData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Brief description of the document content"
                rows={3}
                data-testid="input-description"
              />
            </div>
            <div>
              <Label>Upload File *</Label>
              <div className="mt-2">
                <ModernFilePickerInline
                  onFilesSelected={handleFileSelected}
                  maxFiles={1}
                  maxFileSize={10 * 1024 * 1024}
                  accept=".pdf,.docx,.txt"
                  multiple={false}
                  isUploading={isUploadingFile}
                  uploadProgress={fileUploadProgress}
                  height={250}
                />
              </div>
              {uploadData.fileName && (
                <p className="text-sm text-muted-foreground mt-2">
                  Selected: {uploadData.fileName} ({formatFileSize(uploadData.fileSizeBytes)})
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadDialog(false)} disabled={uploadMutation.isPending}>
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={uploadMutation.isPending || !uploadData.title || !uploadData.fileUrl}
              data-testid="button-submit-upload"
            >
              {uploadMutation.isPending ? "Processing..." : "Upload & Process"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialog} onOpenChange={setDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Document</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{selectedDoc?.title}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => selectedDoc && deleteMutation.mutate(selectedDoc.id)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
