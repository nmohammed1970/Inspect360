import { useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ModernFilePicker } from "@/components/ModernFilePicker";
import { extractFileUrlFromUploadResponse } from "@/lib/utils";
import type { ButtonProps } from "@/components/ui/button";

interface UploadFile {
  id: string;
  name: string;
  size: number;
  type: string;
  uploadURL?: string;
  source?: string;
  data?: File;
}

interface UploadResult {
  successful: UploadFile[];
  failed: Array<{ file: UploadFile; error: Error }>;
}

interface ObjectUploaderProps {
  maxNumberOfFiles?: number;
  maxFileSize?: number;
  onGetUploadParameters: () => Promise<{
    method: "PUT";
    url: string;
  }>;
  onComplete?: (result: UploadResult) => void;
  onModalOpen?: () => void;
  onModalClose?: () => void;
  buttonClassName?: string;
  buttonVariant?: ButtonProps["variant"];
  children: ReactNode;
}

export function ObjectUploader({
  maxNumberOfFiles = 1,
  maxFileSize = 10485760, // 10MB default
  onGetUploadParameters,
  onComplete,
  onModalOpen,
  onModalClose,
  buttonClassName,
  buttonVariant,
  children,
}: ObjectUploaderProps) {
  const [showModal, setShowModal] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleButtonClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowModal(true);
    onModalOpen?.();
  };

  const handleModalClose = () => {
    setShowModal(false);
    setUploadProgress(0);
    setIsUploading(false);
    onModalClose?.();
  };

  const uploadFile = async (file: File): Promise<UploadFile> => {
    // Get upload parameters
    const params = await onGetUploadParameters();
    
    // Extract objectId from upload URL if present
    let objectId: string | null = null;
    try {
      const urlObj = new URL(params.url);
      objectId = urlObj.searchParams.get('objectId');
    } catch (e) {
      // URL parsing failed, continue without objectId
    }

    // Upload file using PUT request
    const response = await fetch(params.url, {
      method: 'PUT',
      body: file,
      headers: {
        'Content-Type': file.type,
      },
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`);
    }

    // Extract file URL from response using the same logic as Uppy
    let fileUrl: string | null = null;
    
    // Try to get response body
    let responseBody: any = null;
    try {
      const text = await response.text();
      if (text) {
        try {
          responseBody = JSON.parse(text);
        } catch {
          responseBody = text;
        }
      }
    } catch (e) {
      // Response body extraction failed
    }

    // Use the existing extraction utility
    const mockFile = {
      response: {
        body: responseBody,
        url: response.headers.get('Location') || undefined,
      },
      meta: {
        originalUploadURL: params.url,
        objectId: objectId || undefined,
      },
    };

    fileUrl = extractFileUrlFromUploadResponse(mockFile, responseBody);

    // Fallback: extract from upload URL if extraction failed
    if (!fileUrl) {
      try {
        const urlObj = new URL(params.url);
        fileUrl = urlObj.pathname;
      } catch (e) {
        // If URL parsing fails, use the upload URL as is
        fileUrl = params.url;
      }
    }

    return {
      id: `${Date.now()}-${Math.random()}`,
      name: file.name,
      size: file.size,
      type: file.type,
      uploadURL: fileUrl,
      source: fileUrl,
      data: file,
    };
  };

  const handleFilesSelected = async (files: File[]) => {
    if (files.length === 0) return;

    setIsUploading(true);
    setUploadProgress(0);

    const successful: UploadFile[] = [];
    const failed: Array<{ file: UploadFile; error: Error }> = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          const uploadedFile = await uploadFile(file);
          successful.push(uploadedFile);
        } catch (error) {
          failed.push({
            file: {
              id: `${Date.now()}-${Math.random()}`,
              name: file.name,
              size: file.size,
              type: file.type,
              data: file,
            },
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
        
        // Update progress
        setUploadProgress(Math.round(((i + 1) / files.length) * 100));
      }

      // Call onComplete with results
      onComplete?.({
        successful,
        failed,
      });

      // Close modal after a short delay if uploads were successful
      if (successful.length > 0) {
        setTimeout(() => {
          handleModalClose();
        }, 1000);
      }
    } catch (error) {
      console.error('Upload error:', error);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div>
      <Button 
        type="button" 
        onClick={handleButtonClick} 
        className={buttonClassName} 
        variant={buttonVariant}
        data-testid="button-upload"
      >
        {children}
      </Button>

      <ModernFilePicker
        open={showModal}
        onClose={handleModalClose}
        onFilesSelected={handleFilesSelected}
        maxFiles={maxNumberOfFiles}
        maxFileSize={maxFileSize}
        accept="image/*"
        multiple={maxNumberOfFiles > 1}
        isUploading={isUploading}
        uploadProgress={uploadProgress}
      />
    </div>
  );
}
