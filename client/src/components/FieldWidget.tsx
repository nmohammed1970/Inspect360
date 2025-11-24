import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Star, Upload, Calendar, Clock, MapPin, X, Image as ImageIcon, Sparkles, Trash2, Save, Eye } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import Uppy from "@uppy/core";
import { Dashboard } from "@uppy/react";
import AwsS3 from "@uppy/aws-s3";
import Webcam from "@uppy/webcam";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import SignatureCanvas from "react-signature-canvas";

interface TemplateField {
  id: string;
  label: string;
  type: string;
  required?: boolean;
  placeholder?: string;
  options?: string[];
  validation?: Record<string, any>;
  dependsOn?: Record<string, any>;
  includeCondition?: boolean;
  includeCleanliness?: boolean;
}

interface FieldWidgetProps {
  field: TemplateField;
  value?: any;
  note?: string;
  photos?: string[];
  inspectionId?: string;
  entryId?: string;
  isCheckOut?: boolean; // Only show mark-for-review in Check Out inspections
  markedForReview?: boolean;
  onChange: (value: any, note?: string, photos?: string[]) => void;
  onMarkedForReviewChange?: (marked: boolean) => void;
}

export function FieldWidget({ 
  field, 
  value, 
  note, 
  photos, 
  inspectionId, 
  entryId, 
  isCheckOut,
  markedForReview,
  onChange,
  onMarkedForReviewChange 
}: FieldWidgetProps) {
  // Parse value - if field includes condition/cleanliness, value might be an object
  const parseValue = (val: any) => {
    if (val && typeof val === 'object' && (field.includeCondition || field.includeCleanliness)) {
      return {
        value: val.value,
        condition: val.condition,
        cleanliness: val.cleanliness,
      };
    }
    return { value: val, condition: undefined, cleanliness: undefined };
  };

  const parsed = parseValue(value);
  const [localValue, setLocalValue] = useState(parsed.value);
  const [localCondition, setLocalCondition] = useState(parsed.condition);
  const [localCleanliness, setLocalCleanliness] = useState(parsed.cleanliness);
  const [localNote, setLocalNote] = useState(note || "");
  const [localPhotos, setLocalPhotos] = useState<string[]>(photos || []);
  const [localMarkedForReview, setLocalMarkedForReview] = useState(markedForReview || false);
  const [showPhotoUpload, setShowPhotoUpload] = useState(false);
  const signaturePadRef = useRef<SignatureCanvas>(null);
  const [aiAnalyses, setAiAnalyses] = useState<Record<string, any>>({});
  const [analyzingPhoto, setAnalyzingPhoto] = useState<string | null>(null);
  const [analyzingField, setAnalyzingField] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  // Fetch Check-In reference for photo fields during Check-Out inspections
  const { data: checkInReference } = useQuery({
    queryKey: inspectionId ? ["/api/inspections", inspectionId, "check-in-reference"] : ["no-check-in"],
    queryFn: async () => {
      if (!inspectionId || !isCheckOut || (field.type !== "photo" && field.type !== "photo_array")) {
        return null;
      }
      const response = await apiRequest("GET", `/api/inspections/${inspectionId}/check-in-reference`);
      return response.json();
    },
    enabled: !!inspectionId && isCheckOut && (field.type === "photo" || field.type === "photo_array"),
  });

  // Find matching check-in entry for this field
  const checkInEntry = checkInReference?.checkInEntries?.find(
    (entry: any) => entry.fieldRef === field.id
  );
  const checkInPhotos = checkInEntry?.photos || [];

  // Rehydrate local state when props change (e.g., when existing entries load)
  useEffect(() => {
    const parsed = parseValue(value);
    setLocalValue(parsed.value);
    setLocalCondition(parsed.condition);
    setLocalCleanliness(parsed.cleanliness);
  }, [value]);

  useEffect(() => {
    setLocalNote(note || "");
  }, [note]);

  useEffect(() => {
    setLocalPhotos(photos || []);
  }, [photos]);

  useEffect(() => {
    setLocalMarkedForReview(markedForReview || false);
  }, [markedForReview]);

  // Auto-clear markedForReview when all photos are deleted
  useEffect(() => {
    if (isCheckOut && localPhotos.length === 0 && localMarkedForReview) {
      setLocalMarkedForReview(false);
      onMarkedForReviewChange?.(false);
    }
  }, [localPhotos, localMarkedForReview, isCheckOut, onMarkedForReviewChange]);

  const composeValue = (val: any, condition?: string, cleanliness?: string) => {
    if (field.includeCondition || field.includeCleanliness) {
      return {
        value: val,
        ...(field.includeCondition && { condition }),
        ...(field.includeCleanliness && { cleanliness }),
      };
    }
    return val;
  };

  const handleValueChange = (newValue: any) => {
    setLocalValue(newValue);
    const composedValue = composeValue(newValue, localCondition, localCleanliness);
    onChange(composedValue, localNote || undefined, localPhotos.length > 0 ? localPhotos : undefined);
  };

  const handleConditionChange = (condition: string) => {
    setLocalCondition(condition);
    const composedValue = composeValue(localValue, condition, localCleanliness);
    onChange(composedValue, localNote || undefined, localPhotos.length > 0 ? localPhotos : undefined);
  };

  const handleCleanlinessChange = (cleanliness: string) => {
    setLocalCleanliness(cleanliness);
    const composedValue = composeValue(localValue, localCondition, cleanliness);
    onChange(composedValue, localNote || undefined, localPhotos.length > 0 ? localPhotos : undefined);
  };

  const handleNoteChange = (newNote: string) => {
    setLocalNote(newNote);
    const composedValue = composeValue(localValue, localCondition, localCleanliness);
    onChange(composedValue, newNote || undefined, localPhotos.length > 0 ? localPhotos : undefined);
  };

  const handlePhotoAdd = (photoUrl: string) => {
    const newPhotos = field.type === "photo" ? [photoUrl] : [...localPhotos, photoUrl];
    setLocalPhotos(newPhotos);
    const composedValue = composeValue(localValue, localCondition, localCleanliness);
    onChange(composedValue, localNote || undefined, newPhotos);
    toast({
      title: "Success",
      description: "Photo uploaded successfully",
    });
  };

  const handlePhotoRemove = (photoUrl: string) => {
    const newPhotos = localPhotos.filter((p) => p !== photoUrl);
    setLocalPhotos(newPhotos);
    const composedValue = composeValue(localValue, localCondition, localCleanliness);
    onChange(composedValue, localNote || undefined, newPhotos.length > 0 ? newPhotos : undefined);
  };

  const handleInspectField = async () => {
    if (!inspectionId || localPhotos.length === 0) {
      toast({
        title: "Cannot Analyze",
        description: "Please upload at least one photo to use InspectAI",
        variant: "destructive",
      });
      return;
    }

    setAnalyzingField(true);

    try {
      const response = await apiRequest("POST", "/api/ai/inspect-field", {
        inspectionId,
        fieldKey: field.id,
        fieldLabel: field.label,
        fieldDescription: field.placeholder,
        photos: localPhotos,
      });

      const { analysis } = await response.json();

      // Auto-populate the notes field with the AI analysis
      const newNote = analysis;
      setLocalNote(newNote);
      const composedValue = composeValue(localValue, localCondition, localCleanliness);
      onChange(composedValue, newNote, localPhotos);

      // Invalidate organization query to update credit balance on dashboard and billing pages
      if (user?.organizationId) {
        queryClient.invalidateQueries({ queryKey: [`/api/organizations/${user.organizationId}`] });
      }

      toast({
        title: "InspectAI Complete",
        description: "AI analysis has been added to the notes field",
      });
    } catch (error: any) {
      console.error("Error analyzing field:", error);
      toast({
        title: "Analysis Failed",
        description: error.message || "Failed to analyze inspection point",
        variant: "destructive",
      });
    } finally {
      setAnalyzingField(false);
    }
  };

  const createPhotoUppy = () => {
    const maxFiles = field.type === "photo" ? 1 : 10;
    const uppy = new Uppy({
      restrictions: {
        maxNumberOfFiles: maxFiles,
        allowedFileTypes: ["image/*"],
        maxFileSize: 10485760, // 10MB
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
          try {
            const response = await fetch("/api/objects/upload", {
              method: "POST",
              credentials: "include",
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
              // Convert relative URL to absolute
              uploadURL = `${window.location.origin}${uploadURL}`;
            }

            // Validate URL
            try {
              new URL(uploadURL);
            } catch (e) {
              throw new Error(`Invalid upload URL format: ${uploadURL}`);
            }

            return {
              method: "PUT" as const,
              url: uploadURL,
              headers: {
                "Content-Type": file.type || "application/octet-stream",
              },
            };
          } catch (error: any) {
            console.error("[FieldWidget] Upload URL error:", error);
            throw new Error(`Failed to get upload URL: ${error.message}`);
          }
        },
      });

    uppy.on("upload-success", async (file: any, response: any) => {
      // Extract the file URL from the PUT response
      // Uppy's AwsS3 plugin stores the response in file.response.body
      let uploadUrl: string | null = null;
      
      // Check file.response.body (most reliable location)
      if (file?.response?.body) {
        try {
          const body = typeof file.response.body === 'string' 
            ? JSON.parse(file.response.body) 
            : file.response.body;
          uploadUrl = body?.url || body?.uploadURL;
        } catch (e) {
          // Not JSON
        }
      }
      
      // Fallback: check response.body
      if (!uploadUrl && response?.body) {
        try {
          const body = typeof response.body === 'string' 
            ? JSON.parse(response.body) 
            : response.body;
          uploadUrl = body?.url || body?.uploadURL;
        } catch (e) {
          // Not JSON
        }
      }
      
      // Fallback: check top-level properties
      if (!uploadUrl) {
        uploadUrl = response?.uploadURL || response?.url || file?.response?.uploadURL || file?.response?.url;
      }
      
      if (uploadUrl) {
        const rawPhotoUrl = uploadUrl.split("?")[0];
        
        // Ensure it's a valid file path
        if (!rawPhotoUrl.startsWith('/objects/')) {
          console.error('[FieldWidget] Invalid photo URL format:', rawPhotoUrl);
          toast({
            title: "Upload Error",
            description: "Invalid photo URL format. Please try again.",
            variant: "destructive",
          });
          return;
        }
        
        // Convert to absolute URL for ACL call
        const absolutePhotoUrl = rawPhotoUrl.startsWith('/') 
          ? `${window.location.origin}${rawPhotoUrl}`
          : rawPhotoUrl;
        
        // Set ACL to public so OpenAI can access the photo
        try {
          const aclResponse = await fetch("/api/objects/set-acl", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ photoUrl: absolutePhotoUrl }),
          });
          
          if (!aclResponse.ok) {
            const errorData = await aclResponse.json().catch(() => ({ error: "Unknown error" }));
            throw new Error(errorData.error || `ACL setting failed with status ${aclResponse.status}`);
          }
          
          const { objectPath } = await aclResponse.json();
          
          if (!objectPath) {
            throw new Error("No object path returned from ACL setting");
          }
          
          // Use the object path (which is now publicly accessible)
          handlePhotoAdd(objectPath);
        } catch (err: any) {
          console.error("Error setting photo ACL:", err);
          toast({
            title: "Upload Error",
            description: err.message || "Failed to make photo accessible for AI analysis. Please try again.",
            variant: "destructive",
          });
          // Do NOT add the photo to the list if ACL setting failed
          // This prevents non-public photos from breaking the AI analysis pipeline
        }
      } else {
        console.error('[FieldWidget] No upload URL found in response:', { file, response });
        toast({
          title: "Upload Error",
          description: "Upload succeeded but could not get photo URL. Please try again.",
          variant: "destructive",
        });
      }
    });

    uppy.on("complete", () => {
      setShowPhotoUpload(false);
    });

    return uppy;
  };

  const createVideoUppy = () => {
    const uppy = new Uppy({
      restrictions: {
        maxNumberOfFiles: 1,
        allowedFileTypes: ["video/*"],
        maxFileSize: 104857600, // 100MB
      },
      autoProceed: false,
    }).use(AwsS3, {
      shouldUseMultipart: false,
      async getUploadParameters(file: any) {
        try {
          const response = await fetch("/api/objects/upload", {
            method: "POST",
            credentials: "include",
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
            // Convert relative URL to absolute
            uploadURL = `${window.location.origin}${uploadURL}`;
          }

          // Validate URL
          try {
            new URL(uploadURL);
          } catch (e) {
            throw new Error(`Invalid upload URL format: ${uploadURL}`);
          }

          return {
            method: "PUT" as const,
            url: uploadURL,
            headers: {
              "Content-Type": file.type || "application/octet-stream",
            },
          };
        } catch (error: any) {
          console.error("[FieldWidget] Video upload URL error:", error);
          throw new Error(`Failed to get upload URL: ${error.message}`);
        }
      },
    });

    uppy.on("upload-success", (file: any, response: any) => {
      // Extract the file URL from the PUT response
      let uploadUrl: string | null = null;
      
      // Check file.response.body (most reliable location)
      if (file?.response?.body) {
        try {
          const body = typeof file.response.body === 'string' 
            ? JSON.parse(file.response.body) 
            : file.response.body;
          uploadUrl = body?.url || body?.uploadURL;
        } catch (e) {
          // Not JSON
        }
      }
      
      // Fallback: check response.body
      if (!uploadUrl && response?.body) {
        try {
          const body = typeof response.body === 'string' 
            ? JSON.parse(response.body) 
            : response.body;
          uploadUrl = body?.url || body?.uploadURL;
        } catch (e) {
          // Not JSON
        }
      }
      
      // Fallback: check top-level properties
      if (!uploadUrl) {
        uploadUrl = response?.uploadURL || response?.url || file?.response?.uploadURL || file?.response?.url;
      }
      
      if (uploadUrl) {
        const videoUrl = uploadUrl.split("?")[0];
        handleValueChange(videoUrl);
        toast({
          title: "Success",
          description: "Video uploaded successfully",
        });
      } else {
        console.error('[FieldWidget] No video URL found in response:', { file, response });
        toast({
          title: "Upload Error",
          description: "Upload succeeded but could not get video URL. Please try again.",
          variant: "destructive",
        });
      }
    });

    uppy.on("complete", () => {
      setShowPhotoUpload(false);
    });

    return uppy;
  };

  const handleAnalyzePhoto = async (photoUrl: string) => {
    if (!inspectionId || !photoUrl) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Unable to analyze photo - missing inspection data",
      });
      return;
    }

    setAnalyzingPhoto(photoUrl);

    try {
      const response = await apiRequest("POST", "/api/ai-analyses", {
        inspectionId,
        inspectionEntryId: entryId,
        imageUrl: photoUrl,
        context: `Analyze this photo for ${field.label}. Provide a detailed assessment of the condition, noting any issues, damage, or concerns.`,
      });
      
      const result = await response.json();

      setAiAnalyses((prev) => ({
        ...prev,
        [photoUrl]: result,
      }));

      // Invalidate organization query to update credit balance on dashboard and billing pages
      if (user?.organizationId) {
        queryClient.invalidateQueries({ queryKey: [`/api/organizations/${user.organizationId}`] });
      }

      toast({
        title: "Analysis Complete",
        description: "AI analysis generated successfully (1 credit used)",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Analysis Failed",
        description: error.message || "Failed to analyze photo",
      });
    } finally {
      setAnalyzingPhoto(null);
    }
  };

  const renderField = () => {
    switch (field.type) {
      case "short_text":
        return (
          <Input
            value={localValue || ""}
            onChange={(e) => handleValueChange(e.target.value)}
            placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
            data-testid={`input-${field.id}`}
          />
        );

      case "long_text":
        return (
          <Textarea
            value={localValue || ""}
            onChange={(e) => handleValueChange(e.target.value)}
            placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
            rows={4}
            data-testid={`textarea-${field.id}`}
          />
        );

      case "number":
        return (
          <Input
            type="number"
            value={localValue || ""}
            onChange={(e) => handleValueChange(parseFloat(e.target.value) || 0)}
            placeholder={field.placeholder || "Enter number"}
            data-testid={`input-number-${field.id}`}
          />
        );

      case "rating":
        return (
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5].map((rating) => (
              <button
                key={rating}
                type="button"
                onClick={() => handleValueChange(rating)}
                className="focus:outline-none"
                data-testid={`button-rating-${rating}-${field.id}`}
              >
                <Star
                  className={`w-8 h-8 ${
                    (localValue || 0) >= rating
                      ? "fill-primary text-primary"
                      : "text-muted-foreground"
                  }`}
                />
              </button>
            ))}
            {localValue > 0 && (
              <span className="ml-2 text-sm text-muted-foreground">
                {localValue} / 5
              </span>
            )}
          </div>
        );

      case "select":
        return (
          <Select value={localValue || ""} onValueChange={handleValueChange}>
            <SelectTrigger data-testid={`select-${field.id}`}>
              <SelectValue placeholder={field.placeholder || "Select an option"} />
            </SelectTrigger>
            <SelectContent>
              {field.options?.map((option) => (
                <SelectItem key={option} value={option} data-testid={`select-option-${option}`}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case "multiselect":
        const selectedValues = localValue || [];
        return (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2 mb-2">
              {selectedValues.map((val: string) => (
                <Badge
                  key={val}
                  variant="secondary"
                  className="cursor-pointer"
                  onClick={() => {
                    const newValues = selectedValues.filter((v: string) => v !== val);
                    handleValueChange(newValues);
                  }}
                  data-testid={`badge-selected-${val}`}
                >
                  {val} ×
                </Badge>
              ))}
            </div>
            <Select
              value=""
              onValueChange={(val) => {
                if (!selectedValues.includes(val)) {
                  handleValueChange([...selectedValues, val]);
                }
              }}
            >
              <SelectTrigger data-testid={`select-multiselect-${field.id}`}>
                <SelectValue placeholder="Add option..." />
              </SelectTrigger>
              <SelectContent>
                {field.options
                  ?.filter((opt) => !selectedValues.includes(opt))
                  .map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        );

      case "boolean":
        return (
          <div className="flex items-center space-x-2">
            <Checkbox
              checked={localValue || false}
              onCheckedChange={handleValueChange}
              data-testid={`checkbox-${field.id}`}
            />
            <label className="text-sm cursor-pointer">
              {field.placeholder || "Yes"}
            </label>
          </div>
        );

      case "date":
        return (
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <Input
              type="date"
              value={localValue || ""}
              onChange={(e) => handleValueChange(e.target.value)}
              data-testid={`input-date-${field.id}`}
            />
          </div>
        );

      case "time":
        return (
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <Input
              type="time"
              value={localValue || ""}
              onChange={(e) => handleValueChange(e.target.value)}
              data-testid={`input-time-${field.id}`}
            />
          </div>
        );

      case "datetime":
        return (
          <Input
            type="datetime-local"
            value={localValue || ""}
            onChange={(e) => handleValueChange(e.target.value)}
            data-testid={`input-datetime-${field.id}`}
          />
        );

      case "photo":
      case "photo_array":
        return (
          <div className="space-y-3">
            {/* Check-In Reference Photos */}
            {isCheckOut && checkInPhotos.length > 0 && (
              <Alert className="border-primary/50 bg-primary/5">
                <Eye className="h-4 w-4 text-primary" />
                <AlertDescription>
                  <div className="space-y-2">
                    <p className="font-medium text-sm">
                      Check-In Reference Photos
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Match these angles when taking your Check-Out photos for accurate comparison
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
                      {checkInPhotos.map((photoUrl: string, index: number) => (
                        <div key={index} className="relative group">
                          <img
                            src={photoUrl}
                            alt={`Check-In Reference ${index + 1}`}
                            className="w-full h-32 object-cover rounded-md border-2 border-primary/30"
                            data-testid={`img-check-in-reference-${index}`}
                          />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors rounded-md flex items-center justify-center">
                            <Badge variant="secondary" className="opacity-0 group-hover:opacity-100 transition-opacity">
                              Reference {index + 1}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {localPhotos.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {localPhotos.map((photoUrl, index) => (
                  <Card key={index} className="overflow-hidden">
                    <CardContent className="p-0">
                      <div className="relative group">
                        <img
                          src={photoUrl}
                          alt={`${field.label} ${index + 1}`}
                          className="w-full h-48 object-cover"
                        />
                        <Button
                          size="icon"
                          variant="destructive"
                          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => handlePhotoRemove(photoUrl)}
                          data-testid={`button-remove-photo-${index}`}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                      <div className="p-3 space-y-2">
                        {inspectionId && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => handleAnalyzePhoto(photoUrl)}
                            disabled={analyzingPhoto === photoUrl || !!aiAnalyses[photoUrl]}
                            data-testid={`button-analyze-photo-${index}`}
                            className="w-full"
                          >
                            <Sparkles className="w-4 h-4 mr-2" />
                            {analyzingPhoto === photoUrl
                              ? "Analyzing..."
                              : aiAnalyses[photoUrl]
                              ? "Analyzed"
                              : "Analyze with AI"}
                          </Button>
                        )}
                        {aiAnalyses[photoUrl] && (
                          <div className="p-3 bg-muted rounded-lg text-sm">
                            <p className="font-medium mb-1 flex items-center gap-2">
                              <Sparkles className="w-4 h-4" />
                              AI Analysis
                            </p>
                            <p className="text-muted-foreground whitespace-pre-wrap">
                              {aiAnalyses[photoUrl].resultJson?.analysis || 
                               aiAnalyses[photoUrl].resultJson?.content ||
                               "Analysis completed"}
                            </p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowPhotoUpload(true)}
              disabled={field.type === "photo" && localPhotos.length >= 1}
              data-testid={`button-upload-photo-${field.id}`}
            >
              <Upload className="w-4 h-4 mr-2" />
              {localPhotos.length > 0 ? "Add More Photos" : "Upload Photo"}
            </Button>
            {showPhotoUpload && (
              <Dashboard
                uppy={createPhotoUppy()}
                proudlyDisplayPoweredByUppy={false}
                height={300}
                plugins={['Webcam']}
              />
            )}
          </div>
        );

      case "video":
        return (
          <div className="space-y-3">
            {localValue && (
              <video
                src={localValue}
                controls
                className="w-full max-h-64 rounded-lg"
                data-testid={`video-preview-${field.id}`}
              />
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowPhotoUpload(true)}
              data-testid={`button-upload-video-${field.id}`}
            >
              <Upload className="w-4 h-4 mr-2" />
              {localValue ? "Replace Video" : "Upload Video"}
            </Button>
            {showPhotoUpload && (
              <Dashboard
                uppy={createVideoUppy()}
                proudlyDisplayPoweredByUppy={false}
                height={300}
              />
            )}
          </div>
        );

      case "gps":
        return (
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-muted-foreground" />
            <Input
              value={localValue || ""}
              onChange={(e) => handleValueChange(e.target.value)}
              placeholder="Latitude, Longitude"
              data-testid={`input-gps-${field.id}`}
            />
          </div>
        );

      case "signature":
        const handleClearSignature = () => {
          if (signaturePadRef.current) {
            signaturePadRef.current.clear();
            handleValueChange("");
          }
        };

        const handleSaveSignature = () => {
          if (signaturePadRef.current && !signaturePadRef.current.isEmpty()) {
            const signatureData = signaturePadRef.current.toDataURL();
            handleValueChange(signatureData);
            toast({
              title: "Signature saved",
              description: "Your signature has been captured successfully.",
            });
          }
        };

        return (
          <div className="space-y-3">
            {localValue ? (
              <Card>
                <CardContent className="p-4">
                  <div className="space-y-3">
                    <img 
                      src={localValue} 
                      alt="Signature" 
                      className="w-full h-40 object-contain border rounded bg-background"
                      data-testid={`img-signature-${field.id}`}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleClearSignature}
                      data-testid={`button-clear-signature-${field.id}`}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Clear Signature
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-4">
                  <div className="space-y-3">
                    <div className="border-2 border-dashed rounded bg-background">
                      <SignatureCanvas
                        ref={signaturePadRef}
                        canvasProps={{
                          className: "w-full h-40 cursor-crosshair",
                          "data-testid": `canvas-signature-${field.id}`
                        }}
                        backgroundColor="transparent"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleClearSignature}
                        data-testid={`button-clear-signature-${field.id}`}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Clear
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={handleSaveSignature}
                        data-testid={`button-save-signature-${field.id}`}
                      >
                        <Save className="w-4 h-4 mr-2" />
                        Save Signature
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Draw your signature above and click "Save Signature" to capture it.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        );

      default:
        return (
          <Input
            value={localValue || ""}
            onChange={(e) => handleValueChange(e.target.value)}
            placeholder={field.placeholder || "Enter value"}
            data-testid={`input-default-${field.id}`}
          />
        );
    }
  };

  return (
    <div className="space-y-3" data-testid={`field-widget-${field.id}`}>
      <Label className="text-base font-medium flex items-center gap-2">
        {field.label}
        {field.required && <span className="text-destructive">*</span>}
      </Label>

      {renderField()}

      {/* Condition Rating */}
      {field.includeCondition && (
        <div className="pt-2">
          <Label className="text-sm font-medium">Condition</Label>
          <Select value={localCondition || ""} onValueChange={handleConditionChange}>
            <SelectTrigger data-testid={`select-condition-${field.id}`} className="mt-1">
              <SelectValue placeholder="Select condition" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Excellent">Excellent</SelectItem>
              <SelectItem value="Good">Good</SelectItem>
              <SelectItem value="Poor">Poor</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Cleanliness Rating */}
      {field.includeCleanliness && (
        <div className="pt-2">
          <Label className="text-sm font-medium">Cleanliness</Label>
          <Select value={localCleanliness || ""} onValueChange={handleCleanlinessChange}>
            <SelectTrigger data-testid={`select-cleanliness-${field.id}`} className="mt-1">
              <SelectValue placeholder="Select cleanliness" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Clean">Clean</SelectItem>
              <SelectItem value="Needs a Clean">Needs a Clean</SelectItem>
              <SelectItem value="Poor">Poor</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* InspectAI Button - only show when photos exist */}
      {inspectionId && localPhotos.length > 0 && (
        <div className="pt-2">
          <Button
            type="button"
            variant="default"
            onClick={handleInspectField}
            disabled={analyzingField}
            data-testid={`button-inspect-ai-${field.id}`}
            className="w-full"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            {analyzingField ? "Analyzing..." : "InspectAI"}
          </Button>
          <p className="text-xs text-muted-foreground mt-1">
            {analyzingField 
              ? "Analyzing images with AI..."
              : "Use AI to analyze all photos and generate a detailed inspection report"}
          </p>
        </div>
      )}

      {/* Optional notes */}
      <div className="pt-2">
        <Label htmlFor={`note-${field.id}`} className="text-sm text-muted-foreground">
          Notes (optional)
        </Label>
        <Textarea
          id={`note-${field.id}`}
          value={localNote}
          onChange={(e) => handleNoteChange(e.target.value)}
          placeholder="Add any observations or notes..."
          rows={2}
          className="mt-1"
          data-testid={`textarea-note-${field.id}`}
        />
      </div>

      {/* Mark for Review - Only for Check Out inspections WITH photos */}
      {isCheckOut && localPhotos.length > 0 && (
        <div className="pt-3 flex items-center space-x-2">
          <Checkbox
            id={`mark-review-${field.id}`}
            checked={localMarkedForReview}
            onCheckedChange={(checked) => {
              const isChecked = checked === true;
              setLocalMarkedForReview(isChecked);
              onMarkedForReviewChange?.(isChecked);
            }}
            data-testid={`checkbox-mark-review-${field.id}`}
          />
          <Label 
            htmlFor={`mark-review-${field.id}`} 
            className="text-sm font-medium cursor-pointer"
          >
            Mark for Comparison Report
          </Label>
        </div>
      )}
    </div>
  );
}
