import { createContext, useContext, ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { getCurrencyForCountry, getDateFormatForCountry, getDateTimeFormatForCountry, getDateFnsLocale, CURRENCY_SYMBOLS, formatCurrency as formatCurrencyUtil } from "@shared/countryUtils";
import { format as dateFnsFormat } from "date-fns";

interface LocaleContextType {
  countryCode: string;
  currency: "GBP" | "USD" | "AED";
  currencySymbol: string;
  dateFormat: string;
  dateTimeFormat: string;
  formatCurrency: (amount: number, minorUnits?: boolean) => string;
  formatDate: (date: Date | string | number, formatStr?: string) => string;
  formatDateTime: (date: Date | string | number) => string;
}

const LocaleContext = createContext<LocaleContextType | undefined>(undefined);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  
  // Get country code from user's organization, default to GB
  // The user object has organizationCountryCode added by the API
  const countryCode = (user as any)?.organizationCountryCode || "GB";
  const currency = getCurrencyForCountry(countryCode);
  const currencySymbol = CURRENCY_SYMBOLS[currency];
  const dateFormat = getDateFormatForCountry(countryCode);
  const dateTimeFormat = getDateTimeFormatForCountry(countryCode);
  
  const formatCurrency = (amount: number, minorUnits: boolean = true): string => {
    return formatCurrencyUtil(amount, currency, minorUnits);
  };
  
  const dfLocale = getDateFnsLocale(countryCode);

  const formatDate = (date: Date | string | number, formatStr?: string): string => {
    const dateObj = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
    return dateFnsFormat(dateObj, formatStr || dateFormat, { locale: dfLocale });
  };
  
  const formatDateTime = (date: Date | string | number): string => {
    const dateObj = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
    return dateFnsFormat(dateObj, dateTimeFormat, { locale: dfLocale });
  };
  
  return (
    <LocaleContext.Provider
      value={{
        countryCode,
        currency,
        currencySymbol,
        dateFormat,
        dateTimeFormat,
        formatCurrency,
        formatDate,
        formatDateTime,
      }}
    >
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (context === undefined) {
    throw new Error("useLocale must be used within a LocaleProvider");
  }
  return context;
}
