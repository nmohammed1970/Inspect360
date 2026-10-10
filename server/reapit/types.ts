export type ReapitEntityType = "property" | "contact" | "landlord" | "tenancy";

export type TokenBundle = {
  accessToken?: string;
  refreshToken?: string;
  accessExpiresAt?: number;
  tokenType?: string;
};

export type PagedResponse<T> = {
  pageNumber?: number;
  pageSize?: number;
  pageCount?: number;
  totalPageCount?: number;
  totalCount?: number;
  _embedded?: T[];
};

export type ReapitAddress = {
  buildingName?: string;
  buildingNumber?: string;
  line1?: string;
  line2?: string;
  line3?: string;
  line4?: string;
  postcode?: string;
  countryId?: string;
};

export type ReapitProperty = {
  id?: string;
  marketingMode?: string;
  type?: string[];
  style?: string[];
  address?: ReapitAddress;
  letting?: Record<string, unknown> | null;
  selling?: Record<string, unknown> | null;
  bedrooms?: number;
  archived?: boolean;
};

export type ReapitContact = {
  id?: string;
  forename?: string;
  surname?: string;
  title?: string;
  email?: string;
  mobilePhone?: string;
  homePhone?: string;
  workPhone?: string;
  primaryAddress?: ReapitAddress;
};

export type ReapitRelated = {
  associatedType?: string;
  associatedId?: string;
};

export type ReapitLandlord = {
  id?: string;
  related?: ReapitRelated[];
};

export type ReapitTenancy = {
  id?: string;
  propertyId?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  rent?: number | string;
  rentFrequency?: string;
  deposit?: number | string;
  related?: ReapitRelated[];
  isDeleted?: boolean;
};

export type ReapitWebhookPayload = {
  eventId?: string;
  topicId?: string;
  customerId?: string;
  entityId?: string;
  new?: { id?: string; [k: string]: unknown };
};

export type SyncCounters = {
  propertiesCreated?: number;
  propertiesUpdated?: number;
  propertiesSkipped?: number;
  propertiesFailed?: number;
  contactsCreated?: number;
  contactsUpdated?: number;
  contactsFailed?: number;
  landlordsCreated?: number;
  landlordsUpdated?: number;
  landlordsFailed?: number;
  tenanciesCreated?: number;
  tenanciesUpdated?: number;
  tenanciesFailed?: number;
};
