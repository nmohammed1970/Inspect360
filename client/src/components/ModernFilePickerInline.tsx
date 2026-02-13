import { useState, useRef, useCallback, useEffect } from "react";
import { X, Upload, Camera, Image as ImageIcon, FileText, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ModernFilePickerInlineProps {
  onFilesSelected: (files: File[]) => void;
  maxFiles?: number;
  maxFileSize?: number; // in bytes
  accept?: string;
  multiple?: boolean;
  isUploading?: boolean;
  uploadProgress?: number;
  height?: number;
  className?: string;
}

export function ModernFilePickerInline({
  onFilesSelected,
  maxFiles = 1,
  maxFileSize = 10485760, // 10MB default
  accept = "image/*",
  multiple = false,
  isUploading = false,
  uploadProgress = 0,
  height = 300,
  className,
}: ModernFilePickerInlineProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): string | null => {
    if (file.size > maxFileSize) {
      return `File "${file.name}" exceeds maximum size of ${(maxFileSize / 1048576).toFixed(1)}MB`;
    }
    return null;
  };

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    const newFiles: File[] = [];
    const errors: string[] = [];

    // Check max files limit
    const totalFiles = selectedFiles.length + fileArray.length;
    if (totalFiles > maxFiles) {
      errors.push(`Maximum ${maxFiles} file(s) allowed`);
    }

    fileArray.forEach((file) => {
      const validationError = validateFile(file);
      if (validationError) {
        errors.push(validationError);
      } else {
        newFiles.push(file);
      }
    });

    if (errors.length > 0) {
      setError(errors.join(", "));
      setTimeout(() => setError(null), 5000);
    }

    if (newFiles.length > 0) {
      const updatedFiles = multiple ? [...selectedFiles, ...newFiles].slice(0, maxFiles) : newFiles.slice(0, 1);
      setSelectedFiles(updatedFiles);
      onFilesSelected(updatedFiles);
    }
  }, [selectedFiles, maxFiles, maxFileSize, multiple, onFilesSelected]);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
    // Reset input to allow selecting the same file again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleCameraInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
    // Reset input to allow taking another photo
    if (cameraInputRef.current) {
      cameraInputRef.current.value = "";
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const removeFile = (index: number) => {
    const newFiles = selectedFiles.filter((_, i) => i !== index);
    setSelectedFiles(newFiles);
    if (newFiles.length > 0) {
      onFilesSelected(newFiles);
    }
  };

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  const handleCameraClick = () => {
    cameraInputRef.current?.click();
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1048576).toFixed(1) + " MB";
  };

  return (
    <div className={cn("space-y-4", className)} style={{ minHeight: `${height}px` }}>
      {/* Error Message */}
      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Upload Progress */}
      {isUploading && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Uploading...</span>
            <span className="text-muted-foreground">{uploadProgress}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Drop Zone */}
      {!isUploading && (
        <div
          ref={dropZoneRef}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
            isDragging
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/30 hover:border-primary/50"
          )}
          style={{ minHeight: `${height - 100}px` }}
        >
          <div className="space-y-4">
            <div className="flex justify-center">
              <div className="p-4 bg-muted rounded-full">
                <Upload className="h-8 w-8 text-muted-foreground" />
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">
                Drag and drop files here, or
              </p>
              <div className="flex gap-3 justify-center">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleBrowseClick}
                  className="gap-2"
                >
                  <FileText className="h-4 w-4" />
                  Browse Files
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCameraClick}
                  className="gap-2"
                >
                  <Camera className="h-4 w-4" />
                  Use Camera
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {multiple
                  ? `Up to ${maxFiles} files, max ${(maxFileSize / 1048576).toFixed(1)}MB each`
                  : `Max ${(maxFileSize / 1048576).toFixed(1)}MB`}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Selected Files Preview */}
      {selectedFiles.length > 0 && !isUploading && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Selected Files</p>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {selectedFiles.map((file, index) => (
              <div
                key={index}
                className="flex items-center gap-3 p-3 bg-muted rounded-lg"
              >
                {file.type.startsWith("image/") ? (
                  <img
                    src={URL.createObjectURL(file)}
                    alt={file.name}
                    className="h-12 w-12 object-cover rounded"
                  />
                ) : (
                  <div className="h-12 w-12 flex items-center justify-center bg-background rounded">
                    <FileText className="h-5 w-5" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(file.size)}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeFile(index)}
                  className="h-8 w-8 shrink-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Success State */}
      {isUploading && uploadProgress === 100 && (
        <div className="flex items-center justify-center gap-2 p-4 bg-green-50 dark:bg-green-950 rounded-lg">
          <CheckCircle2 className="h-5 w-5 text-green-600" />
          <span className="text-sm font-medium text-green-600">
            Upload complete!
          </span>
        </div>
      )}

      {/* Hidden File Inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleFileInputChange}
        className="hidden"
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleCameraInputChange}
        className="hidden"
      />
    </div>
  );
}

