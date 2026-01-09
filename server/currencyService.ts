// Currency conversion service using exchangerate-api.com (free tier)
// Free tier allows 1,500 requests/month without API key

interface ExchangeRates {
  [currency: string]: number;
}

interface ExchangeRateResponse {
  rates: ExchangeRates;
  base: string;
  date: string;
}

// Cache for exchange rates (refresh every hour)
let exchangeRateCache: {
  rates: ExchangeRates;
  timestamp: number;
} | null = null;

const CACHE_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds
const BASE_CURRENCY = "GBP"; // All prices are stored in GBP

export class CurrencyService {
  /**
   * Get exchange rates from API or cache
   */
  async getExchangeRates(): Promise<ExchangeRates> {
    // Check cache first
    if (exchangeRateCache && Date.now() - exchangeRateCache.timestamp < CACHE_DURATION) {
      return exchangeRateCache.rates;
    }

    try {
      // Use exchangerate-api.com free endpoint (no API key needed for basic usage)
      // Alternative: https://api.exchangerate-api.com/v4/latest/GBP
      const response = await fetch("https://api.exchangerate-api.com/v4/latest/GBP", {
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Exchange rate API error: ${response.status}`);
      }

      const data: ExchangeRateResponse = await response.json();
      
      // Cache the rates
      exchangeRateCache = {
        rates: data.rates,
        timestamp: Date.now(),
      };

      return data.rates;
    } catch (error) {
      console.error("[CurrencyService] Error fetching exchange rates:", error);
      
      // Fallback to cache if available (even if stale)
      if (exchangeRateCache) {
        console.warn("[CurrencyService] Using stale cache due to API error");
        return exchangeRateCache.rates;
      }

      // Final fallback: return hardcoded approximate rates
      console.warn("[CurrencyService] Using hardcoded fallback rates");
      return {
        USD: 1.27, // Approximate GBP to USD
        EUR: 1.17, // Approximate GBP to EUR
        AED: 4.67, // Approximate GBP to AED
        GBP: 1.0,
      };
    }
  }

  /**
   * Convert amount from GBP (base currency) to target currency
   * @param amount Amount in GBP (minor units - pence/cents)
   * @param targetCurrency Target currency code (USD, EUR, AED, etc.)
   * @returns Converted amount in target currency (minor units)
   */
  async convertFromGBP(amount: number, targetCurrency: string): Promise<number> {
    // If target is GBP, no conversion needed
    if (targetCurrency.toUpperCase() === "GBP") {
      return amount;
    }

    const rates = await this.getExchangeRates();
    const rate = rates[targetCurrency.toUpperCase()];

    if (!rate) {
      console.warn(`[CurrencyService] No exchange rate found for ${targetCurrency}, using GBP`);
      return amount;
    }

    // Convert and round to nearest minor unit (pence/cents)
    return Math.round(amount * rate);
  }

  /**
   * Convert amount from source currency to GBP (base currency)
   * @param amount Amount in source currency (minor units)
   * @param sourceCurrency Source currency code
   * @returns Converted amount in GBP (minor units)
   */
  async convertToGBP(amount: number, sourceCurrency: string): Promise<number> {
    // If source is GBP, no conversion needed
    if (sourceCurrency.toUpperCase() === "GBP") {
      return amount;
    }

    const rates = await this.getExchangeRates();
    const rate = rates[sourceCurrency.toUpperCase()];

    if (!rate) {
      console.warn(`[CurrencyService] No exchange rate found for ${sourceCurrency}, using GBP`);
      return amount;
    }

    // Convert back to GBP: amount / rate
    return Math.round(amount / rate);
  }

  /**
   * Convert amount between any two currencies
   * @param amount Amount in source currency (minor units)
   * @param sourceCurrency Source currency code
   * @param targetCurrency Target currency code
   * @returns Converted amount in target currency (minor units)
   */
  async convert(amount: number, sourceCurrency: string, targetCurrency: string): Promise<number> {
    if (sourceCurrency.toUpperCase() === targetCurrency.toUpperCase()) {
      return amount;
    }

    // Convert to GBP first, then to target currency
    const gbpAmount = await this.convertToGBP(amount, sourceCurrency);
    return await this.convertFromGBP(gbpAmount, targetCurrency);
  }

  /**
   * Get exchange rate for a specific currency pair
   */
  async getRate(fromCurrency: string, toCurrency: string): Promise<number> {
    if (fromCurrency.toUpperCase() === toCurrency.toUpperCase()) {
      return 1.0;
    }

    const rates = await this.getExchangeRates();
    
    // If converting from GBP
    if (fromCurrency.toUpperCase() === "GBP") {
      return rates[toCurrency.toUpperCase()] || 1.0;
    }

    // If converting to GBP
    if (toCurrency.toUpperCase() === "GBP") {
      const fromRate = rates[fromCurrency.toUpperCase()];
      return fromRate ? 1.0 / fromRate : 1.0;
    }

    // Convert between two non-GBP currencies via GBP
    const fromRate = rates[fromCurrency.toUpperCase()];
    const toRate = rates[toCurrency.toUpperCase()];
    
    if (!fromRate || !toRate) {
      return 1.0;
    }

    return toRate / fromRate;
  }
}

export const currencyService = new CurrencyService();

