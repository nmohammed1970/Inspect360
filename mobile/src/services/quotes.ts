import { apiRequestJson } from './api';

export interface QuoteLine {
  id?: string;
  name: string;
  description?: string | null;
  sku?: string | null;
  category: string;
  unit: string;
  quantity: number;
  unitPriceMinor: number;
  vatRate: string;
  lineNetMinor?: number;
  lineTaxMinor?: number;
  lineTotalMinor?: number;
  priceBookItemId?: string | null;
  sortOrder?: number;
}

export interface MaintenanceQuote {
  id: string;
  workOrderId: string;
  organizationId?: string;
  status: string;
  quoteReference: string;
  versionNumber: number;
  currency: string;
  recipientUserId?: string | null;
  recipientName?: string | null;
  recipientEmail?: string | null;
  recipientPhone?: string | null;
  recipientAddress?: string | null;
  scopeDescription?: string | null;
  notes?: string | null;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  lines?: QuoteLine[];
  context?: {
    issueTitle?: string | null;
    locationLabel?: string | null;
  } | null;
}

export interface PriceBookItem {
  id: string;
  name: string;
  sku?: string | null;
  description?: string | null;
  unit: string;
  category: string;
  vatRate: string;
  currency: string;
  defaultUnitPriceMinor: number;
  active?: boolean;
}

export type QuoteLineWrite = {
  name: string;
  description?: string | null;
  sku?: string | null;
  category: string;
  unit: string;
  quantity: number;
  unitPriceMinor: number;
  vatRate: string;
  priceBookItemId?: string | null;
};

export const quotesService = {
  async listQuotes(workOrderId: string): Promise<MaintenanceQuote[]> {
    return apiRequestJson<MaintenanceQuote[]>(
      'GET',
      `/api/work-orders/${workOrderId}/quotes`,
    );
  },

  async createQuote(workOrderId: string): Promise<MaintenanceQuote> {
    return apiRequestJson<MaintenanceQuote>(
      'POST',
      `/api/work-orders/${workOrderId}/quotes`,
    );
  },

  async getQuote(workOrderId: string, quoteId: string): Promise<MaintenanceQuote> {
    return apiRequestJson<MaintenanceQuote>(
      'GET',
      `/api/work-orders/${workOrderId}/quotes/${quoteId}`,
    );
  },

  async patchQuote(
    workOrderId: string,
    quoteId: string,
    body: {
      recipientUserId?: string | null;
      recipientName?: string | null;
      recipientEmail?: string | null;
      recipientPhone?: string | null;
      recipientAddress?: string | null;
      scopeDescription?: string | null;
      notes?: string | null;
    },
  ): Promise<MaintenanceQuote> {
    return apiRequestJson<MaintenanceQuote>(
      'PATCH',
      `/api/work-orders/${workOrderId}/quotes/${quoteId}`,
      body,
    );
  },

  async getCustomerCandidates(workOrderId: string): Promise<{
    candidates: Array<{
      id: string;
      displayName: string;
      email: string | null;
      phone: string | null;
    }>;
    defaultRecipient: {
      recipientUserId: string | null;
      recipientName: string | null;
      recipientEmail: string | null;
      recipientPhone: string | null;
    } | null;
  }> {
    return apiRequestJson(
      'GET',
      `/api/work-orders/${workOrderId}/customer-candidates`,
    );
  },

  async putLines(
    workOrderId: string,
    quoteId: string,
    lines: QuoteLineWrite[],
  ): Promise<MaintenanceQuote> {
    return apiRequestJson<MaintenanceQuote>(
      'PUT',
      `/api/work-orders/${workOrderId}/quotes/${quoteId}/lines`,
      { lines },
    );
  },

  async submitQuote(workOrderId: string, quoteId: string): Promise<MaintenanceQuote> {
    return apiRequestJson<MaintenanceQuote>(
      'POST',
      `/api/work-orders/${workOrderId}/quotes/${quoteId}/submit`,
    );
  },

  async searchPriceBook(params: {
    currency?: string;
    q?: string;
    active?: boolean;
  }): Promise<PriceBookItem[]> {
    const search = new URLSearchParams();
    if (params.currency) search.set('currency', params.currency);
    if (params.q?.trim()) search.set('q', params.q.trim());
    if (params.active !== undefined) search.set('active', String(params.active));
    const qs = search.toString();
    return apiRequestJson<PriceBookItem[]>(
      'GET',
      `/api/maintenance/price-book-items${qs ? `?${qs}` : ''}`,
    );
  },
};
