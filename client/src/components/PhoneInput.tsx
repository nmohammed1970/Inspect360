import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLocale } from "@/contexts/LocaleContext";
import {
  getPhoneCodeForCountry,
  parsePhoneNumber,
  combinePhoneNumber,
  normalizePhoneForStorage,
  getPhoneCodeOptions,
} from "@shared/phoneCountryCodes";

interface PhoneInputProps {
  value?: string | null;
  onChange?: (value: string) => void;
  onCountryCodeChange?: (countryCode: string) => void;
  onNumberChange?: (number: string) => void;
  id?: string;
  name?: string;
  label?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  "data-testid"?: string;
  field?: {
    value?: string | null;
    onChange?: (value: string) => void;
  };
}

function emitValue(countryCode: string, number: string): string {
  const combined = combinePhoneNumber(countryCode, number);
  if (!combined) return "";
  return normalizePhoneForStorage(combined) || combined;
}

export function PhoneInput({
  value: controlledValue,
  onChange,
  onCountryCodeChange,
  onNumberChange,
  id,
  name,
  label,
  placeholder,
  className,
  disabled,
  "data-testid": dataTestId,
  field,
}: PhoneInputProps) {
  const { countryCode: userCountryCode } = useLocale();
  const defaultPhoneCode = getPhoneCodeForCountry(userCountryCode);
  const phoneCodeOptions = getPhoneCodeOptions();

  const phoneValue = controlledValue ?? field?.value ?? "";
  const parsed = parsePhoneNumber(phoneValue);
  const initialCountryCode =
    phoneValue && parsed.countryCode ? parsed.countryCode : defaultPhoneCode;
  const [countryCode, setCountryCode] = useState(initialCountryCode);
  const [number, setNumber] = useState(parsed.number || "");

  useEffect(() => {
    const next = parsePhoneNumber(phoneValue);
    if (phoneValue && next.countryCode) {
      setCountryCode(next.countryCode);
    } else if (!phoneValue) {
      setCountryCode(defaultPhoneCode);
    }
    setNumber(next.number || "");
  }, [phoneValue, defaultPhoneCode]);

  const pushValue = (nextCode: string, nextNumber: string) => {
    const value = emitValue(nextCode, nextNumber);
    field?.onChange?.(value);
    onChange?.(value);
  };

  const handleCountryCodeChange = (newCountryCode: string) => {
    setCountryCode(newCountryCode);
    pushValue(newCountryCode, number);
    onCountryCodeChange?.(newCountryCode);
  };

  const handleNumberChange = (newNumber: string) => {
    setNumber(newNumber);
    pushValue(countryCode, newNumber);
    onNumberChange?.(newNumber);
  };

  const displayLabel = label || "Phone Number";
  const displayPlaceholder = placeholder || "7123456789";
  const displayId = id || name || "phone";

  // Ensure current code appears even if not in the static list
  const options =
    countryCode && !phoneCodeOptions.some((o) => o.code === countryCode)
      ? [{ code: countryCode, label: countryCode }, ...phoneCodeOptions]
      : phoneCodeOptions;

  return (
    <div className={className}>
      {label && <Label htmlFor={displayId}>{displayLabel}</Label>}
      <div className="grid grid-cols-3 gap-2">
        <div>
          {!label && (
            <Label htmlFor={`${displayId}-country-code`} className="sr-only">
              Country Code
            </Label>
          )}
          <Select
            value={countryCode}
            onValueChange={handleCountryCodeChange}
            disabled={disabled}
          >
            <SelectTrigger
              id={`${displayId}-country-code`}
              name={name ? `${name}CountryCode` : undefined}
              data-testid={dataTestId ? `${dataTestId}-country-code` : undefined}
              className="h-10"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.code} value={option.code}>
                  {option.code} {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2">
          {!label && (
            <Label htmlFor={displayId} className="sr-only">
              {displayLabel}
            </Label>
          )}
          <Input
            id={displayId}
            type="tel"
            value={number}
            onChange={(e) => handleNumberChange(e.target.value)}
            placeholder={displayPlaceholder}
            disabled={disabled}
            data-testid={dataTestId ? `${dataTestId}-number` : dataTestId}
          />
        </div>
      </div>
      {name && (
        <input
          type="hidden"
          name={name}
          value={emitValue(countryCode, number)}
        />
      )}
    </div>
  );
}
