import { useState, useEffect } from "react";
import type { ReactNode } from "react";
import Uppy from "@uppy/core";
import { DashboardModal } from "@uppy/react";
import AwsS3 from "@uppy/aws-s3";
import Webcam from "@uppy/webcam";
import "@uppy/core/css/style.min.css";
import "@uppy/dashboard/css/style.min.css";
import "@uppy/webcam/css/style.min.css";
import type { UploadResult } from "@uppy/core";
import { Button } from "@/components/ui/button";
import { extractFileUrlFromUploadResponse } from "@/lib/utils";

interface ObjectUploaderProps {
  maxNumberOfFiles?: number;
  maxFileSize?: number;
  onGetUploadParameters: () => Promise<{
    method: "PUT";
    url: string;
  }>;
  onComplete?: (
    result: UploadResult<Record<string, unknown>, Record<string, unknown>>
  ) => void;
  buttonClassName?: string;
  children: ReactNode;
}

export function ObjectUploader({
  maxNumberOfFiles = 1,
  maxFileSize = 10485760, // 10MB default
  onGetUploadParameters,
  onComplete,
  buttonClassName,
  children,
}: ObjectUploaderProps) {
  const [showModal, setShowModal] = useState(false);
  const [uppy] = useState(() => {
    const uppyInstance = new Uppy({
      restrictions: {
        maxNumberOfFiles,
        maxFileSize,
      },
      autoProceed: false,
    })
      .use(Webcam, {
        modes: ['picture'],
        facingMode: 'environment',
      } as any)
      .use(AwsS3, {
        shouldUseMultipart: false,
        async getUploadParameters(file: any) {
          const params = await onGetUploadParameters();
          
          // Extract objectId from upload URL and store in metadata
          try {
            const uploadURL = params.url;
            const urlObj = new URL(uploadURL);
            const objectId = urlObj.searchParams.get('objectId');
            if (objectId) {
              uppyInstance.setFileMeta(file.id, { 
                originalUploadURL: uploadURL,
                objectId: objectId,
              });
            } else {
              uppyInstance.setFileMeta(file.id, { 
                originalUploadURL: uploadURL,
              });
            }
          } catch (e) {
            // If URL parsing fails, just store the upload URL
            uppyInstance.setFileMeta(file.id, { 
              originalUploadURL: params.url,
            });
          }
          
          return params;
        },
      });
    return uppyInstance;
  });

  useEffect(() => {
    // Extract file URLs from upload responses and attach them to the result
    const handleUploadSuccess = (file: any, response: any) => {
      const fileUrl = extractFileUrlFromUploadResponse(file, response);
      if (fileUrl) {
        // Store the extracted URL in file metadata for later retrieval
        file.meta = file.meta || {};
        file.meta.extractedFileUrl = fileUrl;
      }
    };

    uppy.on("upload-success", handleUploadSuccess);

    const handleComplete = (result: UploadResult<Record<string, unknown>, Record<string, unknown>>) => {
      // Update successful files with extracted URLs
      if (result.successful) {
        result.successful = result.successful.map((file: any) => {
          const extractedUrl = file.meta?.extractedFileUrl;
          if (extractedUrl) {
            return {
              ...file,
              uploadURL: extractedUrl, // Override with correct file URL
            };
          }
          return file;
        });
      }
      
      onComplete?.(result);
      
      if (result.successful && result.successful.length > 0) {
        setShowModal(false);
      }
    };

    uppy.on("complete", handleComplete);

    return () => {
      uppy.off("upload-success", handleUploadSuccess);
      uppy.off("complete", handleComplete);
    };
  }, [uppy, onComplete]);

  return (
    <div>
      <Button type="button" onClick={() => setShowModal(true)} className={buttonClassName} data-testid="button-upload">
        {children}
      </Button>

      <DashboardModal
        uppy={uppy}
        open={showModal}
        onRequestClose={() => setShowModal(false)}
        proudlyDisplayPoweredByUppy={false}
        plugins={['Webcam']}
        note=""
        locale={{
          strings: {
            dropHint: '',
            dropPasteImportBoth: '%{browseFiles} or use camera',
            dropPasteBoth: '%{browseFiles} or use camera',
            dropPasteFiles: '%{browseFiles} or use camera',
            dropPasteFolders: '%{browseFiles} or use camera',
            dropPasteImportFiles: '%{browseFiles} or use camera',
            dropPasteImportFolders: '%{browseFiles} or use camera',
            browseFiles: 'choose files',
          }
        }}
      />
    </div>
  );
}
