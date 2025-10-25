import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Star, Upload, Calendar, Clock, MapPin, X, Image as ImageIcon, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import Uppy from "@uppy/core";
import { Dashboard } from "@uppy/react";
import AwsS3 from "@uppy/aws-s3";
import Webcam from "@uppy/webcam";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface TemplateField {
  id: string;
  label: string;
  type: string;
  required?: boolean;
  placeholder?: string;
  options?: string[];
  validation?: Record<string, any>;
  dependsOn?: Record<string, any>;
}

interface FieldWidgetProps {
  field: TemplateField;
  value?: any;
  note?: string;
  photos?: string[];
  inspectionId?: string;
  entryId?: string;
  onChange: (value: any, note?: string, photos?: string[]) => void;
}

export function FieldWidget({ field, value, note, photos, inspectionId, entryId, onChange }: FieldWidgetProps) {
  const [localNote, setLocalNote] = useState(note || "");
  const [localPhotos, setLocalPhotos] = useState<string[]>(photos || []);
  const [showPhotoUpload, setShowPhotoUpload] = useState(false);
  const [aiAnalyses, setAiAnalyses] = useState<Record<string, any>>({});
  const [analyzingPhoto, setAnalyzingPhoto] = useState<string | null>(null);
  const { toast } = useToast();

  // Rehydrate local state when props change (e.g., when existing entries load)
  useEffect(() => {
    setLocalNote(note || "");
  }, [note]);

  useEffect(() => {
    setLocalPhotos(photos || []);
  }, [photos]);

  const handleValueChange = (newValue: any) => {
    onChange(newValue, localNote || undefined, localPhotos.length > 0 ? localPhotos : undefined);
  };

  const handleNoteChange = (newNote: string) => {
    setLocalNote(newNote);
    onChange(value, newNote || undefined, localPhotos.length > 0 ? localPhotos : undefined);
  };

  const handlePhotoAdd = (photoUrl: string) => {
    const newPhotos = field.type === "photo" ? [photoUrl] : [...localPhotos, photoUrl];
    setLocalPhotos(newPhotos);
    onChange(value, localNote || undefined, newPhotos);
    toast({
      title: "Success",
      description: "Photo uploaded successfully",
    });
  };

  const handlePhotoRemove = (photoUrl: string) => {
    const newPhotos = localPhotos.filter((p) => p !== photoUrl);
    setLocalPhotos(newPhotos);
    onChange(value, localNote || undefined, newPhotos.length > 0 ? newPhotos : undefined);
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
      })
      .use(AwsS3, {
        shouldUseMultipart: false,
        async getUploadParameters(file: any) {
          const response = await fetch("/api/objects/upload", {
            method: "POST",
            credentials: "include",
          });
          const { uploadURL } = await response.json();
          return {
            method: "PUT" as const,
            url: uploadURL,
            headers: {
              "Content-Type": file.type || "application/octet-stream",
            },
          };
        },
      });

    uppy.on("upload-success", (_file: any, response: any) => {
      const uploadUrl = response?.uploadURL || response?.body?.uploadURL;
      if (uploadUrl) {
        const photoUrl = uploadUrl.split("?")[0];
        handlePhotoAdd(photoUrl);
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
        const response = await fetch("/api/objects/upload", {
          method: "POST",
          credentials: "include",
        });
        const { uploadURL } = await response.json();
        return {
          method: "PUT" as const,
          url: uploadURL,
          headers: {
            "Content-Type": file.type || "application/octet-stream",
          },
        };
      },
    });

    uppy.on("upload-success", (_file: any, response: any) => {
      const uploadUrl = response?.uploadURL || response?.body?.uploadURL;
      if (uploadUrl) {
        const videoUrl = uploadUrl.split("?")[0];
        handleValueChange(videoUrl);
        toast({
          title: "Success",
          description: "Video uploaded successfully",
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
            value={value || ""}
            onChange={(e) => handleValueChange(e.target.value)}
            placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
            data-testid={`input-${field.key}`}
          />
        );

      case "long_text":
        return (
          <Textarea
            value={value || ""}
            onChange={(e) => handleValueChange(e.target.value)}
            placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
            rows={4}
            data-testid={`textarea-${field.key}`}
          />
        );

      case "number":
        return (
          <Input
            type="number"
            value={value || ""}
            onChange={(e) => handleValueChange(parseFloat(e.target.value) || 0)}
            placeholder={field.placeholder || "Enter number"}
            data-testid={`input-number-${field.key}`}
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
                data-testid={`button-rating-${rating}-${field.key}`}
              >
                <Star
                  className={`w-8 h-8 ${
                    (value || 0) >= rating
                      ? "fill-primary text-primary"
                      : "text-muted-foreground"
                  }`}
                />
              </button>
            ))}
            {value > 0 && (
              <span className="ml-2 text-sm text-muted-foreground">
                {value} / 5
              </span>
            )}
          </div>
        );

      case "select":
        return (
          <Select value={value || ""} onValueChange={handleValueChange}>
            <SelectTrigger data-testid={`select-${field.key}`}>
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
        const selectedValues = value || [];
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
              <SelectTrigger data-testid={`select-multiselect-${field.key}`}>
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
              checked={value || false}
              onCheckedChange={handleValueChange}
              data-testid={`checkbox-${field.key}`}
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
              value={value || ""}
              onChange={(e) => handleValueChange(e.target.value)}
              data-testid={`input-date-${field.key}`}
            />
          </div>
        );

      case "time":
        return (
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <Input
              type="time"
              value={value || ""}
              onChange={(e) => handleValueChange(e.target.value)}
              data-testid={`input-time-${field.key}`}
            />
          </div>
        );

      case "datetime":
        return (
          <Input
            type="datetime-local"
            value={value || ""}
            onChange={(e) => handleValueChange(e.target.value)}
            data-testid={`input-datetime-${field.key}`}
          />
        );

      case "photo":
      case "photo_array":
        return (
          <div className="space-y-3">
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
              data-testid={`button-upload-photo-${field.key}`}
            >
              <Upload className="w-4 h-4 mr-2" />
              {localPhotos.length > 0 ? "Add More Photos" : "Upload Photo"}
            </Button>
            {showPhotoUpload && (
              <Dashboard
                uppy={createPhotoUppy()}
                proudlyDisplayPoweredByUppy={false}
                height={300}
              />
            )}
          </div>
        );

      case "video":
        return (
          <div className="space-y-3">
            {value && (
              <video
                src={value}
                controls
                className="w-full max-h-64 rounded-lg"
                data-testid={`video-preview-${field.key}`}
              />
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowPhotoUpload(true)}
              data-testid={`button-upload-video-${field.key}`}
            >
              <Upload className="w-4 h-4 mr-2" />
              {value ? "Replace Video" : "Upload Video"}
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
              value={value || ""}
              onChange={(e) => handleValueChange(e.target.value)}
              placeholder="Latitude, Longitude"
              data-testid={`input-gps-${field.key}`}
            />
          </div>
        );

      case "signature":
        return (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="w-8 h-8 rounded border-2 border-dashed flex items-center justify-center text-muted-foreground">
                  ✍
                </div>
                <div>
                  <p className="text-sm font-medium">Signature capture coming soon</p>
                  <p className="text-xs text-muted-foreground">
                    Signature pad will be added in the next task
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        );

      default:
        return (
          <Input
            value={value || ""}
            onChange={(e) => handleValueChange(e.target.value)}
            placeholder={field.placeholder || "Enter value"}
            data-testid={`input-default-${field.key}`}
          />
        );
    }
  };

  return (
    <div className="space-y-3" data-testid={`field-widget-${field.key}`}>
      <Label className="text-base font-medium flex items-center gap-2">
        {field.label}
        {field.required && <span className="text-destructive">*</span>}
      </Label>

      {renderField()}

      {/* Optional notes */}
      <div className="pt-2">
        <Label htmlFor={`note-${field.key}`} className="text-sm text-muted-foreground">
          Notes (optional)
        </Label>
        <Textarea
          id={`note-${field.key}`}
          value={localNote}
          onChange={(e) => handleNoteChange(e.target.value)}
          placeholder="Add any observations or notes..."
          rows={2}
          className="mt-1"
          data-testid={`textarea-note-${field.key}`}
        />
      </div>
    </div>
  );
}
