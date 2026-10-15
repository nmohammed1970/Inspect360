/**
 * Standard General Information section seeded into newly created templates.
 * Field ids use field_general_* so any template type can share them.
 * Bedroom/bathroom count fields match isBedroomCountField / isBathroomCountField.
 */

export type DefaultGeneralInfoField = {
  id: string;
  key: string;
  label: string;
  type: string;
  required?: boolean;
};

export type DefaultGeneralInfoSection = {
  id: string;
  title: string;
  repeatable?: boolean;
  fields: DefaultGeneralInfoField[];
};

export function defaultGeneralInformationSection(): DefaultGeneralInfoSection {
  return {
    id: "section_general_info",
    title: "General Information",
    repeatable: false,
    fields: [
      {
        id: "field_general_property_address",
        key: "field_general_property_address",
        label: "Property Address",
        type: "auto_address",
        required: true,
      },
      {
        id: "field_general_tenant_name",
        key: "field_general_tenant_name",
        label: "Tenant Name",
        type: "auto_tenant_names",
        required: false,
      },
      {
        id: "field_general_inspection_date",
        key: "field_general_inspection_date",
        label: "Date of Inspection",
        type: "auto_inspection_date",
        required: true,
      },
      {
        id: "field_general_inspector_name",
        key: "field_general_inspector_name",
        label: "Inspector Name",
        type: "auto_inspector",
        required: false,
      },
      {
        id: "field_general_num_bedrooms",
        key: "field_general_num_bedrooms",
        label: "Number of Bedrooms",
        type: "auto_bedroom_count",
        required: true,
      },
      {
        id: "field_general_num_bathrooms",
        key: "field_general_num_bathrooms",
        label: "Number of Bathrooms",
        type: "auto_bathroom_count",
        required: true,
      },
    ],
  };
}

export function isGeneralInformationSection(section: {
  id?: string;
  title?: string;
} | null | undefined): boolean {
  if (!section) return false;
  const id = String(section.id || "").toLowerCase();
  const title = String(section.title || "").toLowerCase().trim();
  return (
    id.includes("general_info") ||
    id.includes("general-info") ||
    title === "general information"
  );
}
