import { useState, useRef, useCallback, useEffect } from "react";
import { Upload, Camera, Image as ImageIcon, FileText, Loader2, CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  isImageFile,
  prepareImageForUpload,
  NON_IMAGE_MAX_BYTES,
} from "@/lib/compressImage";

interface ModernFilePickerProps {
  open: boolean;
  onClose: () => void;
  onFilesSelected: (files: File[]) => void;
  maxFiles?: number;
  /** Applies to non-image files only. Images are accepted at any size and compressed on select. */
  maxFileSize?: number;
  accept?: string;
  multiple?: boolean;
  isUploading?: boolean;
  uploadProgress?: number;
}

export function ModernFilePicker({
  open,
  onClose,
  onFilesSelected,
  maxFiles = 1,
  maxFileSize = NON_IMAGE_MAX_BYTES,
  accept = "image/*",
  multiple = false,
  isUploading = false,
  uploadProgress = 0,
}: ModernFilePickerProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;

      const fileArray = Array.from(files);
      const errors: string[] = [];

      const totalFiles = selectedFiles.length + fileArray.length;
      if (totalFiles > maxFiles) {
        errors.push(`Maximum ${maxFiles} file(s) allowed`);
        setError(errors.join(", "));
        setTimeout(() => setError(null), 5000);
        return;
      }

      setIsPreparing(true);
      setError(null);

      try {
        const prepared: File[] = [];

        for (const file of fileArray) {
          if (isImageFile(file)) {
            prepared.push(await prepareImageForUpload(file));
          } else if (file.size > maxFileSize) {
            errors.push(
              `File "${file.name}" exceeds maximum size of ${(maxFileSize / 1048576).toFixed(1)}MB`,
            );
          } else {
            prepared.push(file);
          }
        }

        if (errors.length > 0) {
          setError(errors.join(", "));
          setTimeout(() => setError(null), 5000);
        }

        if (prepared.length > 0) {
          const updatedFiles = multiple
            ? [...selectedFiles, ...prepared].slice(0, maxFiles)
            : prepared.slice(0, 1);
          setSelectedFiles(updatedFiles);
          onFilesSelected(updatedFiles);
        }
      } finally {
        setIsPreparing(false);
      }
    },
    [selectedFiles, maxFiles, maxFileSize, multiple, onFilesSelected],
  );

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    void handleFiles(e.target.files);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleCameraInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    void handleFiles(e.target.files);
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
    void handleFiles(e.dataTransfer.files);
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

  const reset = () => {
    setSelectedFiles([]);
    setError(null);
    setIsDragging(false);
    setIsPreparing(false);
  };

  useEffect(() => {
    if (!open) {
      reset();
    }
  }, [open]);

  const getFileIcon = (file: File) => {
    if (file.type.startsWith("image/")) {
      return <ImageIcon className="h-5 w-5" />;
    }
    return <FileText className="h-5 w-5" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1048576).toFixed(1) + " MB";
  };

  const busy = isUploading || isPreparing;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] p-0 gap-0">
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Upload Files</h2>
          </div>

          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-sm text-destructive">
              {error}
            </div>
          )}

          {isPreparing && (
            <div className="flex items-center justify-center gap-2 p-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Compressing image…
            </div>
          )}

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

          {!busy && (
            <div
              ref={dropZoneRef}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={cn(
                "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
                isDragging
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/30 hover:border-primary/50",
              )}
            >
              <div className="space-y-4">
                <div className="flex justify-center">
                  <div className="p-4 bg-muted rounded-full">
                    <Upload className="h-8 w-8 text-muted-foreground" />
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Drag and drop files here, or</p>
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
                    {multiple ? `Up to ${maxFiles} files. ` : ""}
                    Large photos are compressed automatically before upload.
                  </p>
                </div>
              </div>
            </div>
          )}

          {selectedFiles.length > 0 && !busy && (
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
                        {getFileIcon(file)}
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

          {isUploading && uploadProgress === 100 && (
            <div className="flex items-center justify-center gap-2 p-4 bg-green-50 dark:bg-green-950 rounded-lg">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <span className="text-sm font-medium text-green-600">Upload complete!</span>
            </div>
          )}
        </div>

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
      </DialogContent>
    </Dialog>
  );
}
