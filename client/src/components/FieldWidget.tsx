import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Star, Upload, Calendar, Clock, MapPin } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

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
  onChange: (value: any, note?: string, photos?: string[]) => void;
}

export function FieldWidget({ field, value, note, photos, onChange }: FieldWidgetProps) {
  const [localNote, setLocalNote] = useState(note || "");
  const [localPhotos, setLocalPhotos] = useState<string[]>(photos || []);

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

  const renderField = () => {
    switch (field.type) {
      case "short_text":
        return (
          <Input
            value={value || ""}
            onChange={(e) => handleValueChange(e.target.value)}
            placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
            data-testid={`input-${field.id}`}
          />
        );

      case "long_text":
        return (
          <Textarea
            value={value || ""}
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
            value={value || ""}
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
              checked={value || false}
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
              value={value || ""}
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
              value={value || ""}
              onChange={(e) => handleValueChange(e.target.value)}
              data-testid={`input-time-${field.id}`}
            />
          </div>
        );

      case "datetime":
        return (
          <Input
            type="datetime-local"
            value={value || ""}
            onChange={(e) => handleValueChange(e.target.value)}
            data-testid={`input-datetime-${field.id}`}
          />
        );

      case "photo":
      case "photo_array":
        return (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <Upload className="w-8 h-8 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Photo upload coming soon</p>
                  <p className="text-xs text-muted-foreground">
                    Integration with Uppy will be added in the next task
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        );

      case "video":
        return (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <Upload className="w-8 h-8 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Video upload coming soon</p>
                  <p className="text-xs text-muted-foreground">
                    Video upload will be added in the next task
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        );

      case "gps":
        return (
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-muted-foreground" />
            <Input
              value={value || ""}
              onChange={(e) => handleValueChange(e.target.value)}
              placeholder="Latitude, Longitude"
              data-testid={`input-gps-${field.id}`}
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
    </div>
  );
}
